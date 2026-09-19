import { Express, Request, Response } from "express";
import { z } from "zod";
import { instance } from "../db/client";
import { getUserByUid, upsertUser } from "../db/users.repo";
import { requireFirebaseAuth } from "../auth/verifyIdToken";

const userProfileSchema = z.object({
  uid: z.string().min(1),
  email: z.string().email().nullable(),
  displayName: z.string().max(200).nullable(),
  phoneNumber: z.string().max(30).nullable(),
  photoURL: z.string().url().nullable(),
  providerId: z.string().min(1),
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

const patchUserHandler = async (req: Request, res: Response) => {
  const parsed = userProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, err: "Invalid request" });
  }

  if (
    parsed.data.uid !== req.params.uid ||
    parsed.data.uid !== res.locals.firebaseUid
  ) {
    return res.status(403).json({ ok: false, err: "uid mismatch" });
  }

  const pool = instance();
  const existing = await getUserByUid(pool, parsed.data.uid);

  if (!existing) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  await upsertUser(pool, parsed.data);

  return res.status(200).json({ ok: true });
};

export const usersRoutes = (app: Express) => {
  app.post("/v1/users", requireFirebaseAuth, (req, res) => {
    postUsersHandler(req, res).catch((err) => {
      res.status(500).json({ ok: false, err: String(err) });
    });
  });

  app.patch("/v1/users/:uid", requireFirebaseAuth, (req, res) => {
    patchUserHandler(req, res).catch((err) => {
      res.status(500).json({ ok: false, err: String(err) });
    });
  });
};
