import { Request, Response } from "express";
import { instance } from "../utils/postgres";
import { Budget, Referrals, ReferredBy, User } from "../utils/types";
import { ManagementClient } from "auth0";
import {
  cancelPaypalSubscription,
  checkConnectAccountExists,
  checkForExistingUser,
  getUserByEmail,
  getUserId,
} from "../utils/functions";
import { QueryResult } from "pg";
import dayjs from "dayjs";

export const createUser = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { email, referral_code, plan } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const insert =
      "INSERT into users(auth_id, email, active, modified_at, subscription_id, subscribed_at, currency) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id";
    const values = [
      auth_id,
      email,
      true,
      currentDate,
      Number(plan) || 2,
      currentDate,
      "USD",
    ];
    let user;
    let connectedAccount;
    let category;
    let referralCount;

    try {
      user = await checkForExistingUser(auth_id, client);
      let budgetInfo: QueryResult<Budget> | undefined = undefined;

      if (user.exists) {
        const userReferralCode = `SB-${user.id}`;

        try {
          connectedAccount = await checkConnectAccountExists(user.id, client);
          budgetInfo = await client.query<Budget>(
            "SELECT * FROM budget WHERE user_id = $1",
            [connectedAccount?.user_id],
          );
          category = await client.query(
            "SELECT * FROM category WHERE user_id = $1",
            [connectedAccount?.user_id],
          );
        } catch (err) {
          console.error(err, "Failed to get Connected Account info");

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
        }

        // Check count of referrals
        try {
          referralCount = await client.query<Budget>(
            "SELECT * FROM referred_by WHERE referred_by = $1",
            [userReferralCode],
          );
        } catch (err) {
          console.error(err, "Failed to get Referral count");
        }

        // Remove referral subscription after 1 year from subscribed_at date
        const referralPlan =
          user.subscription_id === 6 || user.subscription_id === 7;
        const referralSubscribeYearEnd = dayjs(user.subscribed_at).add(
          1,
          "year",
        );
        let updatedUser;

        if (
          referralPlan &&
          dayjs(currentDate).isAfter(referralSubscribeYearEnd)
        ) {
          try {
            await cancelPaypalSubscription(res, user.paypal_sub_id as string);
          } catch (err) {
            return res.status(500).json({
              err,
              action:
                "createUser - Failed to cancel paypal subscription function",
            });
          }

          try {
            const update =
              "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3, subscribed_at = $4 WHERE auth_id = $5 RETURNING subscription_id, subscribed_at, paid_sub";
            const updateValues = [2, false, currentDate, currentDate, auth_id];

            updatedUser = await client.query<User>(update, updateValues);
          } catch (err) {
            console.error(err, "Failed to remove referral plan subscription");
          }
        }

        return res.status(206).json({
          action: "User already exists",
          hasBudget: budgetInfo?.rowCount ? budgetInfo.rowCount > 0 : false,
          subscription_id: updatedUser?.rowCount
            ? updatedUser.rows[0].subscription_id
            : user.subscription_id,
          connected_message: connectedAccount?.exists || false,
          connected_id: connectedAccount?.id,
          primary_request: connectedAccount?.main_account,
          shared_account_email: connectedAccount?.second_account,
          is_connected: connectedAccount?.is_connected || false,
          categories: category?.rowCount ? category?.rows : [],
          paid_sub: updatedUser?.rowCount
            ? updatedUser.rows[0].paid_sub
            : user.paid_sub,
          subscribed_at: updatedUser?.rowCount
            ? updatedUser.rows[0].subscribed_at
            : user.subscribed_at,
          paypal_sub_id: user.paypal_sub_id,
          referral_code: userReferralCode,
          referral_count: referralCount?.rowCount ? referralCount.rowCount : 0,
          currency: updatedUser?.rowCount
            ? updatedUser.rows[0].currency
            : user.currency,
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id and check for budget data",
      });
    }

    try {
      const createdUser = await client.query<User>(insert, values);
      const createdUserId = createdUser.rows[0].id;
      const createdReferralCode = `SB-${createdUserId}`;

      // Add user to referrals Table
      try {
        const referralInsert =
          "INSERT into referrals(user_id, referral_code, referral_count, created_at) VALUES ($1, $2, $3, $4)";
        const referralValues = [
          createdUserId,
          createdReferralCode,
          0,
          currentDate,
        ];

        await client.query<Referrals>(referralInsert, referralValues);
      } catch (err) {
        console.error(err, "Failed to add user to Referrals");
      }

      // Add who referred user to referred_by Table
      if (referral_code) {
        try {
          const referredByInsert =
            "INSERT into referred_by(user_id, referred_by, created_at) VALUES ($1, $2, $3)";
          const referredByValues = [createdUserId, referral_code, currentDate];

          await client.query<ReferredBy>(referredByInsert, referredByValues);
        } catch (err) {
          console.error(err, "Failed to add record for referred_by");
        }
      }

      // Add default categories
      const categories = ["Non-Discretionary", "Savings", "Fun Money"];

      for (let i = 0; i <= categories.length - 1; i++) {
        try {
          const insert =
            "INSERT into category(user_id, label, modified_at) VALUES ($1, $2, $3)";
          const values = [createdUserId, categories[i], currentDate];

          await client.query(insert, values);
        } catch (err) {
          console.error(
            err,
            `Failed to add default categories of ${categories[i]}`,
          );
        }
      }

      return res.status(200).json({
        success: true,
        hasBudget: false,
        subscription_id: Number(plan) || 2,
        connected_message: false,
        is_connected: false,
        referral_code: createdReferralCode,
        referral_count: 0,
        currency: "USD",
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Create user",
      });
    }
  })();
};

