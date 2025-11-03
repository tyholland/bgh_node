import { Request, Response } from "express";
import { instance } from "../utils/postgres";
import {
  Budget,
  BudgetDate,
  BudgetItem,
  BudgetResponse,
  User,
} from "../utils/types";
import { QueryResult } from "pg";
import { sortBudget } from "../utils/functions";

export const updateReferralName = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { first_name, last_name, user_id, referral_code } = req.body;
    const auth_id = req.auth?.payload.sub;
    const update =
      "UPDATE referred_by SET first_name = $1, last_name = $2 WHERE user_id = $3 AND referred_by = $4";
    const values = [first_name, last_name, user_id, referral_code];

    try {
      const correctUser = await client.query(
        "SELECT * FROM referrals r, users u WHERE u.auth_id = $1 AND u.id = r.user_id AND r.referral_code = $2",
        [auth_id, referral_code],
      );

      if (correctUser.rowCount && correctUser.rowCount > 0) {
        try {
          await client.query(update, values);

          return res.status(200).json({
            success: true,
          });
        } catch (err) {
          return res.status(500).json({
            err,
            action: "Update user with referral sub",
          });
        }
      } else {
        return res.status(404).json({
          action: "You don't have access to update this account",
          status: 404,
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Update referral with display name",
      });
    }
  })();
};

export const getClientData = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { client_id } = req.params;
    const auth_id = req.auth?.payload.sub;
    const select = "SELECT * FROM users WHERE id = $1";
    const values = [client_id];

    try {
      const correctUser = await client.query(
        "SELECT * FROM referrals r, users u, referred_by rb WHERE u.auth_id = $1 AND u.id = r.user_id AND rb.referred_by = r.referral_code AND rb.user_id = $2",
        [auth_id, client_id],
      );

      if (correctUser.rowCount && correctUser.rowCount > 0) {
        let budgetInfo: QueryResult<Budget> | undefined = undefined;
        let category;
        const userReferralCode = null;

        try {
          const partnerClient = await client.query<User>(select, values);

          if (partnerClient.rowCount) {
            const user = partnerClient.rows[0];

            try {
              budgetInfo = await client.query<Budget>(
                "SELECT * FROM budget WHERE user_id = $1",
                [user.id],
              );
              category = await client.query(
                "SELECT * FROM category WHERE user_id = $1",
                [user.id],
              );
            } catch (err) {
              console.error(err, "Failed to get Account budget info");
            }

            return res.status(200).json({
              hasBudget: budgetInfo?.rowCount ? budgetInfo.rowCount > 0 : false,
              subscription_id: user.subscription_id,
              connected_message: false,
              is_connected: false,
              categories: category?.rowCount ? category?.rows : [],
              paid_sub: user.paid_sub,
              subscribed_at: user.subscribed_at,
              paypal_sub_id: user.paypal_sub_id,
              referral_code: userReferralCode,
              all_referrals: [],
              currency: user.currency,
            });
          }
        } catch (err) {
          return res.status(500).json({
            err,
            action: "Failed to get client user data",
          });
        }
      } else {
        return res.status(404).json({
          action: "User doesn't have access to client",
          status: 404,
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Failed to confirm partner has access to client",
      });
    }
  })();
};

export const getClientBudget = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { client_id } = req.params;
    const auth_id = req.auth?.payload.sub;

    try {
      const correctUser = await client.query(
        "SELECT * FROM referrals r, users u, referred_by rb WHERE u.auth_id = $1 AND u.id = r.user_id AND rb.referred_by = r.referral_code AND rb.user_id = $2",
        [auth_id, client_id],
      );

      if (correctUser.rowCount && correctUser.rowCount > 0) {
        try {
          const budgetDate = await client.query<BudgetDate>(
            "SELECT * FROM budget_date WHERE user_id = $1",
            [client_id],
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
                  value: Number(response.amount),
                  paid: response.paid,
                  budget_id: response.id,
                  budget_date_id: response.budget_date_id,
                });
              });

              budgetExpense.rows.forEach((response: Budget) => {
                expense.push({
                  label: response.label,
                  value: Number(response.amount),
                  paid: response.paid,
                  frequency: response.frequency,
                  category_id: response.category_id,
                  budget_id: response.id,
                  budget_date_id: response.budget_date_id,
                });
              });

              fullBudget.push({
                year: year,
                month: month,
                income: income.sort(sortBudget),
                expense: expense.sort(sortBudget),
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
      } else {
        return res.status(404).json({
          action: "User doesn't have access to client's budget",
          status: 404,
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Failed to confirm partner has access to client's budget",
      });
    }
  })();
};

export const startTrialPlan = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { plan } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const update =
      "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3, subscribed_at = $4 WHERE auth_id = $5";
    const values = [plan, false, currentDate, currentDate, auth_id];
    let user;

    try {
      await client.query(update, values);

      // Get user
      try {
        user = await client.query<User>(
          "SELECT * FROM users WHERE auth_id = $1",
          [auth_id],
        );
      } catch (err) {
        return res.status(400).json({
          err,
          action: "Failed to find correct user",
        });
      }

      // Update medal game
      try {
        await client.query<User>(
          "UPDATE meda_game SET claimed_prize = $1, modified_at = $2 WHERE user_id = $3",
          [true, currentDate, user?.rows[0].id],
        );
      } catch (err) {
        return res.status(400).json({
          err,
          action: "Failed to update medal game details",
        });
      }

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Update user with medal game trial sub",
      });
    }
  })();
};

export const updateMedalGame = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { is_claimed } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    let user;

    try {
      user = await client.query<User>(
        "SELECT * FROM users WHERE auth_id = $1",
        [auth_id],
      );
    } catch (err) {
      return res.status(400).json({
        err,
        action: "Failed to find correct user",
      });
    }

    try {
      await client.query<User>(
        "UPDATE meda_game SET claimed_prize = $1, modified_at = $2 WHERE user_id = $3",
        [is_claimed, currentDate, user?.rows[0].id],
      );

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Update user with medal game with claimed prize",
      });
    }
  })();
};
