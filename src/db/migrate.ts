import fs from "fs";
import path from "path";
import { Pool } from "pg";
import { logger } from "../lib/logger";

export const runMigrations = async (pool: Pool) => {
  const dir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");

    logger.info(`Running migration ${file}`);
    await pool.query(sql);
  }
};
