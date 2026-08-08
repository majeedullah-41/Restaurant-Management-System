import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a number as a currency string in the app's default (Rs.).
 * Handles negatives and an optional newline between the symbol and amount
 * (used by two-line summary cards).
 */
export function formatCurrency(amount: number, opts?: { newline?: boolean }): string {
  const isNegative = amount < 0;
  const formatted = Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const symbol = `${isNegative ? "-" : ""}Rs.`;
  return opts?.newline ? `${symbol}\n${formatted}` : `${symbol} ${formatted}`;
}

/**
 * Formats a date (or date-time) string using the machine locale. Returns the
 * raw value unchanged when it cannot be parsed.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleString();
}

/**
 * Returns today's date as a local (not UTC) "YYYY-MM-DD" string. Backend
 * queries use `date('now','localtime')`, so sending the UTC date can select
 * the wrong day for timezones east of UTC between 00:00–04:59 local.
 */
export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
