# bgh-scout-api

Ingests the BGH Scout Google Sheet CSV of job listings, enriches each job by
crawling its posting page for `schema.org/JobPosting` JSON-LD, and serves the
resulting snapshot to the [bghscout.com](https://www.bghscout.com) frontend
from a single endpoint.

See `BACKEND_REPO_PLAN.md` for the full design spec this implements.

## Setup

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev             # starts the API + runs pending DB migrations
```

Postgres tables are created automatically on boot (`src/db/migrate.ts` runs
everything in `src/db/migrations/`).

## Scripts

- `npm run dev` — start the API locally with hot reload.
- `npm run build` — compile TypeScript to `dist/`.
- `npm start` — run the compiled API (`dist/index.js`).
- `npm run ingest` — run one ingest pass from the CLI (download CSV, upsert,
  enrich stale/missing rows). Useful for local testing and manual backfills.
- `npm test` — run the unit test suite (`jsonld`, `sanitize`, `csv`).

## API

| Route                                    | Description                                                                                                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                            | Liveness check.                                                                                                                                                                                          |
| `GET /v1/jobs`                           | Full enriched job snapshot. Cached (`s-maxage=900`) with `ETag` support.                                                                                                                                 |
| `GET /v1/jobs/:id`                       | A single job for the frontend's public `/jobs/[id]` page. Increments and returns that job's persistent `viewCount` (see `job_view_counts`).                                                              |
| `GET /v1/status`                         | Last ingest run summary + next scheduled run.                                                                                                                                                            |
| `POST /v1/ingest`                        | Trigger a fresh ingest run. Requires `Authorization: Bearer <INGEST_TRIGGER_SECRET>`.                                                                                                                    |
| `POST /v1/contact`                       | Feedback / company-request form. Rate-limited to 5/hour per IP.                                                                                                                                          |
| `POST /v1/users`                         | Create/sync a user profile after Firebase sign-up. Requires a Firebase ID token whose `uid` matches the body.                                                                                            |
| `PATCH /v1/users/:uid`                   | Sync profile edits. Requires a Firebase ID token whose `uid` matches the path/body; `404` if no profile exists yet.                                                                                      |
| `POST /v1/saved-searches`                | Save a search's filter params for the signed-in user, with an optional `alertFrequency` (`off`\|`daily`\|`weekly`, defaults to `off`). Requires a Firebase ID token; `uid` is taken from the token only. |
| `GET /v1/saved-searches`                 | List the caller's own saved searches, newest first. Requires a Firebase ID token.                                                                                                                        |
| `PATCH /v1/saved-searches/:id`           | Change a saved search's `alertFrequency` — the only field editable after creation. Requires a Firebase ID token; `404` if not found or not owned by the caller.                                          |
| `GET /v1/saved-searches/:id/unsubscribe` | One-click unsubscribe from one search's alerts, reached from an email link (`?token=` from that search's row, not a Firebase session). Turns off alerts for that search only.                            |
| `DELETE /v1/saved-searches/:id`          | Delete one of the caller's saved searches. Requires a Firebase ID token; `404` if not found or not owned by the caller.                                                                                  |
| `POST /v1/saved-jobs`                    | Bookmark a single job for the signed-in user. Requires a Firebase ID token; `uid` is taken from the token only.                                                                                          |
| `GET /v1/saved-jobs`                     | List the caller's own saved jobs, newest first. Requires a Firebase ID token.                                                                                                                            |
| `DELETE /v1/saved-jobs/:id`              | Remove one of the caller's saved jobs. Requires a Firebase ID token; `404` if not found or not owned by the caller.                                                                                      |

A scheduled ingest also runs in-process via `node-cron` on `INGEST_CRON`
(default `0 3,9,15,21 * * *`, America/New_York) — the host does not need its
own scheduler. Each run upserts rows by `link` (so a job already in the
table is updated, never duplicated) and then prunes any job that hasn't
appeared in the sheet for `JOBS_STALE_MONTHS` (default 3) — a job still
being actively listed never reaches that cutoff, no matter how old its
original posting is, only one that's stopped showing up does.

A scheduled saved-search alert email also runs in-process via `node-cron`,
once for each cadence: `SAVED_SEARCH_DIGEST_CRON` (default `0 9 * * *`) for
`alertFrequency: "daily"` searches, `SAVED_SEARCH_WEEKLY_DIGEST_CRON`
(default `0 9 * * 1`) for `"weekly"` ones (both America/New_York). Each
search opts in individually — new ones default to `"off"` — and only ever
emails about jobs _first posted_ since that search's last alert (not a
resend of its whole current match set), so a user with two daily searches
where only one has new matches gets one email with one entry, not a blank
reminder for the other. A search with nothing new this cycle is silently
skipped rather than emailed empty. Each entry links back to that search on
[bghscout.com](https://www.bghscout.com) (via `FRONTEND_BASE_URL`), its new
result count, a preview of up to 5 of the new jobs (title, company, and a
direct link to each job's `/jobs/[id]` page), and a one-click unsubscribe
link scoped to just that search (via `API_BASE_URL` — omitted if that env
var isn't set).

A separate scheduled "weekly opportunities" nudge email also runs via
`node-cron` on `WEEKLY_EMAIL_CRON` (default `0 10 * * 1`, America/New_York) to
every user with an email on file.

Both scheduled emails respect `users_bgh.email_notifications`: a user who has
opted out is skipped entirely. (`/v1/contact` is unaffected — it relays a
message the user actively submitted, not a notification sent to them.)

## Environment variables

See `.env.example`. Notably:

- Database uses the existing discrete `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB`/
  `DB_PORT`/`DB_SSL` vars rather than a single `DATABASE_URL`.
- `/v1/contact` reuses the existing Gmail API OAuth2 refresh-token creds
  (`CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, `REFRESH_TOKEN`,
  `SENDER_EMAIL`) instead of new `MAIL_*` vars.
- `CONTACT_RECIPIENTS` is read server-side only — never taken from the request
  body.
- `POST /v1/users` and `PATCH /v1/users/:uid` verify a Firebase ID token via
  `firebase-admin`, configured with `FIREBASE_SERVICE_ACCOUNT` (the service
  account JSON, as a single-line string). Both routes reject the request if
  the token's `uid` doesn't match the profile being written.
