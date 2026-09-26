import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { upsertJobs } from "../src/db/jobs.repo";
import type { CsvRow } from "../src/types";

const makeRow = (link: string): CsvRow => ({
  "Role Name": `Role for ${link}`,
  "Primary Industry": "Tech",
  Scrape_DateTime: "2026-01-01 00:00:00",
  Scrape_Date: "2026-01-01",
  Company: "Acme",
  Link: link,
});

const makeFakePool = () => {
  const query = vi.fn(async () => ({ rows: [] }));

  return { pool: { query } as unknown as Pool, query };
};

describe("upsertJobs", () => {
  it("does nothing for an empty row list", async () => {
    const { pool, query } = makeFakePool();

    await upsertJobs(pool, [], "2026-01-01T00:00:00.000Z");

    expect(query).not.toHaveBeenCalled();
  });

  it("issues a single multi-row upsert for a batch under the size limit", async () => {
    const { pool, query } = makeFakePool();
    const rows = [makeRow("https://a"), makeRow("https://b")];

    await upsertJobs(pool, rows, "2026-01-01T00:00:00.000Z");

    expect(query).toHaveBeenCalledTimes(1);

    const [sql, values] = query.mock.calls[0];

    expect(sql).toContain("INSERT INTO jobs");
    expect(sql).toContain("ON CONFLICT (link) DO UPDATE SET");
    // 2 rows * 7 columns each
    expect(values).toHaveLength(14);
    expect(values).toEqual([
      "https://a",
      "Role for https://a",
      "Tech",
      "Acme",
      "2026-01-01 00:00:00",
      "2026-01-01",
      "2026-01-01T00:00:00.000Z",
      "https://b",
      "Role for https://b",
      "Tech",
      "Acme",
      "2026-01-01 00:00:00",
      "2026-01-01",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("splits rows across multiple queries once the batch size is exceeded", async () => {
    const { pool, query } = makeFakePool();
    const rows = Array.from({ length: 1200 }, (_, i) =>
      makeRow(`https://${i}`),
    );

    await upsertJobs(pool, rows, "2026-01-01T00:00:00.000Z");

    // 500-row batches: 500 + 500 + 200
    expect(query).toHaveBeenCalledTimes(3);
    expect(query.mock.calls[0][1]).toHaveLength(500 * 7);
    expect(query.mock.calls[1][1]).toHaveLength(500 * 7);
    expect(query.mock.calls[2][1]).toHaveLength(200 * 7);
  });

  it("falls back to null for a missing Scrape_DateTime", async () => {
    const { pool, query } = makeFakePool();
    const row = { ...makeRow("https://a"), Scrape_DateTime: "" };

    await upsertJobs(pool, [row], "2026-01-01T00:00:00.000Z");

    const [, values] = query.mock.calls[0];

    expect(values[4]).toBeNull();
  });
});
