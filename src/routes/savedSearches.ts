import { Express, Request, Response } from "express";
import { z } from "zod";
import { instance } from "../db/client";
import {
  deleteSavedSearch,
  insertSavedSearch,
  listSavedSearchesByUid,
  unsubscribeSavedSearch,
  updateSavedSearchAlertFrequency,
} from "../db/savedSearches.repo";
import { getUserByUid } from "../db/users.repo";
import { requireFirebaseAuth } from "../auth/verifyIdToken";
import { logger } from "../lib/logger";
import { SavedSearchRecord } from "../types";

const urlParamsSchema = z
  .object({
    search: z.string().max(500),
    company: z.string().max(500),
    date: z.string().max(500),
    exact: z.string().max(500),
    keyword: z.string().max(500),
    industry: z.string().max(500),
    sort: z.string().max(500),
  })
  .partial()
  .strict();

const alertFrequencySchema = z.enum(["off", "daily", "weekly"]);

const savedSearchSchema = z.object({
  name: z.string().max(100).optional(),
  params: urlParamsSchema,
  alertFrequency: alertFrequencySchema.optional(),
});

const updateSavedSearchSchema = z.object({
  alertFrequency: alertFrequencySchema,
});

const idParamSchema = z.string().uuid();

const toResponse = (record: SavedSearchRecord) => ({
  id: record.id,
  uid: record.uid,
  name: record.name,
  params: record.params,
  alertFrequency: record.alert_frequency,
  createdAt: record.created_at,
});

const postSavedSearchHandler = async (req: Request, res: Response) => {
  const parsed = savedSearchSchema.safeParse(req.body);

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

  const record = await insertSavedSearch(
    pool,
    res.locals.firebaseUid,
    parsed.data.name ?? null,
    parsed.data.params,
    parsed.data.alertFrequency ?? "off",
  );

  return res.status(201).json(toResponse(record));
};

const getSavedSearchesHandler = async (req: Request, res: Response) => {
  const pool = instance();
  const records = await listSavedSearchesByUid(pool, res.locals.firebaseUid);

  return res.status(200).json({ savedSearches: records.map(toResponse) });
};

const patchSavedSearchHandler = async (req: Request, res: Response) => {
  const parsedId = idParamSchema.safeParse(req.params.id);
  const parsedBody = updateSavedSearchSchema.safeParse(req.body);

  if (!parsedId.success) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  if (!parsedBody.success) {
    return res.status(400).json({ ok: false, err: "Invalid request" });
  }

  const pool = instance();
  const updated = await updateSavedSearchAlertFrequency(
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

const deleteSavedSearchHandler = async (req: Request, res: Response) => {
  const parsedId = idParamSchema.safeParse(req.params.id);

  if (!parsedId.success) {
    return res.status(404).json({ ok: false, err: "Not found" });
  }

  const pool = instance();
  const deleted = await deleteSavedSearch(
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
// migration 009). Only ever turns this one search's alerts off, never the
// account-wide email_notifications switch.
const unsubscribeSavedSearchHandler = async (req: Request, res: Response) => {
  const parsedId = idParamSchema.safeParse(req.params.id);
  const token = typeof req.query.token === "string" ? req.query.token : "";

  if (!parsedId.success || !token) {
    return res
      .status(404)
      .type("html")
      .send(unsubscribePage("That unsubscribe link isn't valid."));
  }

  const pool = instance();
  const unsubscribed = await unsubscribeSavedSearch(pool, parsedId.data, token);

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
        "You've been unsubscribed from alerts for this saved search.",
      ),
    );
};

const handleError = (label: string, res: Response) => (err: unknown) => {
  logger.error(label, err);
  res.status(500).json({ ok: false, err: "Internal server error" });
};

export const savedSearchesRoutes = (app: Express) => {
  app.post("/v1/saved-searches", requireFirebaseAuth, (req, res) => {
    postSavedSearchHandler(req, res).catch(
      handleError("Failed to create saved search", res),
    );
  });

  app.get("/v1/saved-searches", requireFirebaseAuth, (req, res) => {
    getSavedSearchesHandler(req, res).catch(
      handleError("Failed to list saved searches", res),
    );
  });

  app.patch("/v1/saved-searches/:id", requireFirebaseAuth, (req, res) => {
    patchSavedSearchHandler(req, res).catch(
      handleError("Failed to update saved search", res),
    );
  });

  app.get("/v1/saved-searches/:id/unsubscribe", (req, res) => {
    unsubscribeSavedSearchHandler(req, res).catch((err) => {
      logger.error("Failed to unsubscribe saved search", err);
      res
        .status(500)
        .type("html")
        .send(unsubscribePage("Something went wrong. Please try again later."));
    });
  });

  app.delete("/v1/saved-searches/:id", requireFirebaseAuth, (req, res) => {
    deleteSavedSearchHandler(req, res).catch(
      handleError("Failed to delete saved search", res),
    );
  });
};
