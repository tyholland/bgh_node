import { Pool } from "pg";
import { AlertFrequency, SavedSearchRecord, UrlParams } from "../types";

export const insertSavedSearch = async (
  pool: Pool,
  uid: string,
  name: string | null,
  params: UrlParams,
  alertFrequency: AlertFrequency,
): Promise<SavedSearchRecord> => {
  const result = await pool.query<SavedSearchRecord>(
    `INSERT INTO saved_searches (uid, name, params, alert_frequency)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [uid, name, JSON.stringify(params), alertFrequency],
  );

  return result.rows[0];
};

export const listSavedSearchesByUid = async (
  pool: Pool,
  uid: string,
): Promise<SavedSearchRecord[]> => {
  const result = await pool.query<SavedSearchRecord>(
    `SELECT * FROM saved_searches WHERE uid = $1 ORDER BY created_at DESC`,
    [uid],
  );

  return result.rows;
};

// The only field editable after creation — name/params still require
// delete-and-recreate from the frontend. Scoped to the owner, same as delete.
export const updateSavedSearchAlertFrequency = async (
  pool: Pool,
  id: string,
  uid: string,
  alertFrequency: AlertFrequency,
): Promise<SavedSearchRecord | null> => {
  const result = await pool.query<SavedSearchRecord>(
    `UPDATE saved_searches SET alert_frequency = $1
     WHERE id = $2 AND uid = $3
     RETURNING *`,
    [alertFrequency, id, uid],
  );

  return result.rows[0] || null;
};

export const deleteSavedSearch = async (
  pool: Pool,
  id: string,
  uid: string,
): Promise<boolean> => {
  const result = await pool.query(
    `DELETE FROM saved_searches WHERE id = $1 AND uid = $2`,
    [id, uid],
  );

  return (result.rowCount || 0) > 0;
};

// Turns off alerts for one search from a one-click email unsubscribe link —
// no Firebase session available there, so ownership is proven by token
// instead (see migration 009's unsubscribe_token). Deliberately only flips
// this one search's alert_frequency, never the account-wide
// email_notifications switch — see BACKEND_REPO_PLAN.md §5.
export const unsubscribeSavedSearch = async (
  pool: Pool,
  id: string,
  token: string,
): Promise<boolean> => {
  const result = await pool.query(
    `UPDATE saved_searches SET alert_frequency = 'off'
     WHERE id = $1 AND unsubscribe_token = $2`,
    [id, token],
  );

  return (result.rowCount || 0) > 0;
};

export interface SavedSearchForDigest extends SavedSearchRecord {
  email: string;
  display_name: string | null;
  email_notifications: boolean;
  unsubscribe_token: string;
}

// Every saved search of the given frequency that's due for another alert —
// never seen one (last_alerted_at is null) or its last one was far enough
// back for this cadence. Deliberately does NOT filter by
// email_notifications here (unlike the old listSavedSearchesForDigest) —
// the digest runner itself skips the *send* for an opted-out user but still
// advances last_alerted_at, so re-enabling notifications later doesn't dump
// a backlog of "new" jobs that accumulated while they were off. See
// BACKEND_REPO_PLAN.md §5.
export const listDueSavedSearches = async (
  pool: Pool,
  frequency: Exclude<AlertFrequency, "off">,
): Promise<SavedSearchForDigest[]> => {
  const interval = frequency === "daily" ? "1 day" : "7 days";

  const result = await pool.query<SavedSearchForDigest>(
    `SELECT s.*, u.email, u.display_name, u.email_notifications
     FROM saved_searches s
     JOIN users_bgh u ON u.uid = s.uid
     WHERE s.alert_frequency = $1
       AND u.email IS NOT NULL AND u.email <> ''
       AND (s.last_alerted_at IS NULL OR s.last_alerted_at < now() - interval '${interval}')
     ORDER BY s.uid, s.created_at ASC`,
    [frequency],
  );

  return result.rows;
};

// Advances the watermark for every search this digest run touched —
// whether or not it actually matched new jobs, and whether or not an email
// went out for it (see listDueSavedSearches's comment on email_notifications).
export const markSavedSearchesAlerted = async (
  pool: Pool,
  ids: string[],
): Promise<void> => {
  if (!ids.length) return;

  await pool.query(
    `UPDATE saved_searches SET last_alerted_at = now() WHERE id = ANY($1::uuid[])`,
    [ids],
  );
};
