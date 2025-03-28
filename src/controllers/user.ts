import { Request, Response } from "express";
import client from "../utils/postgres";
import { Budget, User } from "../utils/types";
import { ManagementClient } from "auth0";

const checkForExistingUser = async (auth_id: string | undefined) => {
  const user = await client.query<User>(
    "SELECT * FROM users WHERE auth_id = $1",
    [auth_id],
  );

  return {
    exists: user.rowCount ? user.rowCount > 0 : false,
    id: user.rows.length > 0 ? user.rows[0].id : undefined,
  };
};

export const createUser = (req: Request, res: Response) => {
  (async () => {
    const { email } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const insert =
      "INSERT into users(auth_id, email, active, modified_at) VALUES ($1, $2, $3, $4)";
    const values = [auth_id, email, true, currentDate];
    let user;

    try {
      user = await checkForExistingUser(auth_id);

      if (user.exists) {
        const budgetInfo = await client.query<Budget>(
          "SELECT * FROM budget WHERE user_id = $1",
          [user.id],
        );

        return res.status(206).json({
          action: "User already exists",
          hasBudget: budgetInfo.rowCount ? budgetInfo.rowCount > 0 : false,
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
