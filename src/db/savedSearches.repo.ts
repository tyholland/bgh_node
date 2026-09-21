import { Pool } from "pg";
import { SavedSearchRecord, UrlParams } from "../types";

export const insertSavedSearch = async (
  pool: Pool,
  uid: string,
  name: string | null,
  params: UrlParams,
): Promise<SavedSearchRecord> => {
  const result = await pool.query<SavedSearchRecord>(
    `INSERT INTO saved_searches (uid, name, params)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [uid, name, JSON.stringify(params)],
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
