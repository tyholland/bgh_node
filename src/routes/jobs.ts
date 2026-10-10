import { Express, Request, Response } from "express";
import dayjs from "dayjs";
import { instance } from "../db/client";
import {
  selectJobById,
  selectJobsFacets,
  selectJobsPage,
} from "../db/jobs.repo";
import { getLastSuccessfulRun } from "../db/runs.repo";
import { buildETag } from "../lib/cache";
import { clampLimit, clampPage, JobsQueryInput } from "../db/jobsQuery";
import { logger } from "../lib/logger";
import { JobRecord, JobRow, JobsResponse } from "../types";

const toJobRow = (record: JobRecord): JobRow => ({
  id: record.id,
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

const asString = (value: Request["query"][string]): string =>
  typeof value === "string"
    ? value
    : Array.isArray(value)
      ? asString(value[0])
      : "";

const parseQuery = (
  req: Request,
  activeSince: string | null,
): JobsQueryInput => ({
  activeSince,
  search: asString(req.query.search),
  keyword: asString(req.query.keyword),
  company: asString(req.query.company),
  industry: asString(req.query.industry),
  date: asString(req.query.date),
  exact: asString(req.query.exact),
  sort: asString(req.query.sort),
});

const getJobsHandler = async (req: Request, res: Response) => {
  const pool = instance();
  const lastRun = await getLastSuccessfulRun(pool);
  const activeSince = lastRun ? lastRun.started_at : null;

  const query = parseQuery(req, activeSince);
  const limit = clampLimit(Number(req.query.limit));
  const requestedPage = clampPage(Number(req.query.page));

  const facets = await selectJobsFacets(pool, query);
  const totalPages = Math.max(1, Math.ceil(facets.total / limit));
  const page = Math.min(requestedPage, totalPages);

  const records = await selectJobsPage(pool, query, page, limit);
  const jobs = records.map(toJobRow);

  const body: JobsResponse = {
    meta: {
      generatedAt: new Date().toISOString(),
      sourceScrapedAt: facets.sourceScrapedAt,
    },
    jobs,
    total: facets.total,
    totalPages,
    page,
    companies: facets.companies,
    industries: facets.industries,
    scrapDates: facets.scrapDates,
  };

  // generatedAt is always "now", so it's excluded from the ETag input —
  // otherwise every response would get a distinct ETag and conditional
  // GETs (and CDN revalidation) could never actually hit a 304.
  const { meta, ...cacheableBody } = body;
  const etag = buildETag(
    JSON.stringify({ ...cacheableBody, sourceScrapedAt: meta.sourceScrapedAt }),
  );

  const json = JSON.stringify(body);

  res.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  res.set("ETag", etag);

  if (req.headers["if-none-match"] === etag) {
    return res.status(304).end();
  }

  res.type("application/json").status(200).send(json);
};

// Single job for the frontend's /jobs/[id] detail page (BACKEND_REPO_PLAN.md
// §5 in the frontend repo) — public, no auth, same as /v1/jobs. 404s for an
// unknown id *or* one that's no longer "active" (selectJobById applies the
// same details_status/last_seen_at filtering as the list endpoint), so a
// delisted job's detail page stops resolving at the same time it drops out
// of search results and the sitemap, rather than staying indexed forever.
const getJobByIdHandler = async (req: Request, res: Response) => {
  const pool = instance();
  const lastRun = await getLastSuccessfulRun(pool);
  const activeSince = lastRun ? lastRun.started_at : null;

  const record = await selectJobById(pool, req.params.id, activeSince);

  if (!record) {
    return res.status(404).json({ error: "not found" });
  }

  res.set("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  res
    .type("application/json")
    .status(200)
    .send(JSON.stringify(toJobRow(record)));
};

export const jobsRoutes = (app: Express) => {
  app.get("/v1/jobs", (req, res) => {
    getJobsHandler(req, res).catch((err) => {
      logger.error("Failed to get jobs", err);
      res
        .status(500)
        .json({ err: "Internal server error", action: "Get jobs" });
    });
  });

  app.get("/v1/jobs/:id", (req, res) => {
    getJobByIdHandler(req, res).catch((err) => {
      logger.error("Failed to get job by id", err);
      res
        .status(500)
        .json({ err: "Internal server error", action: "Get job by id" });
    });
  });
};
