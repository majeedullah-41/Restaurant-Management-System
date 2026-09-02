export interface AdvanceTransaction {
  id: number;
  date: string;
  amount: number;
  deducted_amount: number;
  note: string | null;
}

export interface SalaryPayout {
  id: number;
  staff_id: number;
  staff_name: string;
  amount: number;
  bonus: number;
  deduction: number;
  advance_deduction: number;
  payout_type: string;
  note: string | null;
  date: string;
  status?: string;
  payroll_id?: string | null;
  paid_at?: string | null;
  advance_balance?: number;
  transactions?: AdvanceTransaction[];
}

export interface PayrollRecordRow {
  id: number;
  staff_id: number;
  name: string;
  category_name: string | null;
  base_salary: number;
  days_present: number;
  advance_balance: number;
  bonus: number;
  deduction: number;
  advance_deduction: number;
  gross_pay: number;
  net_pay: number;
  status: string;
  payroll_id: string | null;
  paid_at: string | null;
}

export interface PayrollPeriodSummary {
  total_staff: number;
  total_gross: number;
  advance_outstanding: number;
  total_paid: number;
  total_remaining: number;
  paid_count: number;
  pending_count: number;
}

export interface PayrollPeriod {
  start_date: string;
  end_date: string;
  summary: PayrollPeriodSummary;
  rows: PayrollRecordRow[];
}

export interface PayrollHistoryPeriod {
  start_date: string;
  end_date: string;
  paid_at: string | null;
  total_count: number;
  paid_count: number;
  total_net: number;
  rows: PayrollRecordRow[];
}

export interface AdvanceHistoryRow {
  id: number;
  staff_id: number;
  staff_name: string;
  amount: number;
  date: string;
  note: string | null;
  deducted_amount: number;
  outstanding: number;
  is_deducted: boolean;
}
