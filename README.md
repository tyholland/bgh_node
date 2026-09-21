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

| Route                           | Description                                                                                                             |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                   | Liveness check.                                                                                                         |
| `GET /v1/jobs`                  | Full enriched job snapshot. Cached (`s-maxage=900`) with `ETag` support.                                                |
| `GET /v1/status`                | Last ingest run summary + next scheduled run.                                                                           |
| `POST /v1/ingest`               | Trigger a fresh ingest run. Requires `Authorization: Bearer <INGEST_TRIGGER_SECRET>`.                                   |
| `POST /v1/contact`              | Feedback / company-request form. Rate-limited to 5/hour per IP.                                                         |
| `POST /v1/users`                | Create/sync a user profile after Firebase sign-up. Requires a Firebase ID token whose `uid` matches the body.           |
| `PATCH /v1/users/:uid`          | Sync profile edits. Requires a Firebase ID token whose `uid` matches the path/body; `404` if no profile exists yet.     |
| `POST /v1/saved-searches`       | Save a search's filter params for the signed-in user. Requires a Firebase ID token; `uid` is taken from the token only. |
| `GET /v1/saved-searches`        | List the caller's own saved searches, newest first. Requires a Firebase ID token.                                       |
| `DELETE /v1/saved-searches/:id` | Delete one of the caller's saved searches. Requires a Firebase ID token; `404` if not found or not owned by the caller. |

A scheduled ingest also runs in-process via `node-cron` on `INGEST_CRON`
(default `0 3,9,15,21 * * *`, America/New_York) — the host does not need its
own scheduler.

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
