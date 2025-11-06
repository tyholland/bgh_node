import { Client, QueryResult } from "pg";
import {
  AddedBudgetItem,
  Budget,
  BudgetDate,
  BudgetItem,
  ConnectedAccount,
  Referrals,
  ReferredBy,
  User,
} from "./types";
import { listOfMonths } from "./constants";
import { Response } from "express";
import fetch from "node-fetch";
import dayjs from "dayjs";

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
    ...user.rows[0],
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
        currentDate,
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
            currentDate,
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
        currentDate,
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
    currentDate,
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

export const addCategories = async (
  createdUserId: number,
  currentDate: string,
  client: Client,
) => {
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
};

export const handleReferrals = async (
  createdUserId: number,
  currentDate: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plan: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  referral_code: any,
  client: Client,
) => {
  const createdReferralCode = `SB-Partner${createdUserId}`;

  if (Number(plan) === 8) {
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
  }

  if (Number(plan) === 9) {
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
  }

  return createdReferralCode;
};

export const removeSubscriptionAfterTrial = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any,
  currentDate: string,
  auth_id: string | undefined,
  client: Client,
) => {
  const referralPlan = user.subscription_id === 10;
  const referralSubscribeYearEnd = dayjs(user.subscribed_at).add(1, "month");
  let updatedUser;

  if (referralPlan && dayjs(currentDate).isAfter(referralSubscribeYearEnd)) {
    try {
      const update =
        "UPDATE users SET subscription_id = $1, paid_sub = $2, modified_at = $3, subscribed_at = $4 WHERE auth_id = $5 RETURNING subscription_id, subscribed_at, paid_sub";
      const updateValues = [2, false, currentDate, currentDate, auth_id];

      updatedUser = await client.query<User>(update, updateValues);
    } catch (err) {
      console.error(err, "Failed to remove referral plan subscription");
    }
  }

  return updatedUser;
};

