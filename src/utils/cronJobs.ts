import cron from "node-cron";
import { addBudgetForNewYear } from "../controllers/budget";

export const budgetNewYear = () => {
  cron.schedule("0 * * 12 *", () => {
    addBudgetForNewYear();
  });
};
