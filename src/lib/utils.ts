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
