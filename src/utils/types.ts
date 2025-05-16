// Structure for the budget table
export interface Budget {
  month: string;
  year: number;
  type: string;
  label: string;
  amount: number;
  paid: boolean;
  user_id: number;
  budget_date_id: number;
  id: number;
  frequency: string;
}

// Values we get from FE when creating a budget
export interface BudgetParam {
  month: string;
  year: number;
  type: string;
  label: string;
  amount: number;
  paid: boolean;
  frequency: string;
  budget_id?: number;
}

// Values we get from FE when adding a new budget
export interface AddedBudgetItem {
  type: string;
  label: string;
  paid: boolean;
  frequency: string;
  value: number;
  budget_date_id: number;
  cadence: string;
}

// Structure for the budget_date table
export interface BudgetDate {
  month: string;
  year: number;
  user_id: number;
  id: number;
}

export interface BudgetItem {
  label: string;
  value: number;
  budget_id: number;
  budget_date_id: number;
  paid?: boolean;
  frequency?: string;
  cadence?: string;
}

// What we see back to the FE for a budget
export interface BudgetResponse {
  month: string;
  year: number;
  income: BudgetItem[];
  expense: BudgetItem[];
}

export interface User {
  id: number;
  auth_id: string;
  email: string;
  subscription_id: number;
  active: boolean;
}

export interface BudgetInsertIds {
  budget_id: number;
  budget_date_id: number;
}

export interface ConnectedAccount {
  id: number;
  main_account: number;
  allowed_account: number;
  is_connected: boolean;
}
