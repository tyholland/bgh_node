import { Express, Request, Response } from "express";
import { randomUUID, timingSafeEqual } from "crypto";
import rateLimit from "express-rate-limit";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { isIngestRunning, runIngest } from "../ingest/run";

const ingestRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const secretsMatch = (provided: string, expected: string): boolean => {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);

  return a.length === b.length && timingSafeEqual(a, b);
};

const requireIngestAuth = (
  req: Request,
  res: Response,
  next: () => void,
): void => {
  const header = req.headers.authorization ?? "";
  const expected = `Bearer ${env.INGEST_TRIGGER_SECRET}`;

  if (!secretsMatch(header, expected)) {
    res.status(401).json({ err: "Unauthorized" });
    return;
  }

  next();
};

export const ingestRoutes = (app: Express) => {
  app.post("/v1/ingest", ingestRateLimit, requireIngestAuth, (req, res) => {
    if (isIngestRunning()) {
      res.status(409).json({ err: "Ingest run already in progress" });
      return;
    }

    const requestId = randomUUID();
    const clearOldJobs = req.body?.clear === true;

    res.status(202).json({ ok: true, runId: requestId });

    runIngest(clearOldJobs).catch((err) => {
      logger.error(`Triggered ingest run ${requestId} failed`, err);
    });
  });
};
