import { Pool } from "pg";
import dayjs from "dayjs";
import { env } from "../lib/env";
import { CsvRow, DetailsStatus, JobDetails, JobRecord } from "../types";

export const clearJobs = async (pool: Pool) => {
  await pool.query(`TRUNCATE TABLE jobs`);
};

export const upsertJob = async (
  pool: Pool,
  row: CsvRow,
  runStartedAt: string,
) => {
  await pool.query(
    `INSERT INTO jobs (link, role_name, primary_industry, company, scrape_datetime, scrape_date, last_seen_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     ON CONFLICT (link) DO UPDATE SET
       role_name = EXCLUDED.role_name,
       primary_industry = EXCLUDED.primary_industry,
       company = EXCLUDED.company,
       scrape_datetime = EXCLUDED.scrape_datetime,
       scrape_date = EXCLUDED.scrape_date,
       last_seen_at = EXCLUDED.last_seen_at,
       updated_at = EXCLUDED.updated_at`,
    [
      row.Link,
      row["Role Name"],
      row["Primary Industry"],
      row.Company,
      row.Scrape_DateTime || null,
      row.Scrape_Date,
      runStartedAt,
    ],
  );
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

export const selectAllCurrentJobs = async (
  pool: Pool,
  runStartedAt: string,
): Promise<JobRecord[]> => {
  const result = await pool.query<JobRecord>(
    `SELECT * FROM jobs WHERE last_seen_at >= $1 ORDER BY scrape_datetime DESC NULLS LAST`,
    [runStartedAt],
  );

  return result.rows;
};

export const selectAllJobs = async (pool: Pool): Promise<JobRecord[]> => {
  const result = await pool.query<JobRecord>(
    `SELECT * FROM jobs ORDER BY scrape_datetime DESC NULLS LAST`,
  );

  return result.rows;
};
