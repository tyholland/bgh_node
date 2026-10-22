-- Free-text job title the user can set on their profile.
alter table users_bgh
  add column if not exists job_title text;
