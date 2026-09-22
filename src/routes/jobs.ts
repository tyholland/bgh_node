import { Express, Request, Response } from "express";
import dayjs from "dayjs";
import { instance } from "../db/client";
import { selectJobsFacets, selectJobsPage } from "../db/jobs.repo";
import { getLastSuccessfulRun } from "../db/runs.repo";
import { buildETag } from "../lib/cache";
import { clampLimit, clampPage, JobsQueryInput } from "../db/jobsQuery";
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
