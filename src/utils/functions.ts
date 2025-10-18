import { Client, QueryResult } from "pg";
import { AddedBudgetItem, BudgetItem, ConnectedAccount, User } from "./types";
import { listOfMonths } from "./constants";
import { Response } from "express";
import fetch from "node-fetch";

export const sortBudget = (a: BudgetItem, b: BudgetItem) => {
  return a.label.toLowerCase() > b.label.toLowerCase()
    ? 1
    : a.label.toLowerCase() < b.label.toLowerCase()
      ? -1
      : 0;
};

export const getConnectAccountUser = async (
  user_id: number,
  client: Client,
) => {
  const connected_user = await client.query<ConnectedAccount>(
    "SELECT * FROM connected_accounts WHERE allowed_account = $1 AND is_connected = $2",
    [user_id, true],
  );

  return {
    exists: connected_user.rowCount ? connected_user.rowCount > 0 : false,
    id:
      connected_user.rows.length > 0
        ? connected_user.rows[0].main_account
        : undefined,
  };
};

export const checkConnectAccountExists = async (
  user_id: number | undefined,
  client: Client,
) => {
  let user: QueryResult<User> | undefined = undefined;
  let second_user: QueryResult<User> | undefined = undefined;
  let active_connected_user: QueryResult<ConnectedAccount> | undefined =
    undefined;

  const non_active_connected_user = await client.query<ConnectedAccount>(
    "SELECT * FROM connected_accounts WHERE allowed_account = $1 AND is_connected = $2",
    [user_id, false],
  );

  if (non_active_connected_user.rowCount) {
    user = await client.query<User>("SELECT * FROM users WHERE id = $1", [
      non_active_connected_user.rows[0].main_account,
    ]);
  }

  if (!non_active_connected_user.rowCount) {
    active_connected_user = await client.query<ConnectedAccount>(
      "SELECT * FROM connected_accounts WHERE allowed_account = $1 OR main_account = $2 AND is_connected = $3",
      [user_id, user_id, true],
    );

    if (!active_connected_user.rowCount) {
      throw new Error("No active connected accounts");
    }

    user = await client.query<User>("SELECT * FROM users WHERE id = $1", [
      active_connected_user.rows[0].main_account,
    ]);

    second_user = await client.query<User>(
      "SELECT * FROM users WHERE id = $1",
      [active_connected_user.rows[0].allowed_account],
    );
  }

  return {
    exists: non_active_connected_user.rowCount
      ? non_active_connected_user.rowCount > 0
      : false,
    id:
      non_active_connected_user.rows.length > 0
        ? non_active_connected_user.rows[0].id
        : undefined,
    main_account: user?.rowCount ? user.rows[0].email : undefined,
    second_account: second_user?.rowCount
      ? second_user.rows[0].email
      : undefined,
    user_id: user?.rowCount ? user.rows[0].id : undefined,
    is_connected: active_connected_user?.rowCount
      ? active_connected_user.rowCount > 0
      : false,
  };
};

export const getUserId = async (
  auth_id: string | undefined,
  client: Client,
) => {
  const user = await client.query<User>(
    "SELECT * FROM users WHERE auth_id = $1 AND active = $2",
    [auth_id, true],
  );

  const connected_user = await getConnectAccountUser(user.rows[0].id, client);

  return connected_user.exists
    ? connected_user.id
    : user.rows.length > 0
      ? user.rows[0].id
      : undefined;
};

export const checkForExistingUser = async (
  auth_id: string | undefined,
  client: Client,
) => {
  const user = await client.query<User>(
    "SELECT * FROM users WHERE auth_id = $1",
    [auth_id],
  );

  return {
    exists: user.rowCount ? user.rowCount > 0 : false,
    id: user.rows.length > 0 ? user.rows[0].id : undefined,
    subscription_id:
      user.rows.length > 0 ? user.rows[0].subscription_id : undefined,
    paid_sub: user.rows.length > 0 ? user.rows[0].paid_sub : undefined,
    subscribed_at:
      user.rows.length > 0 ? user.rows[0].subscribed_at : undefined,
    paypal_sub_id:
      user.rows.length > 0 ? user.rows[0].paypal_sub_id : undefined,
    currency: user.rows.length > 0 ? user.rows[0].currency : undefined,
  };
};

