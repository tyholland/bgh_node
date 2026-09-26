create table if not exists saved_searches (
  id          uuid primary key default gen_random_uuid(),
  uid         text not null references users_bgh(uid) on delete cascade,
  name        text,
  params      jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists saved_searches_uid_idx on saved_searches (uid);
