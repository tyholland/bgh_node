import { Express } from "express";
import {
  cancelUserSub,
  changeCurrency,
  connectedAccountDecision,
  createUser,
  deleteUser,
  removeSharedAccount,
  shareAccount,
  updateUserSub,
} from "../controllers/user";
import {
  addBudgetItem,
  createBudget,
  deleteBudgetItem,
  getBudget,
  updateBudgetItem,
} from "../controllers/budget";
import { addCategory, deleteCategory } from "../controllers/category";
import {
  getClientBudget,
  getClientData,
  startTrialPlan,
  updateReferralName,
} from "../controllers/referrals";
import { auth } from "express-oauth2-jwt-bearer";

const requireAuth = auth({
  audience: process.env.AUTH0_AUDIENCE,
  issuerBaseURL: process.env.AUTH0_BASE_URL,
});

export const privateRoutes = (app: Express) => {
  // Create User
  app.post("/user/create", requireAuth, createUser);

  // Delete User
  app.put("/user/remove", requireAuth, deleteUser);

  // Share account
  app.post("/user/share", requireAuth, shareAccount);

  // Decide to share account
  app.post("/user/share/decide", requireAuth, connectedAccountDecision);

  // Remove share account access
  app.put("/user/share/remove", requireAuth, removeSharedAccount);

  // Update user subscription
  app.put("/user/update/sub", requireAuth, updateUserSub);

  // Cancel user subscription
  app.put("/user/cancel/sub", requireAuth, cancelUserSub);

  // Change currency
  app.put("/user/currency", requireAuth, changeCurrency);

  // Get Budget
  app.get("/budget", requireAuth, getBudget);

  // Create Budget
  app.post("/budget/create", requireAuth, createBudget);

  // Update Budget Item
  app.put("/budget/update", requireAuth, updateBudgetItem);

  // Add Budget Item
  app.post("/budget/add", requireAuth, addBudgetItem);

  // Delete Budget Item
  app.delete("/budget/remove", requireAuth, deleteBudgetItem);

  // Create Category
  app.post("/category/create", requireAuth, addCategory);

  // Delete Category
  app.put("/category/remove", requireAuth, deleteCategory);

  // Update Client Name
  app.put("/referral/name", requireAuth, updateReferralName);

  // Get Client Data
  app.get("/referral/client/:client_id", requireAuth, getClientData);

  // Get Client Budget
  app.get("/referral/budget/:client_id", requireAuth, getClientBudget);

  // Medal Game Start Trial Plan
  app.put("/referral/start", requireAuth, startTrialPlan);
};
