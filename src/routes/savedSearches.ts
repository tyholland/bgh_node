import { Express, Request, Response } from "express";
import { z } from "zod";
import { instance } from "../db/client";
import {
  deleteSavedSearch,
  insertSavedSearch,
  listSavedSearchesByUid,
} from "../db/savedSearches.repo";
import { requireFirebaseAuth } from "../auth/verifyIdToken";
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

const savedSearchSchema = z.object({
  name: z.string().max(100).optional(),
  params: urlParamsSchema,
});

const idParamSchema = z.string().uuid();

const toResponse = (record: SavedSearchRecord) => ({
  id: record.id,
  uid: record.uid,
  name: record.name,
  params: record.params,
  createdAt: record.created_at,
});

const postSavedSearchHandler = async (req: Request, res: Response) => {
  const parsed = savedSearchSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ ok: false, err: "Invalid request" });
  }

  const pool = instance();
  const record = await insertSavedSearch(
    pool,
    res.locals.firebaseUid,
    parsed.data.name ?? null,
    parsed.data.params,
  );

  return res.status(201).json(toResponse(record));
};

const getSavedSearchesHandler = async (req: Request, res: Response) => {
  const pool = instance();
  const records = await listSavedSearchesByUid(pool, res.locals.firebaseUid);

  return res.status(200).json({ savedSearches: records.map(toResponse) });
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

export const savedSearchesRoutes = (app: Express) => {
  app.post("/v1/saved-searches", requireFirebaseAuth, (req, res) => {
    postSavedSearchHandler(req, res).catch((err) => {
      res.status(500).json({ ok: false, err: String(err) });
    });
  });

  app.get("/v1/saved-searches", requireFirebaseAuth, (req, res) => {
    getSavedSearchesHandler(req, res).catch((err) => {
      res.status(500).json({ ok: false, err: String(err) });
    });
  });

  app.delete("/v1/saved-searches/:id", requireFirebaseAuth, (req, res) => {
    deleteSavedSearchHandler(req, res).catch((err) => {
      res.status(500).json({ ok: false, err: String(err) });
    });
  });
};
