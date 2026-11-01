import { Express, Request, Response } from "express";
import { z } from "zod";
import { instance } from "../db/client";
import {
  deleteSavedJob,
  insertSavedJob,
  listSavedJobsByUid,
  unsubscribeSavedJob,
  updateSavedJobAlertFrequency,
} from "../db/savedJobs.repo";
import { getUserByUid } from "../db/users.repo";
import { requireFirebaseAuth } from "../auth/verifyIdToken";
import { logger } from "../lib/logger";
import { SavedJobRecord } from "../types";

const alertFrequencySchema = z.enum(["off", "daily"]);

const savedJobSchema = z
  .object({
    jobId: z.string().min(1).max(200),
    roleName: z.string().min(1).max(300),
    company: z.string().max(300).nullish(),
    link: z.string().url().max(2000),
    alertFrequency: alertFrequencySchema.optional(),
  })
  .strict();

const updateSavedJobSchema = z.object({
  alertFrequency: alertFrequencySchema,
});

const idParamSchema = z.string().uuid();

const toResponse = (record: SavedJobRecord) => ({
  id: record.id,
  uid: record.uid,
  jobId: record.job_id,
  roleName: record.role_name,
  company: record.company,
  link: record.link,
  alertFrequency: record.alert_frequency,
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
    alertFrequency: parsed.data.alertFrequency ?? "off",
  });

  return res.status(201).json(toResponse(record));
};

const getSavedJobsHandler = async (req: Request, res: Response) => {
  const pool = instance();
  const records = await listSavedJobsByUid(pool, res.locals.firebaseUid);

  return res.status(200).json({ savedJobs: records.map(toResponse) });
};

const patchSavedJobHandler = async (req: Request, res: Response) => {
  const parsedId = idParamSchema.safeParse(req.params.id);
  const parsedBody = updateSavedJobSchema.safeParse(req.body);

  if (!parsedId.success) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  if (!parsedBody.success) {
    return res.status(400).json({ ok: false, err: "Invalid request" });
  }

  const pool = instance();
  const updated = await updateSavedJobAlertFrequency(
    pool,
    parsedId.data,
    res.locals.firebaseUid,
    parsedBody.data.alertFrequency,
  );

  if (!updated) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  return res.status(200).json({ ok: true });
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

const unsubscribePage = (message: string) => `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>BGH Scout</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">
<p>${message}</p>
</body>
</html>`;

// Public — reached straight from an email link, with no Firebase session to
// check. Ownership is proven by the unsubscribe_token instead (see
// migration 011).
const unsubscribeSavedJobHandler = async (req: Request, res: Response) => {
  const parsedId = idParamSchema.safeParse(req.params.id);
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (!parsedId.success || !token) {
    return res
      .status(404)
      .type("html")
      .send(unsubscribePage("That unsubscribe link isn't valid."));
  }

  const pool = instance();
  const unsubscribed = await unsubscribeSavedJob(pool, parsedId.data, token);

  if (!unsubscribed) {
    return res
      .status(404)
      .type("html")
      .send(unsubscribePage("That unsubscribe link isn't valid."));
  }

  return res
    .status(200)
    .type("html")
    .send(
      unsubscribePage(
        "You've been unsubscribed from alerts for this saved job.",
      ),
    );
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

  app.patch("/v1/saved-jobs/:id", requireFirebaseAuth, (req, res) => {
    patchSavedJobHandler(req, res).catch(
      handleError("Failed to update saved job", res),
    );
  });

  app.get("/v1/saved-jobs/:id/unsubscribe", (req, res) => {
    unsubscribeSavedJobHandler(req, res).catch((err) => {
      logger.error("Failed to unsubscribe saved job", err);
      res
        .status(500)
        .type("html")
        .send(unsubscribePage("Something went wrong. Please try again later."));
    });
  });

  app.delete("/v1/saved-jobs/:id", requireFirebaseAuth, (req, res) => {
    deleteSavedJobHandler(req, res).catch(
      handleError("Failed to delete saved job", res),
    );
  });
};
