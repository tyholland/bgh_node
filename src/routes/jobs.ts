import { Express, Request, Response } from "express";
import dayjs from "dayjs";
import { instance } from "../db/client";
import { selectAllCurrentJobs, selectAllJobs } from "../db/jobs.repo";
import { getLastSuccessfulRun } from "../db/runs.repo";
import { buildETag } from "../lib/cache";
import { JobRecord, JobRow, JobsResponse } from "../types";

const toJobRow = (record: JobRecord): JobRow => ({
  "Role Name": record.role_name,
  "Primary Industry": record.primary_industry || "",
  Scrape_DateTime: record.scrape_datetime
    ? dayjs(record.scrape_datetime).format("YYYY-MM-DD HH:mm:ss")
    : "",
  Scrape_Date: record.scrape_date || "",
  Company: record.company || "",
  Link: record.link,
  ...(record.details_status === "ok" && record.details
    ? { Details: record.details }
    : {}),
});

const getJobsHandler = async (req: Request, res: Response) => {
  const pool = instance();
  const lastRun = await getLastSuccessfulRun(pool);

  const records = lastRun
    ? await selectAllCurrentJobs(pool, lastRun.started_at)
    : await selectAllJobs(pool);

  const jobs = records.map(toJobRow);
  const enriched = records.filter((r) => r.details_status === "ok").length;
  const enrichFailed = records.filter(
    (r) => r.details_status === "failed",
  ).length;

  const body: JobsResponse = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceScrapedAt: jobs[0]?.Scrape_DateTime || null,
      total: jobs.length,
      enriched,
      enrichFailed,
    },
    jobs,
  };

  const json = JSON.stringify(body);
  const etag = buildETag(json);

  res.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  res.set("ETag", etag);

  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }

  res.type("application/json").status(200).send(json);
};

export const jobsRoutes = (app: Express) => {
  app.get("/v1/jobs", (req, res) => {
    getJobsHandler(req, res).catch((err) => {
      res.status(500).json({ err: String(err), action: "Get jobs" });
    });
  });
};
