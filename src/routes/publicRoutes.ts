import { Express } from "express";
import { heiproEndpoint } from "../controllers/heipro";

export const publicRoutes = (app: Express) => {
  // Get Job Listings
  app.get("/listings", heiproEndpoint);

  // Update Job Listings
  app.get("/listings/update", heiproEndpoint);
};
