import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestRun } from "../src/types";

vi.mock("../src/db/client", () => ({ instance: vi.fn() }));
vi.mock("../src/db/jobs.repo", () => ({
  clearJobs: vi.fn(),
  selectRowsToEnrich: vi.fn(),
  upsertJobs: vi.fn(),
  writeJobDetails: vi.fn(),
}));
vi.mock("../src/db/runs.repo", () => ({
  startRun: vi.fn(),
  finishRun: vi.fn(),
  getIncompleteRun: vi.fn(),
  abandonRun: vi.fn(),
}));
vi.mock("../src/ingest/csv", () => ({ fetchAndNormalizeCsv: vi.fn() }));
vi.mock("../src/ingest/enrich", () => ({ enrichJob: vi.fn() }));
vi.mock("../src/ingest/revalidate", () => ({ revalidateFrontend: vi.fn() }));

import { instance } from "../src/db/client";
import {
  clearJobs,
  selectRowsToEnrich,
  upsertJobs,
  writeJobDetails,
} from "../src/db/jobs.repo";
import {
  abandonRun,
  finishRun,
  getIncompleteRun,
  startRun,
} from "../src/db/runs.repo";
import { fetchAndNormalizeCsv } from "../src/ingest/csv";
import { enrichJob } from "../src/ingest/enrich";
import { revalidateFrontend } from "../src/ingest/revalidate";
import {
  isIngestRunning,
  resumeInterruptedIngest,
  runIngest,
} from "../src/ingest/run";

const fakeRun: IngestRun = {
  id: "run-1",
  started_at: new Date().toISOString(),
  finished_at: null,
  ok: null,
  rows_in: null,
  rows_enriched: null,
  rows_failed: null,
  error: null,
};

describe("runIngest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
    vi.mocked(startRun).mockResolvedValue(fakeRun);
    vi.mocked(finishRun).mockResolvedValue(undefined);
    vi.mocked(getIncompleteRun).mockResolvedValue(null);
    vi.mocked(abandonRun).mockResolvedValue(undefined);
    vi.mocked(clearJobs).mockResolvedValue(undefined);
    vi.mocked(selectRowsToEnrich).mockResolvedValue([]);
    vi.mocked(upsertJobs).mockResolvedValue(undefined);
    vi.mocked(writeJobDetails).mockResolvedValue(undefined);
    vi.mocked(fetchAndNormalizeCsv).mockResolvedValue([]);
    vi.mocked(enrichJob).mockResolvedValue({ status: "ok", details: null });
    vi.mocked(revalidateFrontend).mockResolvedValue(undefined);
  });

  it("defaults to NOT clearing existing jobs when no argument is passed", async () => {
    await runIngest();

    expect(clearJobs).not.toHaveBeenCalled();
  });

  it("clears jobs only when explicitly requested", async () => {
    await runIngest(true);

    expect(clearJobs).toHaveBeenCalledTimes(1);
  });

  it("rejects a run started while one is already in progress", async () => {
    let releaseCsv: () => void = () => {};
    vi.mocked(fetchAndNormalizeCsv).mockReturnValue(
      new Promise((resolve) => {
        releaseCsv = () => resolve([]);
      }),
    );

    const firstRun = runIngest();

    expect(isIngestRunning()).toBe(true);
    await expect(runIngest()).rejects.toThrow("already in progress");

    releaseCsv();
    await firstRun;

    expect(isIngestRunning()).toBe(false);
  });

  it("releases the lock even when the run fails", async () => {
    vi.mocked(fetchAndNormalizeCsv).mockRejectedValue(
      new Error("network down"),
    );

    await expect(runIngest()).rejects.toThrow("network down");

    expect(isIngestRunning()).toBe(false);

    // The lock being released means a subsequent run is allowed to start.
    vi.mocked(fetchAndNormalizeCsv).mockResolvedValue([]);
    await expect(runIngest()).resolves.toBeUndefined();
  });
});

describe("resumeInterruptedIngest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
    vi.mocked(startRun).mockResolvedValue(fakeRun);
    vi.mocked(finishRun).mockResolvedValue(undefined);
    vi.mocked(abandonRun).mockResolvedValue(undefined);
    vi.mocked(clearJobs).mockResolvedValue(undefined);
    vi.mocked(selectRowsToEnrich).mockResolvedValue([]);
    vi.mocked(upsertJobs).mockResolvedValue(undefined);
    vi.mocked(writeJobDetails).mockResolvedValue(undefined);
    vi.mocked(fetchAndNormalizeCsv).mockResolvedValue([]);
    vi.mocked(enrichJob).mockResolvedValue({ status: "ok", details: null });
    vi.mocked(revalidateFrontend).mockResolvedValue(undefined);
  });

  it("does nothing when the last run finished cleanly", async () => {
    vi.mocked(getIncompleteRun).mockResolvedValue(null);

    await resumeInterruptedIngest();

    expect(abandonRun).not.toHaveBeenCalled();
    expect(startRun).not.toHaveBeenCalled();
  });

  it("abandons an orphaned (never-finished) run and starts a fresh one", async () => {
    vi.mocked(getIncompleteRun).mockResolvedValue({
      ...fakeRun,
      id: "orphaned-run",
      finished_at: null,
    });

    await resumeInterruptedIngest();

    expect(abandonRun).toHaveBeenCalledWith(
      expect.anything(),
      "orphaned-run",
      expect.any(String),
    );
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(isIngestRunning()).toBe(false);
  });

  it("retries a run that already finished with ok = false, without touching its recorded error", async () => {
    vi.mocked(getIncompleteRun).mockResolvedValue({
      ...fakeRun,
      id: "failed-run",
      finished_at: new Date().toISOString(),
      ok: false,
      error: "network down",
    });

    await resumeInterruptedIngest();

    expect(abandonRun).not.toHaveBeenCalled();
    expect(startRun).toHaveBeenCalledTimes(1);
    expect(isIngestRunning()).toBe(false);
  });
});
