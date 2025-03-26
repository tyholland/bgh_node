import { Express } from "express";
import { createUser, deleteUser } from "../controllers/user";
import {
  addBudgetItem,
  createBudget,
  deleteBudgetItem,
  getBudget,
  updateBudgetItem,
} from "../controllers/budget";

export const routes = (app: Express) => {
  // Create User
  app.post("/user/create", createUser);

  // Delete User
  app.put("/user/remove", deleteUser);

  // Get Budget
  app.get("/budget", getBudget);

  // Create Budget
  app.post("/budget/create", createBudget);

  // Update Budget Item
  app.put("/budget/update", updateBudgetItem);

  // Add Budget Item
  app.post("/budget/add", addBudgetItem);

  // Delete Budget Item
  app.delete("/budget/remove", deleteBudgetItem);
};
