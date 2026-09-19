import { Request, Response } from "express";
import { instance } from "../utils/postgres";
import { User } from "../utils/types";
import { checkForExistingUser } from "../utils/functions";

export const createUser = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { email, plan } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const insert =
      "INSERT into users(auth_id, email, active, modified_at, subscription_id, subscribed_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)";
    const values = [
      auth_id,
      email,
      true,
      currentDate,
      Number(plan) || 1,
      currentDate,
      currentDate,
    ];

    try {
      const user = await checkForExistingUser(auth_id, client);

      if (user.exists) {
        return res.status(206).json({
          msg: "User Already Exists",
        });
      }
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Get user_id and check for existing user",
      });
    }

    try {
      await client.query<User>(insert, values);

      return res.status(200).json({
        success: true,
      });
    } catch (err) {
      return res.status(500).json({
        err,
        action: "Create user",
      });
    }
  })();
};

export const updateUser = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { plan, paid, paypal_sub } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const update =
      "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3, subscribed_at = $4, paypal_sub_id = $5 WHERE auth_id = $6";
    const values = [plan, paid, currentDate, currentDate, paypal_sub, auth_id];

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

// export const cancelUserSub = (req: Request, res: Response) => {
//   (async () => {
//     const client = instance();
//     const { paypal_sub } = req.body;
//     const auth_id = req.auth?.payload.sub;
//     const currentDate = new Date(Date.now()).toISOString();

//     try {
//       await cancelPaypalSubscription(res, paypal_sub);
//     } catch (err) {
//       return res.status(500).json({
//         err,
//         action: "Failed to cancel paypal subscription function",
//       });
//     }

//     const update =
//       "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3, subscribed_at = $4, paypal_sub_id = $5 WHERE auth_id = $6";
//     const values = [2, false, currentDate, currentDate, null, auth_id];

//     try {
//       await client.query(update, values);

//       return res.status(200).json({
//         success: true,
//       });
//     } catch (err) {
//       return res.status(500).json({
//         err,
//         action: "Cancel user sub",
//       });
//     }
//   })();
// };
