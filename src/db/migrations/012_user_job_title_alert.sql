-- Watermark for the weekly "jobs matching your job title" email (keyed off
-- users_bgh.job_title, see 010_user_job_title.sql). Account-level, unlike
-- saved_searches/saved_jobs, so one column on the user is enough — there's
-- no per-row alert_frequency to add since gating is just "has a job_title"
-- plus the existing email_notifications master switch.
alter table users_bgh
  add column if not exists job_title_alerted_at timestamptz;
