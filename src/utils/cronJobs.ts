// import cron from "node-cron";
import { addBudgetForNewYear } from "../controllers/budget";

export const budgetNewYear = () => {
  // cron.schedule("*/30 * * 12 *", () => {
  addBudgetForNewYear();
  // });
};
