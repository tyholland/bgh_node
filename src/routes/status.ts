import { Express, Request, Response } from "express";
import parser from "cron-parser";
import { instance } from "../db/client";
import { getLastRun } from "../db/runs.repo";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

const getStatusHandler = async (req: Request, res: Response) => {
  const pool = instance();
  const lastRun = await getLastRun(pool);

  let nextScheduledRun: string | null = null;

  try {
    nextScheduledRun = parser
      .parseExpression(env.INGEST_CRON, { tz: "America/New_York" })
      .next()
      .toISOString();
  } catch {
    nextScheduledRun = null;
  }

  res.status(200).json({
    lastRun: lastRun
      ? {
          startedAt: lastRun.started_at,
          finishedAt: lastRun.finished_at,
          ok: lastRun.ok,
          rowsIn: lastRun.rows_in,
          rowsEnriched: lastRun.rows_enriched,
          rowsFailed: lastRun.rows_failed,
          durationMs: lastRun.finished_at
            ? new Date(lastRun.finished_at).getTime() -
              new Date(lastRun.started_at).getTime()
            : null,
        }
      : null,
    nextScheduledRun,
  });
};

export const statusRoutes = (app: Express) => {
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/v1/status", (req, res) => {
    getStatusHandler(req, res).catch((err) => {
      logger.error("Failed to get status", err);
      res
        .status(500)
        .json({ err: "Internal server error", action: "Get status" });
    });
  });
};
