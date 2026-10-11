-- A single persistent counter per job, incremented on every
-- GET /v1/jobs/:id call (see src/routes/jobs.ts). Kept in its own table
-- rather than a column on `jobs` for the same reason saved_jobs has no FK
-- to `jobs`: the ingest run prunes jobs that haven't appeared in the sheet
-- for a while (pruneStaleJobs(), see src/db/jobs.repo.ts), so a view_count
-- column on `jobs` itself would disappear right along with the row. This
-- table is never touched by the ingest run, so a count survives even after
-- its job is pruned and (if the same job reappears later) would resume from
-- where it left off.
create table if not exists job_view_counts (
  job_id      text primary key,
  view_count  integer not null default 0,
  updated_at  timestamptz not null default now()
);
