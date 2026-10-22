import express, { Express, Request, Response } from "express";
import cors from "cors";
import cron from "node-cron";
import { env } from "./lib/env";
import { logger } from "./lib/logger";
import { instance } from "./db/client";
import { runMigrations } from "./db/migrate";
import { jobsRoutes } from "./routes/jobs";
import { statusRoutes } from "./routes/status";
import { ingestRoutes } from "./routes/ingest";
import { contactRoutes } from "./routes/contact";
import { usersRoutes } from "./routes/users";
import { savedSearchesRoutes } from "./routes/savedSearches";
import { savedJobsRoutes } from "./routes/savedJobs";
import { resumeInterruptedIngest, runIngest } from "./ingest/run";
import { runSavedSearchDigest } from "./digest/savedSearchDigest";
import { runSavedJobDigest } from "./digest/savedJobDigest";
import { runWeeklyOpportunitiesEmail } from "./digest/weeklyOpportunitiesEmail";
import { runJobTitleMatchEmail } from "./digest/jobTitleMatchEmail";

const app: Express = express();

app.use(
  cors({
    origin: env.ALLOWED_ORIGINS_LIST.length ? env.ALLOWED_ORIGINS_LIST : false,
  }),
);
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.send("BGH Scout API");
});

jobsRoutes(app);
statusRoutes(app);
ingestRoutes(app);
contactRoutes(app);
usersRoutes(app);
savedSearchesRoutes(app);
savedJobsRoutes(app);

const start = async () => {
  const pool = instance();

  await runMigrations(pool);

  app.listen(env.PORT, () => {
    logger.info(`Server is running at http://localhost:${env.PORT}`);
  });

  resumeInterruptedIngest().catch((err) =>
    logger.error("Failed to resume interrupted ingest run", err),
  );

  cron.schedule(
    env.INGEST_CRON,
    () => {
      runIngest().catch((err) =>
        logger.error("Scheduled ingest run failed", err),
      );
    },
    { timezone: "America/New_York" },
  );

  cron.schedule(
    env.SAVED_SEARCH_DIGEST_CRON,
    () => {
      runSavedSearchDigest(pool, "daily").catch((err) =>
        logger.error("Scheduled daily saved search digest run failed", err),
      );
    },
    { timezone: "America/New_York" },
  );

  cron.schedule(
    env.SAVED_SEARCH_WEEKLY_DIGEST_CRON,
    () => {
      runSavedSearchDigest(pool, "weekly").catch((err) =>
        logger.error("Scheduled weekly saved search digest run failed", err),
      );
    },
    { timezone: "America/New_York" },
  );

  cron.schedule(
    env.WEEKLY_EMAIL_CRON,
    () => {
      runWeeklyOpportunitiesEmail(pool).catch((err) =>
        logger.error("Scheduled weekly opportunities email run failed", err),
      );
    },
    { timezone: "America/New_York" },
  );

  cron.schedule(
    env.SAVED_JOB_DIGEST_CRON,
    () => {
      runSavedJobDigest(pool).catch((err) =>
        logger.error("Scheduled saved job digest run failed", err),
      );
    },
    { timezone: "America/New_York" },
  );

  cron.schedule(
    env.JOB_TITLE_MATCH_WEEKLY_CRON,
    () => {
      runJobTitleMatchEmail(pool).catch((err) =>
        logger.error("Scheduled job title match email run failed", err),
      );
    },
    { timezone: "America/New_York" },
  );
};

start().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
