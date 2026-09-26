import { Pool } from "pg";
import { IngestRun } from "../types";

export const startRun = async (pool: Pool): Promise<IngestRun> => {
  const result = await pool.query<IngestRun>(
    `INSERT INTO ingest_runs (started_at) VALUES (now()) RETURNING *`,
  );

  return result.rows[0];
};

export const finishRun = async (
  pool: Pool,
  id: string,
  fields: {
    ok: boolean;
    rowsIn: number;
    rowsEnriched: number;
    rowsFailed: number;
    error?: string;
  },
) => {
  await pool.query(
    `UPDATE ingest_runs SET finished_at = now(), ok = $1, rows_in = $2, rows_enriched = $3, rows_failed = $4, error = $5 WHERE id = $6`,
    [
      fields.ok,
      fields.rowsIn,
      fields.rowsEnriched,
      fields.rowsFailed,
      fields.error || null,
      id,
    ],
  );
};

export const getLastRun = async (pool: Pool): Promise<IngestRun | null> => {
  const result = await pool.query<IngestRun>(
    `SELECT * FROM ingest_runs ORDER BY started_at DESC LIMIT 1`,
  );

  return result.rows[0] || null;
};

export const getLastSuccessfulRun = async (
  pool: Pool,
): Promise<IngestRun | null> => {
  const result = await pool.query<IngestRun>(
    `SELECT * FROM ingest_runs WHERE ok = true ORDER BY started_at DESC LIMIT 1`,
  );

  return result.rows[0] || null;
};

// The last run needs to be picked back up if it never reached finishRun (the
// process was killed or restarted mid-run, since the in-memory isRunning lock
// never survives a restart) or if it finished but failed (ok = false) — in
// both cases there's nothing currently running, so it's safe to retry.
export const getIncompleteRun = async (
  pool: Pool,
): Promise<IngestRun | null> => {
  const lastRun = await getLastRun(pool);

  if (!lastRun || lastRun.ok === true) {
    return null;
  }

  return lastRun;
};

export const abandonRun = async (pool: Pool, id: string, error: string) => {
  await pool.query(
    `UPDATE ingest_runs SET finished_at = now(), ok = false, error = $1 WHERE id = $2`,
    [error, id],
  );
};
