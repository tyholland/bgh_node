-- Per-search opt-in alert frequency, replacing the old "every saved search
-- gets a daily digest unconditionally" behavior. Existing rows are
-- backfilled to 'daily' (the DEFAULT below applies during this ALTER's
-- table rewrite) so nobody already receiving the digest goes silent the
-- moment this ships — only *new* searches created from here on default to
-- 'off', an explicit opt-in. See BACKEND_REPO_PLAN.md §5 "Job alert emails".
alter table saved_searches
  add column if not exists alert_frequency text not null default 'daily',
  add column if not exists last_alerted_at timestamptz,
  add column if not exists unsubscribe_token text not null default encode(gen_random_bytes(24), 'hex');

alter table saved_searches
  add constraint saved_searches_alert_frequency_check
  check (alert_frequency in ('off', 'daily', 'weekly'));

create unique index if not exists saved_searches_unsubscribe_token_idx
  on saved_searches (unsubscribe_token);

-- Scopes the digest worker's "which searches are due" query to just the
-- rows it'll ever select (alert_frequency <> 'off'), so it stays a small
-- index instead of covering every saved search ever created.
create index if not exists saved_searches_due_alerts_idx
  on saved_searches (alert_frequency, last_alerted_at)
  where alert_frequency <> 'off';
