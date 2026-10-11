-- Bookmarking a single job (as opposed to saved_searches, which saves a
-- filter set). Deliberately has no foreign key to `jobs`: the ingest run
-- prunes jobs that haven't appeared in the sheet for a while
-- (pruneStaleJobs(), see src/db/jobs.repo.ts / src/ingest/run.ts), and an
-- `ON DELETE CASCADE` FK would silently delete a user's bookmark the moment
-- that happens. Storing a denormalized snapshot of the job's display fields
-- instead means a saved job keeps rendering correctly even after the live
-- `jobs` row is gone.
create table if not exists saved_jobs (
  id          uuid primary key default gen_random_uuid(),
  uid         text not null references users_bgh(uid) on delete cascade,
  job_id      text not null,
  role_name   text not null,
  company     text,
  link        text not null,
  created_at  timestamptz not null default now(),
  unique (uid, job_id)
);

create index if not exists saved_jobs_uid_idx on saved_jobs (uid);
