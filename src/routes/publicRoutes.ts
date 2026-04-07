import { Express } from "express";
import {
  heiproDetailsEndpoint,
  heiproEndpoint,
  heiproMultiDetailsEndpoint,
} from "../controllers/heipro";

export const publicRoutes = (app: Express) => {
  // Potential Clients
  app.get("/heipro", heiproEndpoint);

  // Clients Details
  app.get("/heipro/details", heiproDetailsEndpoint);

  // Multiple Clients Details
  app.post("/heipro/multi", heiproMultiDetailsEndpoint);
};
