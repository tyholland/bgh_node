-- Master switch for whether a user may be sent unsolicited email (weekly
-- opportunities email, saved-search digests, etc). See BACKEND_REPO_PLAN.md §5.
alter table users_bgh
  add column if not exists email_notifications boolean not null default true;
