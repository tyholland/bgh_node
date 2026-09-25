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

  it("creates a saved search once the user profile exists", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(fakeUser);

    const created: SavedSearchRecord = {
      id: "11111111-1111-1111-1111-111111111111",
      uid: "uid-123",
      name: null,
      params: { search: "engineer" },
      created_at: new Date().toISOString(),
    };
    vi.mocked(insertSavedSearch).mockResolvedValue(created);

    const app = buildApp();

    const res = await request(app)
      .post("/v1/saved-searches")
      .send({ params: { search: "engineer" } });

    expect(res.status).toBe(201);
    expect(insertSavedSearch).toHaveBeenCalledWith({}, "uid-123", null, {
      search: "engineer",
    });
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
