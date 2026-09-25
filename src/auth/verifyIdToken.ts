import { Request, Response } from "express";
import { App, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { env } from "../lib/env";
import { logger } from "../lib/logger";

let app: App | undefined;

const getFirebaseApp = (): App => {
  if (app) {
    return app;
  }

  if (!env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT is not configured");
  }

  app = initializeApp({
    credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)),
  });

  return app;
};

export const requireFirebaseAuth = (
  req: Request,
  res: Response,
  next: () => void,
): void => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    res.status(401).json({ ok: false, err: "Unauthorized" });
    return;
  }

  let firebaseApp: App;

  try {
    firebaseApp = getFirebaseApp();
  } catch (err) {
    logger.error("Firebase admin is not configured", err);
    res.status(500).json({ ok: false, err: "Auth not configured" });
    return;
  }

  getAuth(firebaseApp)
    .verifyIdToken(token)
    .then((decoded) => {
      res.locals.firebaseUid = decoded.uid;
      next();
    })
    .catch((err: unknown) => {
      logger.warn("Firebase token verification failed", err);
      res.status(401).json({ ok: false, err: "Unauthorized" });
    });
};
