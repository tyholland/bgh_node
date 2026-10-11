import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ instance: vi.fn() }));
vi.mock("../../src/db/users.repo", () => ({
  getUserByUid: vi.fn(),
  upsertUser: vi.fn(),
}));
vi.mock("../../src/db/savedJobs.repo", () => ({
  insertSavedJob: vi.fn(),
  listSavedJobsByUid: vi.fn(),
  deleteSavedJob: vi.fn(),
}));
vi.mock("../../src/auth/verifyIdToken", () => ({
  requireFirebaseAuth: (_req: Request, res: Response, next: NextFunction) => {
    res.locals.firebaseUid = "uid-123";
    next();
  },
}));

import { instance } from "../../src/db/client";
import {
  deleteSavedJob,
  insertSavedJob,
  listSavedJobsByUid,
} from "../../src/db/savedJobs.repo";
import { getUserByUid } from "../../src/db/users.repo";
import { savedJobsRoutes } from "../../src/routes/savedJobs";
import type { SavedJobRecord, UserRecord } from "../../src/types";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  savedJobsRoutes(app);
  return app;
};

const fakeUser: UserRecord = {
  uid: "uid-123",
  email: null,
  display_name: null,
  phone_number: null,
  photo_url: null,
  provider_id: "password",
  email_notifications: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const validBody = {
  jobId: "abc123",
  roleName: "Backend Engineer",
  company: "Globex",
  link: "https://jobs.example/backend-engineer",
};

describe("POST /v1/saved-jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("returns 409 instead of a raw FK error when the caller has no user profile yet", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app).post("/v1/saved-jobs").send(validBody);

    expect(res.status).toBe(409);
    expect(insertSavedJob).not.toHaveBeenCalled();
  });

  it("creates a saved job once the user profile exists", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(fakeUser);

    const created: SavedJobRecord = {
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      job_id: "abc123",
      role_name: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
      created_at: new Date().toISOString(),
    };
    vi.mocked(insertSavedJob).mockResolvedValue(created);

    const app = buildApp();
    const res = await request(app).post("/v1/saved-jobs").send(validBody);

    expect(res.status).toBe(201);
    expect(insertSavedJob).toHaveBeenCalledWith({}, "uid-123", {
      jobId: "abc123",
      roleName: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
    });
    expect(res.body).toEqual({
      id: created.id,
      uid: "uid-123",
      jobId: "abc123",
      roleName: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
      createdAt: created.created_at,
    });
  });

  it("rejects a body with unknown fields", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-jobs")
      .send({ ...validBody, extra: "nope" });

    expect(res.status).toBe(400);
  });

  it("rejects a missing jobId", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-jobs")
      .send({ roleName: "x", link: "https://x" });

    expect(res.status).toBe(400);
  });

  it("does not leak internal error details on failure", async () => {
    vi.mocked(getUserByUid).mockRejectedValue(
      new Error("connection refused to db.internal:5432"),
    );
    const app = buildApp();

    const res = await request(app).post("/v1/saved-jobs").send(validBody);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("db.internal");
  });
});

describe("GET /v1/saved-jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("lists the caller's saved jobs", async () => {
    const record: SavedJobRecord = {
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      job_id: "abc123",
      role_name: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
      created_at: new Date().toISOString(),
    };
    vi.mocked(listSavedJobsByUid).mockResolvedValue([record]);

    const app = buildApp();
    const res = await request(app).get("/v1/saved-jobs");

    expect(res.status).toBe(200);
    expect(res.body.savedJobs).toHaveLength(1);
    expect(res.body.savedJobs[0].jobId).toBe("abc123");
  });
});

describe("DELETE /v1/saved-jobs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("returns 404 for a non-uuid id", async () => {
    const app = buildApp();

    const res = await request(app).delete("/v1/saved-jobs/not-a-uuid");

    expect(res.status).toBe(404);
  });

  it("returns 404 when nothing was deleted", async () => {
    vi.mocked(deleteSavedJob).mockResolvedValue(false);
    const app = buildApp();

    const res = await request(app).delete(
      "/v1/saved-jobs/11111111-1111-1111-1111-111111111111",
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 when the row is deleted", async () => {
    vi.mocked(deleteSavedJob).mockResolvedValue(true);
    const app = buildApp();

    const res = await request(app).delete(
      "/v1/saved-jobs/11111111-1111-1111-1111-111111111111",
    );

    expect(res.status).toBe(200);
  });
});
