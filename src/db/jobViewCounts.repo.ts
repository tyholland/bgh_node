import { Pool } from "pg";

// Increments (or creates, starting at 1) the view counter for a job and
// returns the new total. Called once per GET /v1/jobs/:id — see
// src/routes/jobs.ts.
export const incrementAndGetViewCount = async (
  pool: Pool,
  jobId: string,
): Promise<number> => {
  const result = await pool.query<{ view_count: number }>(
    `INSERT INTO job_view_counts (job_id, view_count, updated_at)
     VALUES ($1, 1, now())
     ON CONFLICT (job_id) DO UPDATE SET
       view_count = job_view_counts.view_count + 1,
       updated_at = now()
     RETURNING view_count`,
    [jobId],
  );

  return result.rows[0].view_count;
};
