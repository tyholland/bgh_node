import { Request, Response } from "express";
import { listOfMonths } from "../utils";
import client from "../utils/postgres";
import {
  Budget,
  BudgetDate,
  BudgetInsertIds,
  BudgetItem,
  BudgetParam,
  BudgetResponse,
  User,
} from "../utils/types";

const getUserId = async (auth_id: string | undefined) => {
  const user = await client.query<User>(
    "SELECT * FROM users WHERE auth_id = $1 AND active = $2",
    [auth_id, true],
  );

  return user.rows[0].id;
};

export const createBudget = (req: Request, res: Response) => {
  (async () => {
    const { budgetData } = req.body;
    const auth_id = req.auth?.payload.sub;
    const count = listOfMonths.length - 1;
    const date = new Date();
    const insertIds: BudgetInsertIds[] = [];
    let user_id: number;

    try {
      user_id = await getUserId(auth_id);
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Check if user_id is present",
      });
    }

    for (let i = 0; i <= count; i++) {
      const insertMonth = listOfMonths[i];
      const insertYear = date.getFullYear();
      const currentDate = new Date(Date.now()).toISOString();
      const insert =
        "INSERT into budget_date(month, year, user_id, modified_at) VALUES ($1, $2, $3, $4) RETURNING id";
      const values = [insertMonth, insertYear, user_id, currentDate];

      try {
        const budgetDateId = await client.query(insert, values);

        for (let b = 0; b <= budgetData.length - 1; b++) {
          const { type, label, amount, paid, month, year } = budgetData[
            b
          ] as BudgetParam;
          if (month === insertMonth && year === insertYear) {
            const insert =
              "INSERT into budget(type, label, amount, paid, user_id, budget_date_id, modified_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, budget_date_id";
            const values = [
              type,
              label,
              amount,
              paid,
              user_id,
              budgetDateId.rows[0].id,
              currentDate,
            ];

            try {
              const budgetInfo = await client.query(insert, values);
              insertIds.push({
                budget_id: budgetInfo.rows[0].id,
                budget_date_id: budgetInfo.rows[0].budget_date_id,
              });
            } catch (err) {
              return res.status(500).json({
                err,
                action: "Insert into budget table",
              });
            }
          }
        }
      } catch (err) {
        return res.status(500).json({
          err,
          action: "Insert into budget_date table",
        });
      }
    }

    return res.status(200).json({
      budget_ids: insertIds,
    });
  })();
};

export const updateBudgetItem = (req: Request, res: Response) => {
  (async () => {
    const { label, value, paid, budget_id } = req.body;
    const currentDate = new Date(Date.now()).toISOString();
    const update =
      "UPDATE budget SET label = $1, amount = $2, paid = $3, modified_at = $4 WHERE id = $5";
    const values = [label, value, paid, currentDate, budget_id];

    try {
      await client.query(update, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Update budget item",
      });
    }
  })();
};

export const addBudgetItem = (req: Request, res: Response) => {
  (async () => {
    const { type, label, value, paid, budget_date_id } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    let user_id: number;

    try {
      user_id = await getUserId(auth_id);
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Check if user_id is present",
      });
    }

    const insert =
      "INSERT into budget(type, label, amount, paid, user_id, budget_date_id, modified_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id";
    const values = [
      type,
      label,
      value,
      paid,
      user_id,
      budget_date_id,
      currentDate,
    ];

    try {
      const budgetId = await client.query(insert, values);

      return res.status(200).json({
        budget_id: budgetId.rows[0].id,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Add budget item",
      });
    }
  })();
};

export const getBudget = (req: Request, res: Response) => {
  (async () => {
    const auth_id = req.auth?.payload.sub;
    let user_id: number;

    try {
      user_id = await getUserId(auth_id);
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id",
      });
    }

    try {
      const budgetDate = await client.query<BudgetDate>(
        "SELECT * FROM budget_date WHERE user_id = $1",
        [user_id],
      );
      const fullBudget: BudgetResponse[] = [];

      for (let i = 0; i <= budgetDate.rows.length - 1; i++) {
        const { id, year, month } = budgetDate.rows[i];
        const income: BudgetItem[] = [];
        const expense: BudgetItem[] = [];

        try {
          const budgetIncome = await client.query<Budget>(
            "SELECT * FROM budget WHERE budget_date_id = $1 AND type = $2",
            [id, "income"],
          );
          const budgetExpense = await client.query<Budget>(
            "SELECT * FROM budget WHERE budget_date_id = $1 AND type = $2",
            [id, "expense"],
          );

          budgetIncome.rows.forEach((response: Budget) => {
            income.push({
              label: response.label,
              value: response.amount,
              paid: response.paid,
              budget_id: response.id,
              budget_date_id: response.budget_date_id,
            });
          });

          budgetExpense.rows.forEach((response: Budget) => {
            expense.push({
              label: response.label,
              value: response.amount,
              paid: response.paid,
              budget_id: response.id,
              budget_date_id: response.budget_date_id,
            });
          });

          fullBudget.push({
            year: year,
            month: month,
            income,
            expense,
          });
        } catch (err) {
          return res.status(500).json({
            err,
            action: "Get budget info",
          });
        }
      }

      return res.status(200).json({
        budget: fullBudget,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get budget_date info",
      });
    }
  })();
};

export const deleteBudgetItem = (req: Request, res: Response) => {
  (async () => {
    const { budget_id } = req.body;

    try {
      await client.query("DELETE FROM budget WHERE id = $1", [budget_id]);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Delete budget item",
      });
    }
  })();
};
