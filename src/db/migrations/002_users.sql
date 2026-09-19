create table if not exists users (
  uid           text primary key,
  email         text,
  display_name  text,
  phone_number  text,
  photo_url     text,
  provider_id   text not null default 'password',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
