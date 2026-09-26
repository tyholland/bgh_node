import { Pool } from "pg";
import { UserProfile, UserRecord } from "../types";

export const upsertUser = async (
  pool: Pool,
  profile: UserProfile,
): Promise<UserRecord> => {
  const result = await pool.query<UserRecord>(
    `INSERT INTO users_bgh (uid, email, display_name, phone_number, photo_url, provider_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
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

export interface UserContact {
  email: string;
  display_name: string | null;
}

// Every user with an email on file — the source list for the weekly
// opportunities email.
export const listUsersForWeeklyEmail = async (
  pool: Pool,
): Promise<UserContact[]> => {
  const result = await pool.query<UserContact>(
    `SELECT email, display_name FROM users_bgh WHERE email IS NOT NULL AND email <> ''`,
  );

  return result.rows;
};
