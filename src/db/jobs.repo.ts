import { Pool } from "pg";
import dayjs from "dayjs";
import { env } from "../lib/env";
import { CsvRow, DetailsStatus, Facet, JobDetails, JobRecord } from "../types";
import {
  buildCompanyFacetConditions,
  buildFullConditions,
  buildIndustryFacetConditions,
  JobsQueryInput,
  sortClause,
} from "./jobsQuery";

export const clearJobs = async (pool: Pool) => {
  await pool.query(`TRUNCATE TABLE jobs`);
};

// Rows must already be deduped by Link (normalizeAndDedupeRows guarantees
// this for a full ingest) — ON CONFLICT can't affect the same row twice
// within a single multi-row INSERT.
const UPSERT_JOBS_BATCH_SIZE = 500;
const UPSERT_JOBS_COLUMNS_PER_ROW = 7;

const upsertJobsBatch = async (
  pool: Pool,
  rows: CsvRow[],
  runStartedAt: string,
) => {
  const placeholders: string[] = [];
  const values: (string | null)[] = [];

  rows.forEach((row, i) => {
    const base = i * UPSERT_JOBS_COLUMNS_PER_ROW;
    const [p1, p2, p3, p4, p5, p6, p7] = Array.from(
      { length: UPSERT_JOBS_COLUMNS_PER_ROW },
      (_, offset) => `$${base + offset + 1}`,
    );

    placeholders.push(
      `(${p1}, ${p2}, ${p3}, ${p4}, ${p5}, ${p6}, ${p7}, ${p7})`,
    );
    values.push(
      row.Link,
      row["Role Name"],
      row["Primary Industry"],
      row.Company,
      row.Scrape_DateTime || null,
      row.Scrape_Date,
      runStartedAt,
    );
  });

  await pool.query(
    `INSERT INTO jobs (link, role_name, primary_industry, company, scrape_datetime, scrape_date, last_seen_at, updated_at)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (link) DO UPDATE SET
       role_name = EXCLUDED.role_name,
       primary_industry = EXCLUDED.primary_industry,
       company = EXCLUDED.company,
       scrape_datetime = EXCLUDED.scrape_datetime,
       scrape_date = EXCLUDED.scrape_date,
       last_seen_at = EXCLUDED.last_seen_at,
       updated_at = EXCLUDED.updated_at`,
    values,
  );
};

export const upsertJobs = async (
  pool: Pool,
  rows: CsvRow[],
  runStartedAt: string,
) => {
  for (let i = 0; i < rows.length; i += UPSERT_JOBS_BATCH_SIZE) {
    await upsertJobsBatch(
      pool,
      rows.slice(i, i + UPSERT_JOBS_BATCH_SIZE),
      runStartedAt,
    );
  }
};

export const selectRowsToEnrich = async (pool: Pool): Promise<JobRecord[]> => {
  const okCutoff = dayjs()
    .subtract(env.DETAILS_OK_TTL_HOURS, "hour")
    .toISOString();
  const failedCutoff = dayjs()
    .subtract(env.DETAILS_RETRY_HOURS, "hour")
    .toISOString();

  const result = await pool.query<JobRecord>(
    `SELECT * FROM jobs
     WHERE details_status = 'pending'
        OR (details_status = 'failed' AND details_fetched_at < $1)
        OR (details_status = 'ok' AND details_fetched_at < $2)`,
    [failedCutoff, okCutoff],
  );

  return result.rows;
};

export const writeJobDetails = async (
  pool: Pool,
  link: string,
  status: DetailsStatus,
  details: JobDetails | null,
) => {
  await pool.query(
    `UPDATE jobs SET details = $1, details_status = $2, details_fetched_at = $3, updated_at = $3 WHERE link = $4`,
    [
      details ? JSON.stringify(details) : null,
      status,
      new Date().toISOString(),
      link,
    ],
  );
};

export interface JobsFacets {
  total: number;
  sourceScrapedAt: string | null;
  companies: Facet[];
  industries: Facet[];
  scrapDates: string[];
}

// Everything needed to render the page except the rows themselves: the
// filtered result count (for pagination) plus facets. Each facet is computed
// from every *other* active filter — picking a company narrows the industry
// list (and vice versa) — while excluding its own dimension so an already-
// applied value stays visible in its own checkbox list instead of vanishing.
export const selectJobsFacets = async (
  pool: Pool,
  input: JobsQueryInput,
): Promise<JobsFacets> => {
  const full = buildFullConditions(input);
  const forCompanies = buildCompanyFacetConditions(input);
  const forIndustries = buildIndustryFacetConditions(input);

  const [
    countResult,
    latestResult,
    companiesResult,
    industriesResult,
    scrapDatesResult,
  ] = await Promise.all([
    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM jobs WHERE ${full.clause}`,
      full.values,
    ),
    pool.query<{ latest: string | null }>(
      `SELECT MAX(last_seen_at) AS latest FROM jobs WHERE details_status IN ('ok', 'not_found')`,
    ),
    pool.query<{ value: string; count: number }>(
      `SELECT company AS value, COUNT(*)::int AS count FROM jobs
         WHERE ${forCompanies.clause} AND company IS NOT NULL AND company <> ''
         GROUP BY company ORDER BY company ASC`,
      forCompanies.values,
    ),
    pool.query<{ value: string; count: number }>(
      `SELECT primary_industry AS value, COUNT(*)::int AS count FROM jobs
         WHERE ${forIndustries.clause} AND primary_industry IS NOT NULL AND primary_industry <> ''
         GROUP BY primary_industry ORDER BY primary_industry ASC`,
      forIndustries.values,
    ),
    pool.query<{ scrape_date: string }>(
      `SELECT DISTINCT scrape_date FROM jobs
         WHERE ${full.clause} AND scrape_date IS NOT NULL AND scrape_date <> ''
         ORDER BY scrape_date DESC`,
      full.values,
    ),
  ]);

  return {
    total: countResult.rows[0]?.count ?? 0,
    sourceScrapedAt: latestResult.rows[0]?.latest ?? null,
    companies: companiesResult.rows,
    industries: industriesResult.rows,
    scrapDates: scrapDatesResult.rows.map((row) => row.scrape_date),
  };
};

// Just the filtered result count — used by the saved-search digest, which
// needs a total per saved search but never renders any rows.
export const countJobs = async (
  pool: Pool,
  input: JobsQueryInput,
): Promise<number> => {
  const { clause, values } = buildFullConditions(input);

  const result = await pool.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM jobs WHERE ${clause}`,
    values,
  );

  return result.rows[0]?.count ?? 0;
};

// The one page of rows the frontend actually renders.
export const selectJobsPage = async (
  pool: Pool,
  input: JobsQueryInput,
  page: number,
  limit: number,
): Promise<JobRecord[]> => {
  const { clause, values } = buildFullConditions(input);
  const offset = (page - 1) * limit;

  const result = await pool.query<JobRecord>(
    `SELECT * FROM jobs
     WHERE ${clause}
     ORDER BY ${sortClause(input.sort)}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );

  return result.rows;
};
