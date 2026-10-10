import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ instance: vi.fn() }));
vi.mock("../../src/db/jobs.repo", () => ({
  selectJobById: vi.fn(),
  selectJobsFacets: vi.fn(),
  selectJobsPage: vi.fn(),
}));
vi.mock("../../src/db/runs.repo", () => ({ getLastSuccessfulRun: vi.fn() }));

import { instance } from "../../src/db/client";
import {
  selectJobById,
  selectJobsFacets,
  selectJobsPage,
} from "../../src/db/jobs.repo";
import { getLastSuccessfulRun } from "../../src/db/runs.repo";
import { jobsRoutes } from "../../src/routes/jobs";
import type { JobRecord } from "../../src/types";

const buildApp = () => {
  const app = express();
  jobsRoutes(app);
  return app;
};

const record = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: "abc123",
  link: "https://careers.acme.com/jobs/1",
  role_name: "Engineer",
  primary_industry: "Technology",
  company: "Acme",
  scrape_datetime: "2026-09-10T14:32:00.000Z",
  scrape_date: "2026-09-10",
  details: null,
  details_status: "ok",
  details_fetched_at: null,
  first_seen_at: "2026-09-01T00:00:00.000Z",
  last_seen_at: "2026-09-10T14:32:00.000Z",
  updated_at: "2026-09-10T14:32:00.000Z",
  ...overrides,
});

describe("GET /v1/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
    vi.mocked(getLastSuccessfulRun).mockResolvedValue(null);
    vi.mocked(selectJobsFacets).mockResolvedValue({
      total: 1,
      sourceScrapedAt: "2026-09-10T14:32:00.000Z",
      companies: [{ value: "Acme", count: 1 }],
      industries: [{ value: "Technology", count: 1 }],
      scrapDates: ["2026-09-10"],
    });
    vi.mocked(selectJobsPage).mockResolvedValue([record()]);
  });

  it("returns the current page of jobs", async () => {
    const app = buildApp();

    const res = await request(app).get("/v1/jobs");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.jobs[0].Link).toBe("https://careers.acme.com/jobs/1");
    expect(res.body.jobs[0].id).toBe("abc123");
  });

  it("omits Details for jobs whose details_status is not ok", async () => {
    vi.mocked(selectJobsPage).mockResolvedValue([
      record({ details_status: "pending", details: null }),
    ]);
    const app = buildApp();

    const res = await request(app).get("/v1/jobs");

    expect(res.body.jobs[0].Details).toBeUndefined();
  });

  it("returns 304 when If-None-Match matches the current ETag", async () => {
    const app = buildApp();

    const first = await request(app).get("/v1/jobs");
    const etag = first.headers.etag;

    const second = await request(app)
      .get("/v1/jobs")
      .set("If-None-Match", etag);

    expect(second.status).toBe(304);
  });

  it("does not leak internal error details on failure", async () => {
    vi.mocked(selectJobsFacets).mockRejectedValue(
      new Error('relation "jobs" does not exist'),
    );
    const app = buildApp();

    const res = await request(app).get("/v1/jobs");

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("relation");
  });
});

describe("GET /v1/jobs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
    vi.mocked(getLastSuccessfulRun).mockResolvedValue(null);
  });

  it("returns the job when the id exists and is still active", async () => {
    vi.mocked(selectJobById).mockResolvedValue(record());
    const app = buildApp();

    const res = await request(app).get("/v1/jobs/abc123");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("abc123");
    expect(res.body.Link).toBe("https://careers.acme.com/jobs/1");
    expect(selectJobById).toHaveBeenCalledWith({}, "abc123", null);
  });

  it("includes Details when the job is enriched", async () => {
    vi.mocked(selectJobById).mockResolvedValue(
      record({
        details_status: "ok",
        details: { description: "<p>Build things.</p>" },
      }),
    );
    const app = buildApp();

    const res = await request(app).get("/v1/jobs/abc123");

    expect(res.body.Details).toEqual({ description: "<p>Build things.</p>" });
  });

  it("404s for an unknown id", async () => {
    vi.mocked(selectJobById).mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app).get("/v1/jobs/does-not-exist");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });

  it("404s for a delisted job the same as selectJobById would exclude from the list", async () => {
    // selectJobById itself owns the "still active" filtering (same
    // details_status/last_seen_at rules as the list endpoint) — the route
    // just has to trust a null result means 404, which this covers.
    vi.mocked(selectJobById).mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app).get("/v1/jobs/abc123");

    expect(res.status).toBe(404);
  });

  it("does not leak internal error details on failure", async () => {
    vi.mocked(selectJobById).mockRejectedValue(
      new Error('relation "jobs" does not exist'),
    );
    const app = buildApp();

    const res = await request(app).get("/v1/jobs/abc123");

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("relation");
  });
});
