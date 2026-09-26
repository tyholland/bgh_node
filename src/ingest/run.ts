import pLimit from "p-limit";
import { instance } from "../db/client";
import {
  clearJobs,
  selectRowsToEnrich,
  upsertJob,
  writeJobDetails,
} from "../db/jobs.repo";
import {
  abandonRun,
  finishRun,
  getIncompleteRun,
  startRun,
} from "../db/runs.repo";
import { env } from "../lib/env";
import { logger } from "../lib/logger";
import { fetchAndNormalizeCsv } from "./csv";
import { enrichJob } from "./enrich";
import { revalidateFrontend } from "./revalidate";

let isRunning = false;

export const isIngestRunning = () => isRunning;

// Call once at startup, after the server is accepting traffic. If the
// previous run never reached finishRun (the process was killed or crashed
// mid-run), mark it failed for accurate history and kick off a fresh run so
// the interrupted work gets picked back up: upsertJob is idempotent and
// selectRowsToEnrich re-selects anything still pending, so a plain runIngest
// naturally continues where the orphaned run left off.
export const resumeInterruptedIngest = async () => {
  const pool = instance();
  const incomplete = await getIncompleteRun(pool);

  if (!incomplete) {
    return;
  }

  logger.warn(
    `Found incomplete ingest run ${incomplete.id} started at ${incomplete.started_at}; resuming`,
  );

  await abandonRun(
    pool,
    incomplete.id,
    "Interrupted: server restarted before this run finished",
  );

  await runIngest();
};

export const runIngest = async (clearOldJobs = false) => {
  if (isRunning) {
    throw new Error("Ingest run already in progress");
  }

  isRunning = true;

  try {
    await runIngestUnlocked(clearOldJobs);
  } finally {
    isRunning = false;
  }
};

const runIngestUnlocked = async (clearOldJobs: boolean) => {
  const pool = instance();
  const run = await startRun(pool);

  logger.info(`Starting ingest run ${run.id}`);

  let rowsIn = 0;
  let rowsEnriched = 0;
  let rowsFailed = 0;

  try {
    const rows = await fetchAndNormalizeCsv();
    rowsIn = rows.length;

    if (clearOldJobs) {
      await clearJobs(pool);
    }

    for (const row of rows) {
      await upsertJob(pool, row, run.started_at);
    }

    const toEnrich = await selectRowsToEnrich(pool);
    const limit = pLimit(env.CRAWL_CONCURRENCY);

    await Promise.all(
      toEnrich.map((job) =>
        limit(async () => {
          const { status, details } = await enrichJob(job.link);

          await writeJobDetails(pool, job.link, status, details);

          if (status === "ok") {
            rowsEnriched += 1;
          } else if (status === "failed") {
            rowsFailed += 1;
          }
        }),
      ),
    );

    await finishRun(pool, run.id, {
      ok: true,
      rowsIn,
      rowsEnriched,
      rowsFailed,
    });

    logger.info(
      `Finished ingest run ${run.id}: ${rowsIn} rows, ${rowsEnriched} enriched, ${rowsFailed} failed`,
    );

    await revalidateFrontend();
  } catch (err) {
    logger.error(`Ingest run ${run.id} failed`, err);

    await finishRun(pool, run.id, {
      ok: false,
      rowsIn,
      rowsEnriched,
      rowsFailed,
      error: err instanceof Error ? err.message : String(err),
    });

    throw err;
  }
};
