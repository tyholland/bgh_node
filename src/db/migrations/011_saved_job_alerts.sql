-- Per-saved-job opt-in daily alert, mirroring saved_searches' alert_frequency
-- (migration 009) but with only two states — there's no "weekly" option for
-- a saved job, since the dropdown only offers Daily/Off. Brand new feature,
-- so (unlike 009) every existing row can safely default to 'off': nobody is
-- already relying on a saved-job digest that doesn't exist yet.
alter table saved_jobs
  add column if not exists alert_frequency text not null default 'off',
  add column if not exists last_alerted_at timestamptz,
  add column if not exists unsubscribe_token text not null default encode(gen_random_bytes(24), 'hex');

alter table saved_jobs
  add constraint saved_jobs_alert_frequency_check
  check (alert_frequency in ('off', 'daily'));

create unique index if not exists saved_jobs_unsubscribe_token_idx
  on saved_jobs (unsubscribe_token);

-- Scopes the digest worker's "which saved jobs are due" query to just the
-- rows it'll ever select, same reasoning as saved_searches_due_alerts_idx.
create index if not exists saved_jobs_due_alerts_idx
  on saved_jobs (alert_frequency, last_alerted_at)
  where alert_frequency <> 'off';
