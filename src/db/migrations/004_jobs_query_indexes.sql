-- Speeds up the filtered/paginated /v1/jobs query (see src/db/jobsQuery.ts).
create index if not exists jobs_details_status_idx on jobs (details_status);
create index if not exists jobs_last_seen_at_idx on jobs (last_seen_at);
create index if not exists jobs_scrape_datetime_idx on jobs (scrape_datetime);
create index if not exists jobs_company_idx on jobs (lower(company));
create index if not exists jobs_primary_industry_idx on jobs (lower(primary_industry));
