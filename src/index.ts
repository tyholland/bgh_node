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
import { runIngest } from "./ingest/run";

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
};

start().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
