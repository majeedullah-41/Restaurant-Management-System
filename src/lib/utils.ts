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
 * Parses a date string with the device clock in mind.
 *
 * A bare "YYYY-MM-DD" parses as UTC midnight per the JS spec, which shifts it
 * a day when read through local accessors (or adds a phantom "05:00" time in
 * UTC+5). Such strings are parsed as *local midday* instead; real timestamps
 * parse normally.
 */
export function parseDeviceDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
}

/**
 * Formats a date (or date-time) string using the machine locale. Returns the
 * raw value unchanged when it cannot be parsed.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parseDeviceDate(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  // Date-only values carry no time component — don't invent one.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
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
