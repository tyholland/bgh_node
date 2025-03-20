import { Express } from "express";

export const routes = (app: Express) => {
  // Get
  app.get("/budget", () => {});

  // Create
  app.post("/create", () => {});

  // Update
  app.put("/update", () => {});

  // Delete
  app.delete("/remove", () => {});
};
