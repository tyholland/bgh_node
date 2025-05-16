import { Express } from "express";
import {
  connectedAccountDecision,
  createUser,
  deleteUser,
  shareAccount,
} from "../controllers/user";
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

  // share account
  app.post("/user/share", shareAccount);

  // decide to share account
  app.post("/user/share/decide", connectedAccountDecision);

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
