import { instance } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { runIngest } from "../src/ingest/run";
import { logger } from "../src/lib/logger";

const main = async () => {
  const pool = instance();

  await runMigrations(pool);
  await runIngest();
  await pool.end();
};

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("Manual ingest failed", err);
    process.exit(1);
  });
