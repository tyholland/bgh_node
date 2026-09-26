import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/db/client", () => ({ instance: vi.fn() }));
vi.mock("../../src/db/users.repo", () => ({
  getUserByUid: vi.fn(),
  upsertUser: vi.fn(),
}));
vi.mock("../../src/auth/verifyIdToken", () => ({
  requireFirebaseAuth: (_req: Request, res: Response, next: NextFunction) => {
    res.locals.firebaseUid = "uid-123";
    next();
  },
}));

import { instance } from "../../src/db/client";
import { getUserByUid, upsertUser } from "../../src/db/users.repo";
import { usersRoutes } from "../../src/routes/users";
import type { UserRecord } from "../../src/types";

const buildApp = () => {
  const app = express();
  app.use(express.json());
  usersRoutes(app);
  return app;
};

const validProfile = {
  uid: "uid-123",
  email: "a@example.com",
  displayName: "A",
  phoneNumber: null,
  photoURL: null,
  providerId: "password",
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

describe("POST /v1/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("rejects a uid that doesn't match the authenticated caller", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/users")
      .send({ ...validProfile, uid: "someone-else" });

    expect(res.status).toBe(403);
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it("creates the profile when uid matches the authenticated caller", async () => {
    const app = buildApp();

    const res = await request(app).post("/v1/users").send(validProfile);

    expect(res.status).toBe(201);
    expect(upsertUser).toHaveBeenCalledWith({}, validProfile);
  });

  it("rejects an invalid profile shape", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/v1/users")
      .send({ ...validProfile, email: "not-an-email" });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /v1/users/:uid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(instance).mockReturnValue({} as never);
  });

  it("returns 404 when the profile doesn't exist yet", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(null);
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/users/uid-123")
      .send(validProfile);

    expect(res.status).toBe(404);
  });

  it("rejects a uid that doesn't match the URL param", async () => {
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/users/someone-else")
      .send(validProfile);

    expect(res.status).toBe(403);
  });

  it("updates the profile when it exists", async () => {
    vi.mocked(getUserByUid).mockResolvedValue(fakeUser);
    const app = buildApp();

    const res = await request(app)
      .patch("/v1/users/uid-123")
      .send(validProfile);

    expect(res.status).toBe(200);
    expect(upsertUser).toHaveBeenCalledWith({}, validProfile);
  });
});
