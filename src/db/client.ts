import { Pool } from "pg";
import { env } from "../lib/env";

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
  });

  return pool;
};
