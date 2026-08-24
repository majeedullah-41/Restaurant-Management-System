# Thermal Migration Baseline (Phase 1 Freeze)

Recorded before any thermal-renderer refactor, per
`docs/RMS_THERMAL_PRINTING_MASTER_SPEC.md` Phase 1. Nothing below may change
silently while the migration is in progress.

## Print settings schema (`print_settings`, single row id=1)

Active columns:

| Column | Type | Meaning |
|---|---|---|
| receipt_printer / kot_printer / delivery_receipt_printer | TEXT NULL | destination name, or `""`→NULL meaning OS default; special values `"dialog"`, `"browser"`, any PDF printer name |
| receipt_copies / kot_copies / delivery_receipt_copies | INT | 1–99, validated in `update_print_settings` |
| receipt_layout / kot_layout / delivery_receipt_layout | TEXT | JSON blob, sanitized to object or `{}` |

Legacy columns kept but unused: `delivery_printer`, `delivery_copies`,
`delivery_layout`.

## Layout JSON fields (frontend source of truth)

Base (`BaseLayoutConfig`): `widthMm` (58–112 UI-clamped), `fontScale`
(50–200), `showLogo`, `showDate`, `showTime`, `showTable`, `showCashier`,
`footerMessage`, `showEndMarker`.
Receipt/DR extras: `headerText`, `showOrderNo`, `showOrderType`, `showTax`,
`showDiscount`, `showCashReceived`, `showChange`, `itemNameWidthPct`
(**not used by the text builders** — recorded as-is), plus DR-only
`showCustomerDetails`, `showDeliveryAddress`. KOT extra: `showOrderTaker`.

## IPC commands (current)

| Command | File | Notes |
|---|---|---|
| `get_print_settings` | print.rs | public |
| `update_print_settings` | print.rs | ADMIN_COMMANDS |
| `list_printers` | print.rs | 10 s cache |
| `get_default_printer` | print.rs | Win32_Printer Default |
| `save_print_html` | db.rs | **dead** (no frontend caller) — removal pending Phase 10 |
| `open_ticket_html` | db.rs | browser destination |
| `print_receipt_text` | db.rs → print::print_text | raw winspool / PDF-printer detour |
| `print_designed_ticket` | print.rs | HTML → headless-Edge PDF → shell printto ×copies |
| `print_html_to_pdf` | db.rs | reports + ticket PDF destination |
| `print_file_to_printer` | print.rs | shell printto |

## Callers (all go through `printTicketDocument()`)

- POS.tsx checkout: receipt; dine-in/table orders additionally KOT +
  `mark_kot_printed(orderId)`
- Orders.tsx: reprint closed order receipt
- DeliveryManagement.tsx: delivery receipt (fetches `get_order_history`)
- PrintSettingsSection.tsx: sample Test buttons (receipt/KOT/DR)

## Fallback chain (current)

Physical printer → `print_designed_ticket` (HTML→PDF→printto);
on error → `print_receipt_text` (raw text). Browser/dialog/PDF destinations
never fall back. Fallback is single-shot, non-recursive today.

## Raw text builders (parity contract for the thermal renderer)

Location `src/lib/printing.ts`. Key facts the Rust renderer must reproduce:

- Effective columns: `widthForPaper(mm)` = clamp(round((mm−58)×10/22+32),20,48);
  `charsForLine(mm,scale)` = clamp(round(wfp×100/clamp(scale,40,200)),20,48).
- Money: `formatCurrency` → `-Rs.` / `Rs.` + `1,234.56` (en-US grouping,
  always 2 decimals, negative sign on the symbol, half-up rounding).
- Date/time: single `data.date` string split on the first space.
- Receipt/DR item row geometry: prefix 3 (`N. `), qty right@3, two spaces,
  total right@11, name takes the rest (min 6). KOT: qty right@4, no total.
- Known deviation fixed in the thermal renderer: the TS builders TRUNCATE
  over-long names with a trailing `~`; the spec forbids silent character
  loss, so the thermal renderer WRAPS within the name column instead.
  Continuation lines never repeat qty/total.

## Winspool raw pipeline (reused by Phase 6)

PowerShell P/Invoke OpenPrinterA → StartDocPrinterA(DATATYPE "RAW") →
WritePrinter, spawned with CREATE_NO_WINDOW, fire-and-forget (spawn, not
output) so a PDF-printer Save dialog can never block the app. Bytes are
written to `%TEMP%\rms_print_<pid>.txt` and sent verbatim (UTF-8, no ESC/POS
commands generated anywhere yet).

## Sample data preserved

`PrintSettingsSection.tsx` holds the sample datasets used by Test buttons;
golden fixtures for the thermal suite are separate fixed datasets
(`thermal::fixtures`) and do not alter them.
