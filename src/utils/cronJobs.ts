import cron from "node-cron";
import { addBudgetForNewYear } from "../controllers/budget";

export const budgetNewYear = () => {
  cron.schedule("0 */10 * 12 *", () => {
    addBudgetForNewYear();
  });
};
