create extension if not exists pgcrypto;

create table if not exists jobs (
  link                text primary key,
  role_name           text not null,
  primary_industry    text,
  company             text,
  scrape_datetime     timestamptz,
  scrape_date         text,
  details             jsonb,
  details_status      text not null default 'pending',
  details_fetched_at  timestamptz,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists ingest_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  ok            boolean,
  rows_in       int,
  rows_enriched int,
  rows_failed   int,
  error         text
);
