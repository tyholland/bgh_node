import { Pool } from "pg";
import { UserProfile, UserRecord } from "../types";

export const upsertUser = async (
  pool: Pool,
  profile: UserProfile,
): Promise<UserRecord> => {
  const result = await pool.query<UserRecord>(
    `INSERT INTO users_bgh (uid, email, display_name, phone_number, photo_url, provider_id, email_notifications, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, true, now())
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
}

const PATCH_FIELD_COLUMNS: Record<keyof UserPatch, string> = {
  email: "email",
  displayName: "display_name",
  phoneNumber: "phone_number",
  photoURL: "photo_url",
  providerId: "provider_id",
  emailNotifications: "email_notifications",
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