export const getMedalGameData = async (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category: any[],
  budgetInfo: QueryResult<Budget> | undefined,
  currentDate: string,
  client: Client,
) => {
  let totalPoints = 10;
  let expenses_in_category_1 = false;
  let expenses_in_category_2 = false;
  let expenses_in_category_3 = false;
  let edit_expense_in_month = false;
  let edit_income_in_month = false;
  let add_category_in_month = false;
  let shared_account = false;
  const currentYear = dayjs().year();
  let budgetDate;
  let sharedAccount;

  // Pro plan
  if (user.subscription_id === 4 || user.subscription_id === 9) {
    totalPoints += 25;

    // Shared account
    try {
      sharedAccount = await client.query(
        "SELECT * FROM connected_accounts WHERE main_account = $1 OR allowed_account = $2 AND is_connected = $3",
        [user.id, user.id, true],
      );
    } catch (err) {
      console.error(err, "Failed to get budget date");
    }

    if (sharedAccount?.rowCount && sharedAccount.rowCount > 0) {
      totalPoints += 15;
      shared_account = true;
    }
  }

  // Starter plan
  if (user.subscription_id === 3) {
    totalPoints += 20;
  }

  // Budget, Category, and Edits in a month
  if (budgetInfo?.rowCount && budgetInfo.rowCount > 0) {
    // Has budget
    totalPoints += 14;

    if (user.subscription_id === 4 || user.subscription_id === 9) {
      // Has expenses under Non-Discretionary, Savings, and/or Fun Money
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      category.forEach((result: any) => {
        if (result.label === "Non-Discretionary") {
          const hasCategory = budgetInfo.rows.some(
            (item: Budget) =>
              item.user_id === user.id &&
              item.category_id === result.id &&
              dayjs(item.modified_at).year() === currentYear,
          );

          if (hasCategory) {
            totalPoints += 4;
            expenses_in_category_1 = true;
          }
        }

        if (result.label === "Savings") {
          const hasCategory = budgetInfo.rows.some(
            (item: Budget) =>
              item.user_id === user.id &&
              item.category_id === result.id &&
              dayjs(item.modified_at).year() === currentYear,
          );

          if (hasCategory) {
            totalPoints += 4;
            expenses_in_category_2 = true;
          }
        }

        if (result.label === "Fun Money") {
          const hasCategory = budgetInfo.rows.some(
            (item: Budget) =>
              item.user_id === user.id &&
              item.category_id === result.id &&
              dayjs(item.modified_at).year() === currentYear,
          );

          if (hasCategory) {
            totalPoints += 4;
            expenses_in_category_3 = true;
          }
        }

        // Category that isn't one of the 3 default categories
        if (
          result.label !== "Fun Money" &&
          result.label !== "Savings" &&
          result.label !== "Non-Discretionary"
        ) {
          const hasCategory = budgetInfo.rows.some(
            (item: Budget) =>
              item.user_id === user.id &&
              item.category_id === result.id &&
              dayjs(item.modified_at).year() === currentYear,
          );

          if (hasCategory) {
            totalPoints += 3;
            add_category_in_month = true;
          }
        }
      });
    }

    // Get Budget Date info
    try {
      budgetDate = await client.query<BudgetDate>(
        "SELECT * FROM budget_date WHERE user_id = $1",
        [user.id],
      );
    } catch (err) {
      console.error(err, "Failed to get budget date");
    }

    budgetDate?.rows.forEach((budget: BudgetDate) => {
      const isYear = budget.year === currentYear;

      if (isYear) {
        // Has edited income for the month
        const hasEditedIncome = budgetInfo.rows.some((item: Budget) => {
          const isUser = item.user_id === user.id;
          const isBudgetDate = budget.id === item.budget_date_id;
          const isMonth =
            listOfMonths[dayjs(item.modified_at).month()] === budget.month;
          const isIncome = item.type === "income";
          const isDifferent = dayjs(item.modified_at).isAfter(
            dayjs(item.created_at),
          );

          return isUser && isBudgetDate && isMonth && isIncome && isDifferent;
        });

        if (hasEditedIncome) {
          totalPoints += 6;
          edit_income_in_month = true;
        }

        // Has edited expense for the month
        const hasEditedExpense = budgetInfo.rows.some((item: Budget) => {
          const isUser = item.user_id === user.id;
          const isBudgetDate = budget.id === item.budget_date_id;
          const isMonth =
            listOfMonths[dayjs(item.modified_at).month()] === budget.month;
          const isIncome = item.type === "expense";
          const isDifferent = dayjs(item.modified_at).isAfter(
            dayjs(item.created_at),
          );

          return isUser && isBudgetDate && isMonth && isIncome && isDifferent;
        });

        if (hasEditedExpense) {
          totalPoints += 7;
          edit_expense_in_month = true;
        }
      }
    });
  }

  let medalGame;
  let updatedMedalGame;

  try {
    // Check for medal game for the user
    medalGame = await client.query(
      "SELECT * FROM medal_game WHERE user_id = $1 and year = $2",
      [user.id, currentYear],
    );

    if (medalGame.rowCount) {
      if (!medalGame.rows[0].claimed_prize) {
        // Update the medal game
        try {
          await client.query(
            "UPDATE medal_game SET total_points = $1, modified_at = $2 WHERE user_id = $3",
            [totalPoints, currentDate, user.id],
          );
        } catch (err) {
          console.error(err, "Failed to update medal game");
        }
      }
    } else {
      // Insert the medal game
      try {
        updatedMedalGame = await client.query(
          "INSERT into medal_game(user_id, claimed_prize, year, total_points, created_at, modified_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING claimed_prize",
          [user.id, false, currentYear, totalPoints, currentDate, currentDate],
        );
      } catch (err) {
        console.error(err, "Failed to insert medal game");
      }
    }
  } catch (err) {
    console.error(err, "Failed to get specific medal game");
  }

  return {
    total_medal_points:
      medalGame?.rowCount && medalGame.rows[0].claimed_prize
        ? medalGame.rows[0].total_points
        : totalPoints,
    is_claimed: updatedMedalGame?.rowCount
      ? updatedMedalGame.rows[0].claimed_prize
      : medalGame?.rowCount
        ? medalGame.rows[0].claimed_prize
        : false,
    shared_account,
    expenses_in_category_1,
    expenses_in_category_2,
    expenses_in_category_3,
    edit_expense_in_month,
    edit_income_in_month,
    add_category_in_month,
  };
};
