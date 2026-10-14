import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ instance: vi.fn() }));
vi.mock("../../src/db/users.repo", () => ({
  getUserByUid: vi.fn(),
  upsertUser: vi.fn(),
}));
vi.mock("../../src/db/savedSearches.repo", () => ({
  insertSavedSearch: vi.fn(),
  listSavedSearchesByUid: vi.fn(),
  updateSavedSearchAlertFrequency: vi.fn(),
  unsubscribeSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
}));
vi.mock("../../src/auth/verifyIdToken", () => ({
  requireFirebaseAuth: (_req: Request, res: Response, next: NextFunction) => {
    res.locals.firebaseUid = "uid-123";
    next();
  },
}));

import { instance } from "../../src/db/client";
import {
  deleteSavedSearch,
  insertSavedSearch,
  unsubscribeSavedSearch,
  updateSavedSearchAlertFrequency,
} from "../../src/db/savedSearches.repo";
import { getUserByUid } from "../../src/db/users.repo";
import { savedSearchesRoutes } from "../../src/routes/savedSearches";
import type { SavedSearchRecord, UserRecord } from "../../src/types";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  savedSearchesRoutes(app);
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

describe("POST /v1/saved-searches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("returns 409 instead of a raw FK error when the caller has no user profile yet", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-searches")
      .send({ params: {} });

    expect(res.status).toBe(409);
    expect(insertSavedSearch).not.toHaveBeenCalled();
  });

  it("creates a saved search once the user profile exists, defaulting alertFrequency to off", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(fakeUser);

    const created: SavedSearchRecord = {
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      name: null,
      params: { search: "engineer" },
      alert_frequency: "off",
      last_alerted_at: null,
      created_at: new Date().toISOString(),
    };
    vi.mocked(insertSavedSearch).mockResolvedValue(created);

    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-searches")
      .send({ params: { search: "engineer" } });

    expect(res.status).toBe(201);
    expect(res.body.alertFrequency).toBe("off");
    expect(insertSavedSearch).toHaveBeenCalledWith(
      {},
      "uid-123",
      null,
      { search: "engineer" },
      "off",
    );
  });

  it("passes through an explicit alertFrequency", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(fakeUser);
    vi.mocked(insertSavedSearch).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      name: null,
      params: {},
      alert_frequency: "weekly",
      last_alerted_at: null,
      created_at: new Date().toISOString(),
    });

    const app = buildApp();

    await request(app)
      .post("/v1/saved-searches")
      .send({ params: {}, alertFrequency: "weekly" });

    expect(insertSavedSearch).toHaveBeenCalledWith(
      {},
      "uid-123",
      null,
      {},
      "weekly",
    );
  });

  it("rejects an invalid alertFrequency", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-searches")
      .send({ params: {}, alertFrequency: "hourly" });

    expect(res.status).toBe(400);
    expect(insertSavedSearch).not.toHaveBeenCalled();
  });

  it("rejects params with unknown fields", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-searches")
      .send({ params: { unknownField: "x" } });

    expect(res.status).toBe(400);
  });

  it("does not leak internal error details on failure", async () => {
    vi.mocked(getUserByUid).mockRejectedValue(
      new Error("connection refused to db.internal:5432"),
    );
    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-searches")
      .send({ params: {} });

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("db.internal");
  });
});

describe("PATCH /v1/saved-searches/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("returns 404 for a non-uuid id", async () => {
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/saved-searches/not-a-uuid")
      .send({ alertFrequency: "daily" });

    expect(res.status).toBe(404);
    expect(updateSavedSearchAlertFrequency).not.toHaveBeenCalled();
  });

  it("rejects an invalid alertFrequency", async () => {
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/saved-searches/11111111-1111-1111-1111-111111111111")
      .send({ alertFrequency: "hourly" });

    expect(res.status).toBe(400);
  });

  it("returns 404 when the search doesn't exist or isn't owned by the caller", async () => {
    vi.mocked(updateSavedSearchAlertFrequency).mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/saved-searches/11111111-1111-1111-1111-111111111111")
      .send({ alertFrequency: "daily" });

    expect(res.status).toBe(404);
  });

  it("updates the alert frequency, scoped to the caller's uid", async () => {
    vi.mocked(updateSavedSearchAlertFrequency).mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      name: null,
      params: {},
      alert_frequency: "daily",
      last_alerted_at: null,
      created_at: new Date().toISOString(),
    });
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/saved-searches/11111111-1111-1111-1111-111111111111")
      .send({ alertFrequency: "daily" });

    expect(res.status).toBe(200);
    expect(updateSavedSearchAlertFrequency).toHaveBeenCalledWith(
      {},
      "11111111-1111-1111-1111-111111111111",
      "uid-123",
      "daily",
    );
  });
});

describe("GET /v1/saved-searches/:id/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("requires no auth header at all", async () => {
    vi.mocked(unsubscribeSavedSearch).mockResolvedValue(true);
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-searches/11111111-1111-1111-1111-111111111111/unsubscribe?token=abc",
    );

    expect(res.status).toBe(200);
  });

  it("404s with a generic page for a non-uuid id", async () => {
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-searches/not-a-uuid/unsubscribe?token=abc",
    );

    expect(res.status).toBe(404);
    expect(unsubscribeSavedSearch).not.toHaveBeenCalled();
  });

  it("404s when the token is missing", async () => {
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-searches/11111111-1111-1111-1111-111111111111/unsubscribe",
    );

    expect(res.status).toBe(404);
    expect(unsubscribeSavedSearch).not.toHaveBeenCalled();
  });

  it("404s when the id/token pair doesn't match any row", async () => {
    vi.mocked(unsubscribeSavedSearch).mockResolvedValue(false);
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-searches/11111111-1111-1111-1111-111111111111/unsubscribe?token=wrong",
    );

    expect(res.status).toBe(404);
  });

  it("turns off alerts for that search when the token matches", async () => {
    vi.mocked(unsubscribeSavedSearch).mockResolvedValue(true);
    const app = buildApp();

    const res = await request(app).get(
      "/v1/saved-searches/11111111-1111-1111-1111-111111111111/unsubscribe?token=abc",
    );

    expect(res.status).toBe(200);
    expect(unsubscribeSavedSearch).toHaveBeenCalledWith(
      {},
      "11111111-1111-1111-1111-111111111111",
      "abc",
    );
    expect(res.text).toContain("unsubscribed");
  });
});

describe("DELETE /v1/saved-searches/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("returns 404 for a non-uuid id", async () => {
    const app = buildApp();

    const res = await request(app).delete("/v1/saved-searches/not-a-uuid");

    expect(res.status).toBe(404);
  });

  it("returns 404 when nothing was deleted", async () => {
    vi.mocked(deleteSavedSearch).mockResolvedValue(false);
    const app = buildApp();

    const res = await request(app).delete(
      "/v1/saved-searches/11111111-1111-1111-1111-111111111111",
    );

    expect(res.status).toBe(404);
  });

  it("returns 200 when the row is deleted", async () => {
    vi.mocked(deleteSavedSearch).mockResolvedValue(true);
    const app = buildApp();

    const res = await request(app).delete(
      "/v1/saved-searches/11111111-1111-1111-1111-111111111111",
    );

    expect(res.status).toBe(200);
  });
});
