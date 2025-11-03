import { Request, Response } from "express";
import { instance } from "../utils/postgres";
import { Budget, User } from "../utils/types";
import { ManagementClient } from "auth0";
import {
  addCategories,
  cancelPaypalSubscription,
  checkConnectAccountExists,
  checkForExistingUser,
  getMedalGameData,
  getUserByEmail,
  getUserId,
  handleReferrals,
  removeSubscriptionAfterTrial,
} from "../utils/functions";
import { QueryResult } from "pg";

export const createUser = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { email, referral_code, plan } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const insert =
      "INSERT into users(auth_id, email, active, modified_at, subscription_id, subscribed_at, currency, paid_sub) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, subscription_id, paid_sub";
    const values = [
      auth_id,
      email,
      true,
      currentDate,
      Number(plan) || 2,
      currentDate,
      "USD",
      Number(plan) === 8,
    ];
    let user;
    let connectedAccount;
    let category;
    let allReferrals;

    try {
      user = await checkForExistingUser(auth_id, client);
      let budgetInfo: QueryResult<Budget> | undefined = undefined;

      if (user.exists) {
        let userReferralCode = null;

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

        // Collect all partner clients
        if (user.subscription_id === 8) {
          userReferralCode = `SB-Partner${user.id}`;

          try {
            allReferrals = await client.query<Budget>(
              "SELECT rb.first_name, rb.last_name, u.id, u.email FROM referred_by rb, users u WHERE rb.referred_by = $1 AND rb.user_id = u.id",
              [userReferralCode],
            );
          } catch (err) {
            console.error(err, "Failed to get Referral count");
          }
        }

        // Remove trial subscription after 1 month from subscribed_at date
        const updatedUser = await removeSubscriptionAfterTrial(
          user,
          currentDate,
          auth_id,
          client,
        );

        // Get medal game reults
        const medal_game = await getMedalGameData(
          user,
          category?.rowCount ? category?.rows : [],
          budgetInfo,
          currentDate,
          client,
        );

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
          all_referrals: allReferrals?.rowCount ? allReferrals.rows : [],
          currency: updatedUser?.rowCount
            ? updatedUser.rows[0].currency
            : user.currency,
          medal_game,
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

      // Handle partner referrals and client accepted referrals
      // Return referral code
      const createdReferralCode = await handleReferrals(
        createdUserId,
        currentDate,
        plan,
        referral_code,
        client,
      );

      // Add default categories
      await addCategories(createdUserId, currentDate, client);

      return res.status(200).json({
        success: true,
        hasBudget: false,
        subscription_id: createdUser.rows[0].subscription_id,
        connected_message: false,
        is_connected: false,
        referral_code: createdReferralCode,
        all_referrals: [],
        currency: "USD",
        paid_sub: createdUser.rows[0].paid_sub,
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