export const updateBasedOnCadence = async (
  client: Client,
  responseBody: BudgetItem,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  budgetData: QueryResult<any>,
  queryString: string,
) => {
  const {
    label,
    value,
    paid,
    budget_id,
    budget_date_id,
    frequency,
    cadence,
    category_id,
  } = responseBody;
  const currentDate = new Date(Date.now()).toISOString();

  if (cadence === "Future Months") {
    let startingMonth: number;

    try {
      const selectedMonth = await client.query(
        "SELECT month FROM budget_date WHERE id = $1",
        [budget_date_id],
      );
      startingMonth = listOfMonths.indexOf(selectedMonth.rows[0].month);
    } catch (err) {
      console.error(err);
      startingMonth = 0;
    }

    const loopLength = 11 - startingMonth + budget_date_id;

    for (let i = budget_date_id; i <= loopLength; i++) {
      const values = [
        label,
        value,
        paid,
        currentDate,
        frequency,
        category_id || null,
        budgetData.rows[i]?.id,
      ];

      await client.query(queryString, values);
    }
  }

  if (cadence === "All Months") {
    if (frequency === "Quarterly") {
      for (let i = 0; i <= 11; i++) {
        const values = [
          label,
          value,
          paid,
          currentDate,
          frequency,
          category_id || null,
          budgetData.rows[i]?.id,
        ];

        if (i === 2 || i === 5 || i === 8 || i === 11) {
          await client.query(queryString, values);
        }
      }
    }

    for (let i = 0; i <= 11; i++) {
      const values = [
        label,
        value,
        paid,
        currentDate,
        frequency,
        category_id || null,
        budgetData.rows[i]?.id,
      ];

      await client.query(queryString, values);
    }
  }

  const values = [
    label,
    value,
    paid,
    currentDate,
    frequency,
    category_id || null,
    budget_id,
  ];

  await client.query(queryString, values);
};

export const insertBasedOnCadence = async (
  client: Client,
  responseBody: AddedBudgetItem,
  queryString: string,
  user_id: number,
) => {
  const {
    type,
    label,
    value,
    paid,
    budget_date_id,
    frequency,
    cadence,
    category_id,
  } = responseBody;
  const currentDate = new Date(Date.now()).toISOString();

  if (cadence === "Future Months") {
    let startingMonth: number;
    const budgetArray: number[] = [];

    try {
      const selectedMonth = await client.query(
        "SELECT month FROM budget_date WHERE id = $1",
        [budget_date_id],
      );
      startingMonth = listOfMonths.indexOf(selectedMonth.rows[0].month);
    } catch (err) {
      console.error(err);
      startingMonth = 0;
    }

    const loopLength = 11 - startingMonth + budget_date_id;

    for (let i = budget_date_id; i <= loopLength; i++) {
      const values = [
        type,
        label,
        value,
        paid,
        user_id,
        budget_date_id === 0 ? i + 1 : i,
        currentDate,
        frequency,
        category_id || null,
      ];
      const budgetId = await client.query(queryString, values);
      budgetArray.push(budgetId.rows[0]?.id);
    }

    return budgetArray;
  }

  if (cadence === "All Months") {
    const budgetArray: number[] = [];

    if (frequency === "Quarterly") {
      for (let i = 0; i <= 11; i++) {
        if (i === 2 || i === 5 || i === 8 || i === 11) {
          const values = [
            type,
            label,
            value,
            paid,
            user_id,
            i + 1,
            currentDate,
            frequency,
            category_id || null,
          ];
          const budgetId = await client.query(queryString, values);
          budgetArray.push(budgetId.rows[0]?.id);
        }
      }

      return budgetArray;
    }

    for (let i = 0; i <= 11; i++) {
      const values = [
        type,
        label,
        value,
        paid,
        user_id,
        i + 1,
        currentDate,
        frequency,
        category_id || null,
      ];
      const budgetId = await client.query(queryString, values);
      budgetArray.push(budgetId.rows[0]?.id);
    }

    return budgetArray;
  }

  const values = [
    type,
    label,
    value,
    paid,
    user_id,
    budget_date_id,
    currentDate,
    frequency,
    category_id || null,
  ];
  const budgetId = await client.query(queryString, values);
  return budgetId.rows[0]?.id;
};

export const getUserByEmail = async (email: string, client: Client) => {
  const user = await client.query<User>(
    "SELECT * FROM users WHERE email = $1 and active = $2",
    [email, true],
  );

  return {
    exists: user.rowCount ? user.rowCount > 0 : false,
    id: user.rows.length > 0 ? user.rows[0].id : undefined,
  };
};

export const cancelPaypalSubscription = async (
  res: Response,
  paypal_sub: string,
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tokenData: any;

  // Get paypal access token
  try {
    const response = await fetch(`${process.env.PAYPAL_URL}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(
            process.env.PAYPAL_CLIENT_ID +
              ":" +
              process.env.PAYPAL_CLIENT_SECRET,
          ).toString("base64"),
      },
      body: "grant_type=client_credentials",
    });

    tokenData = await response.json();
  } catch (err) {
    return res.status(500).json({
      err,
      action: "Failed to get paypal access token",
    });
  }

  // Cancel paypal subscription
  try {
    await fetch(
      `${process.env.PAYPAL_URL}/v1/billing/subscriptions/${paypal_sub}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData?.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ reason: "Not satisfied with the service" }),
      },
    );
  } catch (err) {
    return res.status(500).json({
      err,
      action: "Failed to cancel paypal sub",
    });
  }
};
