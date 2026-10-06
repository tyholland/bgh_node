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
import { resumeInterruptedIngest, runIngest } from "./ingest/run";
import { runSavedSearchDigest } from "./digest/savedSearchDigest";
import { runWeeklyOpportunitiesEmail } from "./digest/weeklyOpportunitiesEmail";
import { runSemiMonthlyUpdateEmail } from "./digest/semiMonthlyUpdateEmail";

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

const start = async () => {
  const pool = instance();

  await runMigrations(pool);

  app.listen(env.PORT, () => {
    logger.info(`Server is running at http://localhost:${env.PORT}`);
  });

  resumeInterruptedIngest().catch((err) =>
    logger.error("Failed to resume interrupted ingest run", err),
  );

  const CLEAR_JOBS_HOURS = [3];

  cron.schedule(
    env.INGEST_CRON,
    () => {
      const hour = Number(
        new Intl.DateTimeFormat("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          hourCycle: "h23",
        }).format(new Date()),
      );
      const clearOldJobs = CLEAR_JOBS_HOURS.includes(hour);

      runIngest(clearOldJobs).catch((err) =>
        logger.error("Scheduled ingest run failed", err),
      );
    },
    { timezone: "America/New_York" },
  );

  cron.schedule(
    env.SAVED_SEARCH_DIGEST_CRON,
    () => {
      runSavedSearchDigest(pool).catch((err) =>
        logger.error("Scheduled saved search digest run failed", err),
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
    env.SEMI_MONTHLY_EMAIL_CRON,
    () => {
      runSemiMonthlyUpdateEmail(pool).catch((err) =>
        logger.error("Scheduled semi-monthly update email run failed", err),
      );
    },
    { timezone: "America/New_York" },
  );
};

start().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
