import { Express, Request, Response } from "express";
import { z } from "zod";
import { instance } from "../db/client";
import {
  deleteSavedJob,
  insertSavedJob,
  listSavedJobsByUid,
} from "../db/savedJobs.repo";
import { getUserByUid } from "../db/users.repo";
import { requireFirebaseAuth } from "../auth/verifyIdToken";
import { logger } from "../lib/logger";
import { SavedJobRecord } from "../types";

const savedJobSchema = z
  .object({
    jobId: z.string().min(1).max(200),
    roleName: z.string().min(1).max(300),
    company: z.string().max(300).nullish(),
    link: z.string().url().max(2000),
  })
  .strict();

const idParamSchema = z.string().uuid();

const toResponse = (record: SavedJobRecord) => ({
  id: record.id,
  uid: record.uid,
  jobId: record.job_id,
  roleName: record.role_name,
  company: record.company,
  link: record.link,
  createdAt: record.created_at,
});

const postSavedJobHandler = async (req: Request, res: Response) => {
  const parsed = savedJobSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, err: "Invalid request" });
  }

  const pool = instance();
  const user = await getUserByUid(pool, res.locals.firebaseUid);

  if (!user) {
    return res
      .status(409)
      .json({ ok: false, err: "User profile not found; create it first" });
  }

  const record = await insertSavedJob(pool, res.locals.firebaseUid, {
    jobId: parsed.data.jobId,
    roleName: parsed.data.roleName,
    company: parsed.data.company,
    link: parsed.data.link,
  });

  return res.status(201).json(toResponse(record));
};

const getSavedJobsHandler = async (req: Request, res: Response) => {
  const pool = instance();
  const records = await listSavedJobsByUid(pool, res.locals.firebaseUid);

  return res.status(200).json({ savedJobs: records.map(toResponse) });
};

const deleteSavedJobHandler = async (req: Request, res: Response) => {
  const parsedId = idParamSchema.safeParse(req.params.id);

  if (!parsedId.success) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  const pool = instance();
  const deleted = await deleteSavedJob(
    pool,
    parsedId.data,
    res.locals.firebaseUid,
  );

  if (!deleted) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  return res.status(200).json({ ok: true });
};

const handleError = (label: string, res: Response) => (err: unknown) => {
  logger.error(label, err);
  res.status(500).json({ ok: false, err: "Internal server error" });
};

export const savedJobsRoutes = (app: Express) => {
  app.post("/v1/saved-jobs", requireFirebaseAuth, (req, res) => {
    postSavedJobHandler(req, res).catch(
      handleError("Failed to create saved job", res),
    );
  });

  app.get("/v1/saved-jobs", requireFirebaseAuth, (req, res) => {
    getSavedJobsHandler(req, res).catch(
      handleError("Failed to list saved jobs", res),
    );
  });

  app.delete("/v1/saved-jobs/:id", requireFirebaseAuth, (req, res) => {
    deleteSavedJobHandler(req, res).catch(
      handleError("Failed to delete saved job", res),
    );
  });
};
