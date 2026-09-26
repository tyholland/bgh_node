import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/ingest/run", () => ({
  isIngestRunning: vi.fn(),
  runIngest: vi.fn(),
}));

import { isIngestRunning, runIngest } from "../../src/ingest/run";
import { ingestRoutes } from "../../src/routes/ingest";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  ingestRoutes(app);
  return app;
};

describe("POST /v1/ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isIngestRunning).mockReturnValue(false);
    vi.mocked(runIngest).mockResolvedValue(undefined);
  });

  it("rejects requests without the correct bearer secret", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/ingest")
      .set("Authorization", "Bearer wrong-secret");

    expect(res.status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("rejects requests with no Authorization header", async () => {
    const app = buildApp();

    const res = await request(app).post("/v1/ingest");

    expect(res.status).toBe(401);
  });

  it("triggers a run without clearing jobs by default", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/ingest")
      .set("Authorization", "Bearer test-secret");

    expect(res.status).toBe(202);
    expect(runIngest).toHaveBeenCalledWith(false);
  });

  it("clears jobs only when explicitly requested in the body", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/ingest")
      .set("Authorization", "Bearer test-secret")
      .send({ clear: true });

    expect(res.status).toBe(202);
    expect(runIngest).toHaveBeenCalledWith(true);
  });

  it("returns 409 when a run is already in progress", async () => {
    vi.mocked(isIngestRunning).mockReturnValue(true);
    const app = buildApp();

    const res = await request(app)
      .post("/v1/ingest")
      .set("Authorization", "Bearer test-secret");

    expect(res.status).toBe(409);
    expect(runIngest).not.toHaveBeenCalled();
  });
});
