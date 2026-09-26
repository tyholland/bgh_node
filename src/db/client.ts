import { Pool } from "pg";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

let pool: Pool;

export const instance = () => {
  if (pool) {
    return pool;
  }

  pool = new Pool({
    host: env.DB_HOST,
    port: env.DB_PORT_NUM,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB,
    ssl: env.DB_SSL,
    // Fail fast instead of hanging indefinitely if a connection attempt
    // stalls (e.g. the host is unreachable or the auth handshake never
    // completes) — pg has no timeout here by default.
    connectionTimeoutMillis: 10_000,
    // Keep idle connections around longer than pg's 10s default so a brief
    // event-loop stall (large synchronous parse, CPU-starved host) doesn't
    // force every subsequent query to pay for a fresh TLS/SASL handshake.
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });

  // A pooled connection can die in the background (e.g. the server closes
  // it after an authentication timeout) while it's just sitting idle, not
  // in the middle of a query. pg surfaces that as an 'error' event on the
  // pool, and with no listener Node treats it as an uncaught exception and
  // kills the whole process instantly, bypassing every try/catch/finally —
  // which is almost certainly why past ingest runs were left orphaned with
  // no finished_at. Logging it here lets the pool quietly drop the dead
  // client and continue.
  pool.on("error", (err) => {
    logger.error("Idle database client error", err);
  });

  return pool;
};
