import nodemailer from "nodemailer";
import { env } from "./env";

export const buildMailTransport = () =>
  nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.SENDER_EMAIL,
      pass: env.GMAIL_APP_PASSWORD,
    },
  });
