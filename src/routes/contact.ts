import { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import nodemailer from "nodemailer";
import { z } from "zod";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

const contactSchema = z.object({
  kind: z.enum(["feedback", "company-request"]),
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  email: z.string().email(),
  message: z.string().min(1).max(5000),
});

const contactRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});

const buildTransport = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.SENDER_EMAIL,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });

const subjectFor = (kind: string) =>
  kind === "company-request"
    ? "New company request — BGH Scout"
    : "New feedback — BGH Scout";

const postContactHandler = async (req: Request, res: Response) => {
  const parsed = contactSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, err: "Invalid request" });
  }

  const { kind, firstName, lastName, email, message } = parsed.data;

  try {
    const transport = buildTransport();

    await transport.sendMail({
      from: env.SENDER_EMAIL,
      to: env.CONTACT_RECIPIENTS_LIST,
      replyTo: email,
      subject: subjectFor(kind),
      text: `From: ${firstName} ${lastName} <${email}>\n\n${message}`,
    });

    return res.status(202).json({ ok: true });
  } catch (err) {
    logger.error("Failed to send contact message", err);
    return res.status(500).json({ ok: false });
  }
};

export const contactRoutes = (app: Express) => {
  app.post("/v1/contact", contactRateLimit, (req, res) => {
    postContactHandler(req, res).catch(() => {
      res.status(500).json({ ok: false });
    });
  });
};
