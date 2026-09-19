import { Express, Request, Response } from "express";
import { randomUUID } from "crypto";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { runIngest } from "../ingest/run";

const requireIngestAuth = (
  req: Request,
  res: Response,
  next: () => void,
): void => {
  const header = req.headers.authorization;

  if (header !== `Bearer ${env.INGEST_TRIGGER_SECRET}`) {
    res.status(401).json({ err: "Unauthorized" });
    return;
  }

  next();
};

export const ingestRoutes = (app: Express) => {
  app.post("/v1/ingest", requireIngestAuth, (req, res) => {
    const requestId = randomUUID();

    res.status(202).json({ ok: true, runId: requestId });

    runIngest().catch((err) => {
      logger.error(`Triggered ingest run ${requestId} failed`, err);
    });
  });
};
