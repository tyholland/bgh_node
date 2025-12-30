import { Request, Response } from "express";
import { listOfMonths } from "../utils/constants";
import { instance } from "../utils/postgres";
import {
  AddedBudgetItem,
  Budget,
  BudgetDate,
  BudgetInsertIds,
  BudgetItem,
  BudgetParam,
  User,
} from "../utils/types";
import {
  getUserId,
  updateBasedOnCadence,
  insertBasedOnCadence,
  getBudgetInformation,
} from "../utils/functions";
import dayjs from "dayjs";

export const createBudget = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { budgetData } = req.body;
    const auth_id = req.auth?.payload.sub;
    const count = listOfMonths.length - 1;
    const date = new Date();
    const insertIds: BudgetInsertIds[] = [];
    let user_id: number | undefined;

    try {
      user_id = await getUserId(auth_id, client);

      if (!user_id) {
        return res.status(500).json({
          action: "User doesn't exist",
        });
      }
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
          const {
            type,
            label,
            amount,
            paid,
            month,
            year,
            frequency,
            category_id,
          }: BudgetParam = budgetData[b];
          if (month === insertMonth && year === insertYear) {
            const insert =
              "INSERT into budget(type, label, amount, paid, user_id, budget_date_id, modified_at, frequency, category_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, budget_date_id";
            const values = [
              type,
              label,
              amount,
              paid,
              user_id,
              budgetDateId.rows[0].id,
              currentDate,
              frequency,
              category_id,
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
    const client = instance();
    const responseBody: BudgetItem = req.body;
    const auth_id = req.auth?.payload.sub;
    let user_id: number | undefined;
    const update =
      "UPDATE budget SET label = $1, amount = $2, paid = $3, modified_at = $4, frequency = $5, category_id = $6 WHERE id = $7";
    let budgetInfo;
    let budgetData;

    try {
      user_id = await getUserId(auth_id, client);

      if (!user_id) {
        return res.status(500).json({
          action: "User doesn't exist",
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id",
      });
    }

    // Get the type and label of the specific budget
    try {
      budgetInfo = await client.query(
        "SELECT type, label FROM budget WHERE id = $1",
        [responseBody.budget_id],
      );
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Check if budget exists",
      });
    }

    // Get all the budgets that match the type and label
    try {
      budgetData = await client.query<Budget>(
        "SELECT * FROM budget WHERE type = $1 AND label = $2 ORDER BY budget_date_id ASC",
        [budgetInfo.rows[0].type, budgetInfo.rows[0].label],
      );
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Check all budgets that meet a certain criteria",
      });
    }

    // Update budget data
    try {
      await updateBasedOnCadence(client, responseBody, budgetData, update);

      try {
        await getBudgetInformation(res, client, user_id);
      } catch (err) {
        return res.status(500).json({
          err,
          action: "updateBudgetItem - getBudgetInformation",
        });
      }
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
    const client = instance();
    const responseBody: AddedBudgetItem = req.body;
    const auth_id = req.auth?.payload.sub;
    let user_id: number | undefined;

    try {
      user_id = await getUserId(auth_id, client);

      if (!user_id) {
        return res.status(500).json({
          action: "User doesn't exist",
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Check if user_id is present",
      });
    }

    const insert =
      "INSERT into budget(type, label, amount, paid, user_id, budget_date_id, modified_at, frequency, category_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)";

    try {
      await insertBasedOnCadence(client, responseBody, insert, user_id);

      try {
        await getBudgetInformation(res, client, user_id);
      } catch (err) {
        return res.status(500).json({
          err,
          action: "addBudgetItem - getBudgetInformation",
        });
      }
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
    const client = instance();
    const auth_id = req.auth?.payload.sub;
    let user_id: number | undefined;

    try {
      user_id = await getUserId(auth_id, client);

      if (!user_id) {
        return res.status(500).json({
          action: "User doesn't exist",
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id",
      });
    }

    try {
      await getBudgetInformation(res, client, user_id);
    } catch (err) {
      return res.status(500).json({
        err,
        action: "getBudget - getBudgetInformation",
      });
    }
  })();
};

export const deleteBudgetItem = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const auth_id = req.auth?.payload.sub;
    const { budget_id } = req.body;
    let user_id: number | undefined;

    try {
      user_id = await getUserId(auth_id, client);

      if (!user_id) {
        return res.status(500).json({
          action: "User doesn't exist",
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id",
      });
    }

    try {
      await client.query("DELETE FROM budget WHERE id = $1", [budget_id]);

      try {
        await getBudgetInformation(res, client, user_id);
      } catch (err) {
        return res.status(500).json({
          err,
          action: "deleteBudgetItem - getBudgetInformation",
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Delete budget item",
      });
    }
  })();
};

export const addBudgetForNewYear = () => {
  (async () => {
    const client = instance();
    const count = listOfMonths.length - 1;
    let users: User[];
    let budgetData: Budget[] = [];

    try {
      const userData = await client.query<User>("SELECT * FROM users");
      users = userData.rows;
    } catch {
      throw new Error("Failed to get all users");
    }

    for (let j = 0; j <= users.length; j++) {
      const user = users[j];

      try {
        const budgetDate = await client.query<BudgetDate>(
          "SELECT * FROM budget_date WHERE user_id = $1",
          [user.id],
        );
        const budgetIds = budgetDate.rows.map((item) => {
          if (item.year === dayjs().year()) {
            return item.id;
          }

          return 0;
        });
        const highestNumber = Math.max(...budgetIds);

        if (
          budgetDate.rows.some(
            (item) => item.year === dayjs().add(1, "year").year(),
          )
        ) {
          return;
        }

        try {
          const oldBudget = await client.query<Budget>(
            "SELECT * FROM budget WHERE budget_date_id = $1",
            [highestNumber],
          );

          budgetData = oldBudget.rows;
        } catch {
          throw new Error("Failed to get old budget info");
        }
      } catch {
        throw new Error("Failed to get old budget dates");
      }

      for (let i = 0; i <= count; i++) {
        const insertMonth = listOfMonths[i];
        const insertYear = dayjs().add(1, "year").year();
        const currentDate = new Date(Date.now()).toISOString();
        const insert =
          "INSERT into budget_date(month, year, user_id, modified_at) VALUES ($1, $2, $3, $4) RETURNING id";
        const values = [insertMonth, insertYear, user.id, currentDate];

        try {
          const budgetDateId = await client.query(insert, values);

          for (let b = 0; b <= budgetData.length - 1; b++) {
            const {
              type,
              label,
              amount,
              paid,
              frequency,
              category_id,
            }: BudgetParam = budgetData[b];

            const budgetInsert =
              "INSERT into budget(type, label, amount, paid, user_id, budget_date_id, modified_at, frequency, category_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, budget_date_id";
            const budgetValues = [
              type,
              label,
              amount,
              paid,
              user.id,
              budgetDateId.rows[0].id,
              currentDate,
              frequency,
              category_id,
              currentDate,
            ];

            try {
              await client.query(budgetInsert, budgetValues);
            } catch {
              throw new Error("Failed to add new budget");
            }
          }
        } catch {
          throw new Error("Failed to add new budget date");
        }
      }
    }
  })();
};
