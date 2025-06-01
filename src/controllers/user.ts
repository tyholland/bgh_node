import { Request, Response } from "express";
import client from "../utils/postgres";
import { Budget, User } from "../utils/types";
import { ManagementClient } from "auth0";
import {
  checkConnectAccountExists,
  checkForExistingUser,
  getUserByEmail,
  getUserId,
} from "../utils/functions";
import { QueryResult } from "pg";

export const createUser = (req: Request, res: Response) => {
  (async () => {
    const { email } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const insert =
      "INSERT into users(auth_id, email, active, modified_at, subscription_id) VALUES ($1, $2, $3, $4, $5)";
    const values = [auth_id, email, true, currentDate, 2];
    let user;
    let connectedAccount;

    try {
      user = await checkForExistingUser(auth_id, client);
      let budgetInfo: QueryResult<Budget> | undefined = undefined;

      if (user.exists) {
        try {
          connectedAccount = await checkConnectAccountExists(user.id, client);
          budgetInfo = await client.query<Budget>(
            "SELECT * FROM budget WHERE user_id = $1",
            [user.id],
          );
        } catch (err) {
          console.error(err, "Failed to get Connected Account info");

          try {
            budgetInfo = await client.query<Budget>(
              "SELECT * FROM budget WHERE user_id = $1",
              [user.id],
            );
          } catch (err) {
            console.error(err, "Failed to get Account budget info");
          }
        }

        return res.status(206).json({
          action: "User already exists",
          hasBudget: budgetInfo?.rowCount ? budgetInfo.rowCount > 0 : false,
          subscription_id: user.subscription_id,
          connected_message: connectedAccount?.exists,
          connected_id: connectedAccount?.id,
          primary_request: connectedAccount?.main_account,
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id and check for budget data",
      });
    }

    try {
      await client.query<User>(insert, values);

      return res.status(200).json({
        success: true,
        hasBudget: false,
        subscription_id: 2,
        connected_message: false,
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
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const update =
      "UPDATE users SET active = $1, modified_at = $2 WHERE auth_id = $3";
    const values = [false, currentDate, auth_id];

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
        action: "Delete user",
      });
    }
  })();
};

export const shareAccount = (req: Request, res: Response) => {
  (async () => {
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
