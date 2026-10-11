import { Pool } from "pg";
import { SavedJobRecord } from "../types";

export interface SaveJobInput {
  jobId: string;
  roleName: string;
  company: string | null | undefined;
  link: string;
}

// ON CONFLICT DO NOTHING + RETURNING returns no row when the job is already
// saved — re-select so re-saving is idempotent (200 with the existing
// record) instead of erroring.
export const insertSavedJob = async (
  pool: Pool,
  uid: string,
  job: SaveJobInput,
): Promise<SavedJobRecord> => {
  const inserted = await pool.query<SavedJobRecord>(
    `INSERT INTO saved_jobs (uid, job_id, role_name, company, link)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (uid, job_id) DO NOTHING
     RETURNING *`,
    [uid, job.jobId, job.roleName, job.company ?? null, job.link],
  );

  if (inserted.rows[0]) {
    return inserted.rows[0];
  }

  const existing = await pool.query<SavedJobRecord>(
    `SELECT * FROM saved_jobs WHERE uid = $1 AND job_id = $2`,
    [uid, job.jobId],
  );

  return existing.rows[0];
};

export const listSavedJobsByUid = async (
  pool: Pool,
  uid: string,
): Promise<SavedJobRecord[]> => {
  const result = await pool.query<SavedJobRecord>(
    `SELECT * FROM saved_jobs WHERE uid = $1 ORDER BY created_at DESC`,
    [uid],
  );

  return result.rows;
};

export const deleteSavedJob = async (
  pool: Pool,
  id: string,
  uid: string,
): Promise<boolean> => {
  const result = await pool.query(
    `DELETE FROM saved_jobs WHERE id = $1 AND uid = $2`,
    [id, uid],
  );

  return (result.rowCount || 0) > 0;
};
