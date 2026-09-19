import { Express } from "express";
import { createUser, updateUser } from "../controllers/user";
import { auth } from "express-oauth2-jwt-bearer";

const requireAuth = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_BASE_URL,
});

export const privateRoutes = (app: Express) => {
  // Create User
  app.post("/user/create", requireAuth, createUser);

  // Update & Delete User
  app.put("/user/update", requireAuth, updateUser);

  // Create Saved Search
  app.post("/saved-search/create", requireAuth, createUser);

  // Update & Delete User
  app.post("/saved-search/update", requireAuth, createUser);
};
