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
