import { Pool } from "pg";
import { SavedJobAlertFrequency, SavedJobRecord } from "../types";

export interface SaveJobInput {
  jobId: string;
  roleName: string;
  company: string | null | undefined;
  link: string;
  alertFrequency: SavedJobAlertFrequency;
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
    `INSERT INTO saved_jobs (uid, job_id, role_name, company, link, alert_frequency)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (uid, job_id) DO NOTHING
     RETURNING *`,
    [
      uid,
      job.jobId,
      job.roleName,
      job.company ?? null,
      job.link,
      job.alertFrequency,
    ],
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

// The only field editable after creation — role/company/link still require
// delete-and-recreate from the frontend. Scoped to the owner, same as delete.
export const updateSavedJobAlertFrequency = async (
  pool: Pool,
  id: string,
  uid: string,
  alertFrequency: SavedJobAlertFrequency,
): Promise<SavedJobRecord | null> => {
  const result = await pool.query<SavedJobRecord>(
    `UPDATE saved_jobs SET alert_frequency = $1
     WHERE id = $2 AND uid = $3
     RETURNING *`,
    [alertFrequency, id, uid],
  );

  return result.rows[0] || null;
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

// Turns off alerts for one saved job from a one-click email unsubscribe
// link — no Firebase session available there, so ownership is proven by
// token instead (see migration 011's unsubscribe_token).
export const unsubscribeSavedJob = async (
  pool: Pool,
  id: string,
  token: string,
): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE saved_jobs SET alert_frequency = 'off'
     WHERE id = $1 AND unsubscribe_token = $2`,
    [id, token],
  );

  return (result.rowCount || 0) > 0;
};

export interface SavedJobForDigest extends SavedJobRecord {
  email: string;
  display_name: string | null;
  email_notifications: boolean;
  unsubscribe_token: string;
}

// Every daily-alert saved job that's due for another alert — never seen one
// (last_alerted_at is null) or its last one was far enough back — and that
// has a non-empty role title to search by (see insertSavedJob /
// 007_saved_jobs.sql: role_name is required, but guard anyway since this is
// the one query that would silently misbehave on an empty string). Does
// NOT filter by email_notifications here, same as listDueSavedSearches —
// the digest runner skips the *send* for an opted-out user but still
// advances last_alerted_at.
export const listDueSavedJobs = async (
  pool: Pool,
): Promise<SavedJobForDigest[]> => {
  const result = await pool.query<SavedJobForDigest>(
    `SELECT j.*, u.email, u.display_name, u.email_notifications
     FROM saved_jobs j
     JOIN users_bgh u ON u.uid = j.uid
     WHERE j.alert_frequency = 'daily'
       AND trim(j.role_name) <> ''
       AND u.email IS NOT NULL AND u.email <> ''
       AND (j.last_alerted_at IS NULL OR j.last_alerted_at < now() - interval '1 day')
     ORDER BY j.uid, j.created_at ASC`,
  );

  return result.rows;
};

// Advances the watermark for every saved job this digest run touched —
// whether or not it actually matched new jobs, and whether or not an email
// went out for it (see listDueSavedJobs's comment on email_notifications).
export const markSavedJobsAlerted = async (
  pool: Pool,
  ids: string[],
): Promise<void> => {
  if (!ids.length) return;

  await pool.query(
    `UPDATE saved_jobs SET last_alerted_at = now() WHERE id = ANY($1::uuid[])`,
    [ids],
  );
};
