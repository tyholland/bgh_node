import { Pool } from "pg";
import { UserProfile, UserRecord } from "../types";

export const upsertUser = async (
  pool: Pool,
  profile: UserProfile,
): Promise<UserRecord> => {
  const result = await pool.query<UserRecord>(
    `INSERT INTO users_bgh (uid, email, display_name, phone_number, photo_url, provider_id, email_notifications, job_title, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, null, now())
     ON CONFLICT (uid) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       phone_number = EXCLUDED.phone_number,
       photo_url = EXCLUDED.photo_url,
       provider_id = EXCLUDED.provider_id,
       updated_at = now()
     RETURNING *`,
    [
      profile.uid,
      profile.email,
      profile.displayName,
      profile.phoneNumber,
      profile.photoURL,
      profile.providerId,
    ],
  );

  return result.rows[0];
};

export const getUserByUid = async (
  pool: Pool,
  uid: string,
): Promise<UserRecord | null> => {
  const result = await pool.query<UserRecord>(
    `SELECT * FROM users_bgh WHERE uid = $1`,
    [uid],
  );

  return result.rows[0] || null;
};

export interface UserPatch {
  email?: string | null;
  displayName?: string | null;
  phoneNumber?: string | null;
  photoURL?: string | null;
  providerId?: string;
  emailNotifications?: boolean;
  jobTitle?: string | null;
}

const PATCH_FIELD_COLUMNS: Record<keyof UserPatch, string> = {
  email: "email",
  displayName: "display_name",
  phoneNumber: "phone_number",
  photoURL: "photo_url",
  providerId: "provider_id",
  emailNotifications: "email_notifications",
  jobTitle: "job_title",
};

// Merges only the provided keys — every other column (email_notifications
// included) is left untouched. See BACKEND_REPO_PLAN.md §5 PATCH /v1/users/:uid.
export const updateUserPartial = async (
  pool: Pool,
  uid: string,
  patch: UserPatch,
): Promise<UserRecord | null> => {
  const entries = (
    Object.entries(patch) as [keyof UserPatch, unknown][]
  ).filter(([, value]) => value !== undefined);

  if (!entries.length) {
    return getUserByUid(pool, uid);
  }

  const values: unknown[] = [uid];
  const setClauses = entries.map(([key, value], i) => {
    values.push(value);
    return `${PATCH_FIELD_COLUMNS[key]} = $${i + 2}`;
  });

  const result = await pool.query<UserRecord>(
    `UPDATE users_bgh SET ${setClauses.join(", ")}, updated_at = now()
     WHERE uid = $1
     RETURNING *`,
    values,
  );

  return result.rows[0] || null;
};

export interface UserContact {
  email: string;
  display_name: string | null;
}

// Users with an email on file who have not opted out — the source list for
// the weekly opportunities email. See BACKEND_REPO_PLAN.md §5 notification
// gating rule.
export const listUsersForWeeklyEmail = async (
  pool: Pool,
): Promise<UserContact[]> => {
  const result = await pool.query<UserContact>(
    `SELECT email, display_name FROM users_bgh
     WHERE email IS NOT NULL AND email <> '' AND email_notifications = true`,
  );

  return result.rows;
};

export interface UserDueForJobTitleMatch {
  uid: string;
  email: string;
  display_name: string | null;
  job_title: string;
  job_title_alerted_at: string | null;
  created_at: string;
  email_notifications: boolean;
}

// Every user with a job title set who's due for another weekly "jobs
// matching your job title" email — never seen one (job_title_alerted_at is
// null) or its last one was far enough back. Deliberately does NOT filter
// by email_notifications here, same as listDueSavedSearches/listDueSavedJobs
// — the digest runner skips the *send* for an opted-out user but still
// advances job_title_alerted_at, so re-enabling notifications later doesn't
// dump a backlog of "new" jobs that accumulated while they were off.
export const listUsersDueForJobTitleMatch = async (
  pool: Pool,
): Promise<UserDueForJobTitleMatch[]> => {
  const result = await pool.query<UserDueForJobTitleMatch>(
    `SELECT uid, email, display_name, job_title, job_title_alerted_at, created_at, email_notifications
     FROM users_bgh
     WHERE email IS NOT NULL AND email <> ''
       AND job_title IS NOT NULL AND trim(job_title) <> ''
       AND (job_title_alerted_at IS NULL OR job_title_alerted_at < now() - interval '7 days')`,
  );

  return result.rows;
};

// Advances the watermark for every user this digest run touched — whether
// or not they actually matched new jobs, and whether or not an email went
// out for it (see listUsersDueForJobTitleMatch's comment on
// email_notifications).
export const markUsersJobTitleAlerted = async (
  pool: Pool,
  uids: string[],
): Promise<void> => {
  if (!uids.length) return;

  await pool.query(
    `UPDATE users_bgh SET job_title_alerted_at = now() WHERE uid = ANY($1::text[])`,
    [uids],
  );
};