export const deleteUser = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const update =
      "UPDATE users SET active = $1, modified_at = $2 WHERE auth_id = $3";
    const values = [false, currentDate, auth_id];

    try {
      const user = await checkForExistingUser(auth_id, client);

      if (
        user.exists &&
        (user.subscription_id === 3 || user.subscription_id === 4)
      ) {
        return res.status(500).json({
          success: false,
          action:
            "You need to cancel your subscription before deleting account",
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        success: false,
        action: "Failed to get user_id and check subscription",
      });
    }

    try {
      const management = new ManagementClient({
        clientId: `${process.env.AUTH0_CLIENT_ID}`,
        clientSecret: `${process.env.AUTH0_CLIENT_SECRET}`,
        domain: `${process.env.AUTH0_DOMAIN}`,
        audience: process.env.AUTH0_AUDIENCE,
      });

      await management.users.delete({
        id: `${auth_id}`,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        success: false,
        action: "Failed to delete auth0 user",
      });
    }

    try {
      await client.query(update, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        success: false,
        action: "Delete user",
      });
    }
  })();
};

export const shareAccount = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { email } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    let allowed_user;
    let user_id;

    try {
      user_id = await getUserId(auth_id, client);
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id",
      });
    }

    try {
      allowed_user = await getUserByEmail(email as string, client);

      if (!allowed_user.exists) {
        return res.status(500).json({
          action: "User doesn't exist",
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user info from email",
      });
    }

    const insert =
      "INSERT into connected_accounts(main_account, allowed_account, is_connected, modified_at) VALUES ($1, $2, $3, $4)";
    const values = [user_id, allowed_user.id, false, currentDate];

    try {
      await client.query(insert, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Insert values for an connected account",
      });
    }
  })();
};

export const connectedAccountDecision = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { decision, connected_id } = req.body;
    const currentDate = new Date(Date.now()).toISOString();
    const update =
      "UPDATE connected_accounts SET is_connected = $1, modified_at = $2 WHERE id = $3";
    const values = [decision, currentDate, connected_id];

    try {
      await client.query(update, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Update values for an connected account",
      });
    }
  })();
};

export const removeSharedAccount = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    let user_id;

    try {
      user_id = await getUserId(auth_id, client);
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id",
      });
    }

    const update =
      "UPDATE connected_accounts SET is_connected = $1, modified_at = $2 WHERE allowed_account = $3 OR main_account = $4";
    const values = [false, currentDate, user_id, user_id];

    try {
      await client.query(update, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Update 'is_connected' for an connected account",
      });
    }
  })();
};

export const updateUserSub = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { plan, paid, paypal_sub } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const updateFree =
      "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3 WHERE auth_id = $4";
    const valuesFree = [plan, paid, currentDate, auth_id];
    const updatePaid =
      "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3, subscribed_at = $4, paypal_sub_id = $5 WHERE auth_id = $6";
    const valuesPaid = [
      plan,
      paid,
      currentDate,
      currentDate,
      paypal_sub,
      auth_id,
    ];
    const update = paid ? updatePaid : updateFree;
    const values = paid ? valuesPaid : valuesFree;

    try {
      await client.query(update, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Update user sub",
      });
    }
  })();
};

export const cancelUserSub = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { paypal_sub } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();

    try {
      await cancelPaypalSubscription(res, paypal_sub);
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Failed to cancel paypal subscription function",
      });
    }

    const update =
      "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3, subscribed_at = $4, paypal_sub_id = $5 WHERE auth_id = $6";
    const values = [2, false, currentDate, currentDate, null, auth_id];

    try {
      await client.query(update, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Cancel user sub",
      });
    }
  })();
};

export const changeCurrency = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { currency } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const update =
      "UPDATE users SET currency = $1, modified_at = $2 WHERE auth_id = $3";
    const values = [currency, currentDate, auth_id];

    try {
      await client.query(update, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Update user currency",
      });
    }
  })();
};
