import { Request, Response } from "express";
import { instance } from "../utils/postgres";

export const startReferralPlan = (req: Request, res: Response) => {
  (async () => {
    const client = instance();
    const { plan } = req.body;
    const auth_id = req.auth?.payload.sub;
    const currentDate = new Date(Date.now()).toISOString();
    const update =
      "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3, subscribed_at = $4 WHERE auth_id = $5";
    const values = [plan, false, currentDate, currentDate, auth_id];

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
  })();
};
