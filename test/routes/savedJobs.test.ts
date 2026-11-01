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
  updateSavedJobAlertFrequency: vi.fn(),
  unsubscribeSavedJob: vi.fn(),
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
  unsubscribeSavedJob,
  updateSavedJobAlertFrequency,
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
  job_title: null,
  job_title_alerted_at: null,
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

  it("creates a saved job once the user profile exists, defaulting alertFrequency to off", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(fakeUser);

    const created: SavedJobRecord = {
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      job_id: "abc123",
      role_name: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
      alert_frequency: "off",
      last_alerted_at: null,
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
      alertFrequency: "off",
    });
    expect(res.body).toEqual({
      id: created.id,
      uid: "uid-123",
      jobId: "abc123",
      roleName: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
      alertFrequency: "off",
      createdAt: created.created_at,
    });
  });

  it("passes through an explicit alertFrequency", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(fakeUser);
    vi.mocked(insertSavedJob).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      job_id: "abc123",
      role_name: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
      alert_frequency: "daily",
      last_alerted_at: null,
      created_at: new Date().toISOString(),
    });

    const app = buildApp();

    await request(app)
      .post("/v1/saved-jobs")
      .send({ ...validBody, alertFrequency: "daily" });

    expect(insertSavedJob).toHaveBeenCalledWith({}, "uid-123", {
      jobId: "abc123",
      roleName: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
      alertFrequency: "daily",
    });
  });

  it("rejects an invalid alertFrequency", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-jobs")
      .send({ ...validBody, alertFrequency: "weekly" });

    expect(res.status).toBe(400);
    expect(insertSavedJob).not.toHaveBeenCalled();
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
      alert_frequency: "off",
      last_alerted_at: null,
      created_at: new Date().toISOString(),
    };
    vi.mocked(listSavedJobsByUid).mockResolvedValue([record]);

    const app = buildApp();
    const res = await request(app).get("/v1/saved-jobs");

    expect(res.status).toBe(200);
    expect(res.body.savedJobs).toHaveLength(1);
    expect(res.body.savedJobs[0].jobId).toBe("abc123");
    expect(res.body.savedJobs[0].alertFrequency).toBe("off");
  });
});

describe("PATCH /v1/saved-jobs/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("returns 404 for a non-uuid id", async () => {
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/saved-jobs/not-a-uuid")
      .send({ alertFrequency: "daily" });

    expect(res.status).toBe(404);
    expect(updateSavedJobAlertFrequency).not.toHaveBeenCalled();
  });

  it("rejects an invalid alertFrequency", async () => {
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/saved-jobs/11111111-1111-1111-1111-111111111111")
      .send({ alertFrequency: "weekly" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when the saved job doesn't exist or isn't owned by the caller", async () => {
    vi.mocked(updateSavedJobAlertFrequency).mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/saved-jobs/11111111-1111-1111-1111-111111111111")
      .send({ alertFrequency: "daily" });

    expect(res.status).toBe(404);
  });

  it("updates the alert frequency, scoped to the caller's uid", async () => {
    vi.mocked(updateSavedJobAlertFrequency).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      job_id: "abc123",
      role_name: "Backend Engineer",
      company: "Globex",
      link: "https://jobs.example/backend-engineer",
      alert_frequency: "daily",
      last_alerted_at: null,
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/saved-jobs/11111111-1111-1111-1111-111111111111")
      .send({ alertFrequency: "daily" });

    expect(res.status).toBe(200);
    expect(updateSavedJobAlertFrequency).toHaveBeenCalledWith(
      {},
      "11111111-1111-1111-1111-111111111111",
      "uid-123",
      "daily",
    );
  });
});

describe("GET /v1/saved-jobs/:id/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("requires no auth header at all", async () => {
    vi.mocked(unsubscribeSavedJob).mockResolvedValue(true);
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-jobs/11111111-1111-1111-1111-111111111111/unsubscribe?token=abc",
    );

    expect(res.status).toBe(200);
  });

  it("404s with a generic page for a non-uuid id", async () => {
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-jobs/not-a-uuid/unsubscribe?token=abc",
    );

    expect(res.status).toBe(404);
    expect(unsubscribeSavedJob).not.toHaveBeenCalled();
  });

  it("404s when the token is missing", async () => {
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-jobs/11111111-1111-1111-1111-111111111111/unsubscribe",
    );

    expect(res.status).toBe(404);
    expect(unsubscribeSavedJob).not.toHaveBeenCalled();
  });

  it("404s when the id/token pair doesn't match any row", async () => {
    vi.mocked(unsubscribeSavedJob).mockResolvedValue(false);
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-jobs/11111111-1111-1111-1111-111111111111/unsubscribe?token=wrong",
    );

    expect(res.status).toBe(404);
  });

  it("turns off alerts for that saved job when the token matches", async () => {
    vi.mocked(unsubscribeSavedJob).mockResolvedValue(true);
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-jobs/11111111-1111-1111-1111-111111111111/unsubscribe?token=abc",
    );

    expect(res.status).toBe(200);
    expect(unsubscribeSavedJob).toHaveBeenCalledWith(
      {},
      "11111111-1111-1111-1111-111111111111",
      "abc",
    );
    expect(res.text).toContain("unsubscribed");
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
