import { Express } from "express";
import { heiproDetailsEndpoint, heiproEndpoint } from "../controllers/heipro";

export const publicRoutes = (app: Express) => {
  // Potential Clients
  app.get("/heipro", heiproEndpoint);

  // Clients Details
  app.get("/heipro/details", heiproDetailsEndpoint);
};
