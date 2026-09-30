import { Express, Request, Response } from "express";
import { z } from "zod";
import { instance } from "../db/client";
import {
  getUserByUid,
  updateUserPartial,
  upsertUser,
  UserPatch,
} from "../db/users.repo";
import { requireFirebaseAuth } from "../auth/verifyIdToken";
import { logger } from "../lib/logger";
import { UserRecord } from "../types";

const userProfileSchema = z.object({
  uid: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().max(200).nullable(),
  phoneNumber: z.string().max(30).nullable(),
  photoURL: z.string().url().nullable(),
  providerId: z.string().min(1),
});

// A PARTIAL update — only keys present in the body are merged (§5 PATCH
// /v1/users/:uid). `uid`, when present, is checked against the route/token
// but is never itself written.
const userPatchSchema = z.object({
  uid: z.string().min(1).optional(),
  email: z.string().email().nullable().optional(),
  displayName: z.string().max(200).nullable().optional(),
  phoneNumber: z.string().max(30).nullable().optional(),
  photoURL: z.string().url().nullable().optional(),
  providerId: z.string().min(1).optional(),
  emailNotifications: z.boolean().optional(),
});

const serializeUser = (user: UserRecord) => ({
  uid: user.uid,
  email: user.email,
  displayName: user.display_name,
  phoneNumber: user.phone_number,
  photoURL: user.photo_url,
  providerId: user.provider_id,
  emailNotifications: user.email_notifications,
});

const postUsersHandler = async (req: Request, res: Response) => {
  const parsed = userProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, err: "Invalid request" });
  }

  if (parsed.data.uid !== res.locals.firebaseUid) {
    return res.status(403).json({ ok: false, err: "uid mismatch" });
  }

  const pool = instance();
  await upsertUser(pool, parsed.data);

  return res.status(201).json({ ok: true });
};

const getUserHandler = async (req: Request, res: Response) => {
  if (req.params.uid !== res.locals.firebaseUid) {
    return res.status(403).json({ ok: false, err: "uid mismatch" });
  }

  const pool = instance();
  const user = await getUserByUid(pool, req.params.uid);

  if (!user) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  return res.status(200).json(serializeUser(user));
};

const patchUserHandler = async (req: Request, res: Response) => {
  const parsed = userPatchSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, err: "Invalid request" });
  }

  if (
    req.params.uid !== res.locals.firebaseUid ||
    (parsed.data.uid !== undefined && parsed.data.uid !== req.params.uid)
  ) {
    return res.status(403).json({ ok: false, err: "uid mismatch" });
  }

  const pool = instance();
  const existing = await getUserByUid(pool, req.params.uid);

  if (!existing) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  const patch: UserPatch = {};
  if (parsed.data.email !== undefined) patch.email = parsed.data.email;
  if (parsed.data.displayName !== undefined)
    patch.displayName = parsed.data.displayName;
  if (parsed.data.phoneNumber !== undefined)
    patch.phoneNumber = parsed.data.phoneNumber;
  if (parsed.data.photoURL !== undefined) patch.photoURL = parsed.data.photoURL;
  if (parsed.data.providerId !== undefined)
    patch.providerId = parsed.data.providerId;
  if (parsed.data.emailNotifications !== undefined)
    patch.emailNotifications = parsed.data.emailNotifications;

  await updateUserPartial(pool, req.params.uid, patch);

  return res.status(200).json({ ok: true });
};

const handleError = (label: string, res: Response) => (err: unknown) => {
  logger.error(label, err);
  res.status(500).json({ ok: false, err: "Internal server error" });
};

export const usersRoutes = (app: Express) => {
  app.post("/v1/users", requireFirebaseAuth, (req, res) => {
    postUsersHandler(req, res).catch(handleError("Failed to create user", res));
  });

  app.get("/v1/users/:uid", requireFirebaseAuth, (req, res) => {
    getUserHandler(req, res).catch(handleError("Failed to get user", res));
  });

  app.patch("/v1/users/:uid", requireFirebaseAuth, (req, res) => {
    patchUserHandler(req, res).catch(handleError("Failed to update user", res));
  });
};
