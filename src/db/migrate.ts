import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { logger } from "../lib/logger";

const ensureMigrationsTable = async (pool: Pool) => {
  await pool.query(`
    create table if not exists schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `);
};

const getAppliedMigrations = async (pool: Pool): Promise<Set<string>> => {
  const result = await pool.query<{ filename: string }>(
    `select filename from schema_migrations`,
  );

  return new Set(result.rows.map((row) => row.filename));
};

const applyMigration = async (pool: Pool, dir: string, file: string) => {
  const sql = fs.readFileSync(path.join(dir, file), "utf8");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(`insert into schema_migrations (filename) values ($1)`, [
      file,
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

export const runMigrations = async (pool: Pool) => {
  await ensureMigrationsTable(pool);

  const dir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = await getAppliedMigrations(pool);

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    logger.info(`Running migration ${file}`);
    await applyMigration(pool, dir, file);
  }
};
