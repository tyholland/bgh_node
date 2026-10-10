-- Stable, URL-safe per-job identifier for the public /jobs/[id] detail page
-- on the frontend (see bgh/BACKEND_REPO_PLAN.md §5). Derived from `link` —
-- this table's existing primary key — rather than a new surrogate key,
-- since `link` is already treated as the per-job identity everywhere
-- (upsertJobs upserts ON CONFLICT (link); the frontend uses item.Link as its
-- React list key). A generated column keeps it automatically in sync and
-- lets GET /v1/jobs/:id use a plain indexed equality lookup.
alter table jobs add column if not exists id text generated always as (md5(link)) stored;
create unique index if not exists jobs_id_idx on jobs (id);
