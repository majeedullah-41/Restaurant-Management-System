# PROJECT_CONTEXT.md — Restaurant Management System (RMS)

> **Purpose.** This file is the single source of truth for onboarding an AI coding agent (or a human developer) to this repository. It is a **factual map** of what the project is, how it is built, and how it works — produced by direct inspection of the codebase, not by assumption.
>
> **Truthfulness rules used in this document**
> - Every fact is labeled **[Confirmed]** (read directly from source), **[Inferred]** (strongly implied by the code, but not stated verbatim), or **[Unknown]**.
> - Where nothing could be established, the section reads: *"Not currently documented or could not be confirmed from the codebase."*
> - All file paths mentioned in this document were verified to exist at the time of writing (2026-09-18, working tree `D:\projects\RMS`, git branch `main`).
> - **Secrets policy:** real credentials, license secrets, signing keys, and the license owner password are intentionally **not** reproduced here. They are referenced by name/role and described in terms of where they live.
>
> **How to update.** Whenever a significant feature, command, table, or convention changes, update the relevant section rather than appending a new one.

---

## 1. Project Overview

**[Confirmed]** The repository at `D:\projects\RMS` is the **Restaurant Management System (RMS)** — a desktop point-of-sale (POS) and restaurant management application for Windows.

- Source control: git, branch `main`, remote `https://github.com/majeedullah-41/Restaurant-Management-System.git`.
- App/product name (**Confirmed** from `src-tauri/tauri.conf.json`): `Restaurant Management System`.
- Package name `rms`, version `1.0.0` (**Confirmed** from `package.json`, `src-tauri/Cargo.toml`, `tauri.conf.json`).
- Publisher / vendor (**Confirmed** from `installer.iss`): `EagleNest Creations`. The brand also appears on printed tickets as the footer attribution `Eaglenest Creations (0346-4451505)` (**Confirmed** in `src/components/ReceiptTemplate.tsx`, `PayrollSlipTemplate.tsx`, Rust thermal footer).
- Target market is a small/independent restaurant, Pakistani context implied: currency is `Rs.` (**Confirmed** `src/lib/utils.ts:formatCurrency`, Rust `thermal/layout.rs:money`), sample address "Main Road, Swat", phone `03xx` (**Confirmed** in golden samples / `src/lib/thermalSamples.ts`).
- Platform: **Windows only in practice.** The frontend host (`Tauri`), the print spooler code (Win32 `winspool` P/Invoke), the HWID query (PowerShell/WMI/`reg`/`getmac`), and the installer (Inno Setup) are Windows-specific. Development machine is `win32` (**Confirmed**).
- The app ships with a **license/activation gate**: without a valid machine-bound license the app renders only the `LicenseScreen` (**Confirmed** `src/App.tsx`).

## 2. Purpose & Business Domain

**[Confirmed]** RMS covers the full day-to-day operation of a restaurant, all offline/local:

| Domain | What the app does |
|---|---|
| POS / Billing | Dine-in, takeaway (walk-in), and delivery orders; cart, discount, tax, service charge, cash received / change; checkout; receipt printing (**Confirmed** `src/pages/POS.tsx`, `db.rs checkout_order`) |
| Kitchen (KOT) | Kitchen order ticket per order with incremental "printed quantity" tracking (**Confirmed** `order_items.kot_printed_qty`, `mark_kot_printed`) |
| Menu | Categories + menu items, prices, images, active/inactive toggle (**Confirmed** `src/pages/MenuManagement.tsx`, `categories`/`menu_items` tables) |
| Tables | Table categories (sections/floors) + table status management, bulk add, walk-in (**Confirmed** `src/pages/TableManagement.tsx`, `table_categories`/`table_status`) |
| Staff & Attendance | Staff + staff categories, clock in/out attendance, shifts with opening/closing cash (**Confirmed** `src/pages/StaffManagement.tsx`, `CashierDashboard.tsx`, `staff_attendance`, `shifts`) |
| Payroll | Period-based payroll, attendance-based pay, bonuses/deductions, advance-salary deduction, payouts, history, reopen/void (**Confirmed** `src/pages/payroll/*`, `payroll_records`, `salary_payouts`) |
| Advances | Advance salary with per-transaction deduction tracking (**Confirmed** `advance_salaries`, `get_advance_history`) |
| Expenses | Categorized expense logging; payroll payouts auto-create linked expense rows (**Confirmed** `expenses`, `process_payroll_batch`) |
| Inventory | Items, units, purchases (stock+), usage (stock−), low-stock alerts, transactions (**Confirmed** `src/pages/Inventory.tsx`, `inventory_items`/`inventory_transactions`) |
| Customers & Delivery | Customer registry (unique phone), delivery orders, driver assignment, status transitions (**Confirmed** `src/pages/DeliveryManagement.tsx`, `customers`, `orders.delivery_*`) |
| Reporting | Admin dashboard KPIs, detailed/analytic reports, expense/inventory/payroll report templates, PDF & text export (**Confirmed** `src/pages/Reports.tsx`, `Dashboard.tsx`, template components) |
| Settings | General, order requirements, printing, delivery, backup, data migration, license tabs (**Confirmed** `src/pages/Settings.tsx`) |
| Printing | Designed-HTML receipts (browser/dialog/PDF), deterministic ESC/POS thermal receipts, plain-text fallback (**Confirmed** `src/lib/printing.ts`, `src-tauri/src/print.rs`, `src-tauri/src/thermal/`) |

## 3. Technology Stack

**[Confirmed]** — from `package.json`, `Cargo.toml`, `tauri.conf.json`, `vite.config.ts`, `components.json`:

| Layer | Technology / Version |
|---|---|
| Desktop shell | Tauri v2 (`@tauri-apps/cli ^2`, `tauri = "2"`), WebView2 |
| Frontend language | TypeScript (strict) + React `19.1.0` + ReactDOM |
| Build tool | Vite (`@vitejs/plugin-react`, `@tailwindcss/vite`), dev server port `1420` (strict) |
| Styling | Tailwind CSS `4.3.2` (`@tailwindcss/postcss`, `@tailwindcss/vite`), `twin.min` of `tw-animate-css`, `tailwind-merge`, `clsx`, `class-variance-authority`, shadcn-style (`components.json` base-nova) |
| UI primitives | `@base-ui/react ^1.6.0` (button/input/toggle building blocks in `src/components/ui/`) |
| Icons | `lucide-react ^1.23.0` |
| Charts | `recharts ^3.9.2` (admin Dashboard, Reports) |
| Routing | `react-router-dom ^7.18.1` (BrowserRouter) |
| Fonts | `@fontsource-variable/geist`, `@fontsource-variable/hanken-grotesk` |
| Backend | Rust (edition 2021), crate `rms` / lib `rms_lib`, `crate-type = ["staticlib","cdylib","rlib"]` |
| DB | SQLite via `rusqlite 0.31.0` (feature `bundled`), WAL mode |
| Crypto (Rust) | `rsa 0.9`, `sha2 0.10`, `hmac 0.12`, `base64 0.22`, `bcrypt 0.15`, `rand 0.8`, `chrono 0.4` |
| System (Rust) | `sysinfo 0.33`, `opener 0.8.5` |
| Tauri plugins | `tauri-plugin-single-instance`, `tauri-plugin-opener`, `tauri-plugin-dialog`, and (debug builds only) `tauri-plugin-wdio`, `tauri-plugin-wdio-webdriver` |
| Printing helpers | `react-to-print ^3.3.0`; headless Microsoft Edge used for HTML→PDF |
| E2E test stack | WebdriverIO `^9.30` (`@wdio/cli`, `local-runner`, `mocha-framework`, `spec-reporter`, `@wdio/tauri-plugin`, `@wdio/tauri-service ^1.3`) driving a real `rms.exe` debug build |
| Packaging | Tauri bundle (`targets: "all"`) **and** a separate Inno Setup script (`installer.iss`) |

**Dev-time note:** the frontend dev build injects `@wdio/tauri-plugin` (`src/main.tsx` imports `"@wdio/tauri-plugin"`), and the backend registers the WDIO plugins **only under `#[cfg(debug_assertions)]`** (**Confirmed** `src-tauri/src/lib.rs`). Production builds do not carry the WDIO harness.

## 4. Repository Layout (Top Level)

**[Confirmed]** — verified by directory listing on 2026-09-18:

```
D:\projects\RMS
├── src/                  React frontend (main.tsx, App.tsx, App.css, ErrorBoundary.tsx)
│   ├── components/       UI + feature components (incl. components/ui/, 8 report templates)
│   ├── lib/              invoke wrapper, auth context, session, toasts, printing, pdfExport, utils
│   └── pages/            21 page components (18 in pages/ + 3 in pages/payroll/; payroll/types.ts is a types module, not a page)
├── src-tauri/            Rust backend (src/{main,lib,auth,db,license,print,devtools,proc_util,test_print}.rs, src/thermal/)
│   ├── tests/            19 Rust integration test files (+ tests/golden/ thermal snapshots)
│   ├── capabilities/     capabilities/default.json
│   ├── icons/            app icons
│   ├── backups/          (runtime backend-test artifacts; git-ignored DBs also live here)
│   ├── Cargo.toml, tauri.conf.json, build.rs
│   └── target/           cargo build output (present, not committed)
├── test/e2e/             WebdriverIO specs (setup.cjs, diag, loginFlow, menuManagement, staffPayroll, settings, printSettings, orderFlow)
├── scripts/              watchdog.cjs, keygen.cjs, refactor_unwrap.py, refactor_db.py, .keys/ (git-ignored RSA pair)
├── docs/                 7 project/architecture docs (01_ARCHITECTURE … 05_VIRTUAL_PRINTER_TESTING, master spec, baseline)
├── public/               static assets served by Vite
├── dist/                 Vite build output
├── installer_output/     Inno Setup output folder
├── backups/, reports/, logs/…  runtime output folders
├── *.db / *.db-shm/-wal   Local DBs present in the working tree (rms.db, local.db, test.db and several src-tauri/backend_*_test.db) — these are runtime/dev artifacts, **not** part of the app code
├── package.json, package-lock.json
├── index.html            <html class="dark">, #root, /src/main.tsx
├── vite.config.ts, tsconfig.json, tsconfig.node.json, components.json
├── wdio.conf.cjs, test-wdio.cjs, msedgedriver.exe
├── README.md             default Tauri/React template text (largely unmaintained)
├── implementation_plan.md  production-readiness plan (written when the repo lived at d:/RMS — stale paths/version inside)
├── installer.iss         Inno Setup installer definition
├── app-icon.png, logo.png
└── PROJECT_CONTEXT.md    this file
```

Two stray/legacy items worth knowing (**Confirmed**; see also §32): `src-tauri/src/test_print.rs` is an orphan scratch file not wired into the build, and `temp_srs.txt` / `mobile-keygen.html` at the root are scratch artifacts.

## 5. Build, Dev & Test Commands

**[Confirmed]** — from `package.json` (scripts) and `installer.iss`/`wdio.conf.cjs`:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (port 1420). Frontend only. |
| `npm run build` | `tsc && vite build` → `dist/` (no Vue; no lint step exists). |
| `npm run tauri dev` | Full Tauri dev app (runs `beforeDevCommand: npm run dev`). |
| `npm run tauri build` | Release bundle (runs `beforeBuildCommand: npm run build`). |
| `npm run thermal:test` | `cargo test thermal --manifest-path src-tauri/Cargo.toml` — Rust thermal + golden suite. |
| `npm run watchdog` | `node scripts/watchdog.cjs` (snapshot/cleanup/status — protects the live DB during e2e). |
| `npm run pretest:e2e` | watchdog `snapshot`. |
| `npm run test:e2e` | `node test/e2e/setup.cjs && npx wdio run wdio.conf.cjs` |
| `npm run posttest:e2e` | watchdog `cleanup`. |
| `cargo test` (in `src-tauri/`) | Rust integration tests (19 files, 26 `#[test]` + thermal golden). *Not runnable on this machine — see below.* |

**Machine constraint (Confirmed, environmental):** `cargo`/Rust commands are **blocked on this development machine by a Windows Application Control policy** (the toolchain `cargo.exe` under `…\Cache\rustup\toolchains\stable-x86_64-pc-windows-msvc\bin` is denied). Do **not** attempt to bypass it; Rust work is verified by source reading here. Frontend validation that works here: `npx tsc`, `npm run build`, `node --check <file>.cjs` for Node/e2e scripts. E2E runs require a built `rms.exe` (see §31).

## 6. Configuration Files

**[Confirmed]** — path, purpose, key values:

| File | Highlights |
|---|---|
| `src-tauri/tauri.conf.json` | productName "Restaurant Management System", version 1.0.0, identifier `com.rms.desktop`; main window 1280×720 (min 1024×600); `withGlobalTauri: true`; devUrl `http://localhost:1420`; frontendDist `../dist`; CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' ipc: http://ipc.localhost; …`; bundle targets `all`; icons set. |
| `vite.config.ts` | `react()` + `tailwindcss()`; alias `@ → ./src`; `chunkSizeWarningLimit: 2000`; `assetsInlineLimit: 100000` (woff2 fonts inlined so standalone tickets for headless-Edge PDF carry fonts); `server: { port: 1420, strictPort: true }`. |
| `tsconfig.json` | strict; `ES2020`; `lib [ES2020, DOM, DOM.Iterable]`; `paths @/* → ./src/*`; `noUnusedLocals/Parameters`; `noFallthroughCasesInSwitch`; `include: ["src"]`; references `tsconfig.node.json`. |
| `tsconfig.node.json` | composite; covers `vite.config.ts`. |
| `components.json` | shadcn-style config: style `base-nova`, `rsc:false`, `tsx:true`, iconLibrary `lucide`, css `src/App.css`, aliases → `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`. |
| `src-tauri/capabilities/default.json` | window `["main"]`, permissions `core:default, opener:default, dialog:default, wdio:default, wdio-webdriver:default` (the two wdio permissions are harmless in release because the plugins aren't registered). |
| `src-tauri/build.rs` | `tauri_build::build()`. |
| `installer.iss` | Inno Setup: app name "Restaurant Management System", version string `0.1.0` (stale vs 1.0.0 — flag in §32), publisher "EagleNest Creations", EXE `rms.exe`, AppId `{{8B41D8DF-7D7E-4467-93C0-29E57A2E5B5E}`, install dir `{autopf}\Restaurant Management System`, output `installer_output/RMS_Setup.exe`, icon `src-tauri/icons/icon.ico`, LZMA solid, optional desktop icon. |
| `wdio.conf.cjs` | WebdriverIO local runner, `services: ['tauri']`, exe `RMS_EXE` (default `D:\RustTarget\debug\rms.exe`), isolated e2e DB `%LOCALAPPDATA%\RMS\e2e-test\test.db`, `onPrepare` seeds from root `test.db`, watchdog guard, `afterSession` cleanup. |
| `.gitignore` | standard Tauri/Node ignores; `scripts/.keys/` (RSA keypair) is git-ignored. |

## 7. Frontend Bootstrap & Provider Tree

**[Confirmed]** — `src/main.tsx`:

```
ReactDOM.createRoot
├── <React.StrictMode>
│   └── <ErrorBoundary>            // outermost — any crash → recovery screen (src/ErrorBoundary.tsx)
│       └── <ThemeProvider defaultTheme="dark">   // localStorage "vite-ui-theme"; toggles .dark on <html>
│           └── <ToastProvider>    // custom toast system (src/lib/toast.tsx)
│               └── <AuthProvider> // (src/lib/auth.tsx) user + login/logout/refresh
│                   └── <App />      // src/App.tsx — license gate + router
```

- CSS: `src/App.css` (`@import "tailwindcss"` + custom utilities incl. `toast-progress` bar keyframes and print helper rules). `index.html` sets `<html class="dark">` — the app defaults to dark mode.
- `src/App.tsx` flow: license check on mount (`get_machine_hwid`, `check_license_status`) → spinner while checking → `LicenseScreen` if invalid → auth restore (`get_current_session`) → full router. Also runs `check_and_run_auto_backup` once for logged-in admins with a valid license, shows an amber top-right banner on backup failure, and a dismissible amber license-expiry banner when ≤7 days remain.

## 8. Routing & Navigation Map

**[Confirmed]** — from `src/App.tsx` (all wrapped by `ProtectedRoute`; `adminOnly` forces Admin role):

| Path | Component | Admin-only |
|---|---|---|
| `/` | redirect to homePath, else `Login` | — |
| `/change-password` | `ChangePassword` | no |
| `/cashier/dashboard` | `CashierDashboard` | no |
| `/admin/dashboard` | `Dashboard` | yes |
| `/admin/menu` | `MenuManagement` | yes |
| `/admin/settings` | `Settings` | yes |
| `/admin/orders` | `Orders` | yes |
| `/admin/tables` | `TableManagement` | yes |
| `/admin/pos/:tableId/:orderId?` | `POS` | yes |
| `/cashier/pos/:tableId/:orderId?` | `POS` | no |
| `/cashier/orders` | `Orders` | no |
| `/cashier/tables` | `TableManagement` | no |
| `/cashier/customers` | `Customers` | no |
| `/cashier/history` | `Orders` (history mode, path-based) | no |
| `/admin/history` | `Orders` (history mode) | yes |
| `/cashier/deliveries` | `DeliveryManagement` | no |
| `/admin/deliveries` | `DeliveryManagement` | yes |
| `/admin/staff` | `StaffManagement` | yes |
| `/admin/customers` | `Customers` | yes |
| `/admin/expenses` | `Expenses` | yes |
| `/admin/inventory` | `Inventory` | yes |
| `/admin/payroll` | redirects to `/admin/payroll/process` | yes |
| `/admin/payroll/process` | `payroll/ProcessPayroll` | yes |
| `/admin/payroll/history` | `payroll/PayrollHistory` | yes |
| `/admin/payroll/advance` | `payroll/AdvanceHistory` | yes |
| `/admin/profile` / `/cashier/profile` | `UserProfile` | yes / no |
| `/admin/reports` | `Reports` | yes |
| `/admin/thermal-simulator` | `ThermalSimulator` (dev tool, **no sidebar entry**) | yes |
| `*` | redirect to homePath or `/` | — |

`ProtectedRoute` logic (**Confirmed** `src/components/ProtectedRoute.tsx`): loading spinner → redirect `/` if no user → redirect `/change-password` if `must_change_password` → redirect `/cashier/dashboard` if `adminOnly` and non-Admin → render.

## 9. Authentication & Authorization (Backend)

**[Confirmed]** — `src-tauri/src/auth.rs` + `src-tauri/src/lib.rs`.

- **Roles:** `Admin` and `Cashier` (seeded). Any non-Admin role string renders the app in "Cashier" mode.
- **Central gate:** every IPC command passes through `authorize(command, payload)` in `lib.rs` (`wrap_handler`). Order of checks:
  1. `PUBLIC_COMMANDS` (auth.rs) pass without a token: `login`, `logout`, `get_settings`, `get_restaurant_name`, `get_security_question`, `reset_password_with_security_answer`, `activate_license`, `check_license_status`, `get_machine_hwid`, `restore_license_from_backup`.
  2. Token extraction from payload (`sessionToken` / `session_token` keys) → else `"Not authenticated. Please log in."`.
  3. **License gate** (`LICENSE_EXEMPT` list in lib.rs): unless license valid and command is license-exempt → `"License is invalid or expired…"`.
  4. **Forced password-change gate** (`PASSWORD_CHANGE_OK` list): if user `must_change_password` and command not allowed pre-change → `"You must change your password before continuing."`.
  5. **Admin gate:** `ADMIN_COMMANDS` (auth.rs) require session role `Admin`.
- **Sessions:** in-memory only (lost on restart), random 32-byte URL-safe tokens, TTL 12 h, max 5 concurrent sessions per user (oldest evicted).
- **Brute-force throttles:** login 5 fails / 5 min (in-memory, per username); password-verify 5 / 5 min (in-memory); password-reset 5 / 15 min **persisted in the `reset_attempts` table** (survives restarts). All mutex accesses recover from poisoning.
- **Passwords:** bcrypt; security answers bcrypt; username uniqueness enforced with a case-insensitive unique index (`idx_users_username_ci`).

## 10. Session Management (Frontend)

**[Confirmed]** — `src/lib/session.ts`, `src/lib/api.ts`, `src/lib/auth.tsx`.

- `session.ts` stores the token under `localStorage["rms_session_token"]` and clears a set of legacy identity keys (`userRole`, `userName`, `username`, `displayName`, `rms_session_*`) together so no cross-user leakage.
- `api.ts` exports `invoke<T>(cmd, args)` which wraps `@tauri-apps/api/core` and **auto-injects `sessionToken`** into every payload; if the backend answers with `"Session expired…"` or `"Not authenticated…"` (and the command is not `login`), it clears local session state and dispatches a `window` `session-expired` event.
- `auth.tsx` provides `useAuth()` = `{ user, loading, login, logout, refresh }`. `refresh()` calls `get_current_session`. On `session-expired` it nullifies the user and redirects to login.

## 11. Backend IPC Command Inventory

**[Confirmed]** — `src-tauri/src/lib.rs` registers **141 commands** through `wrap_handler(tauri::generate_handler![…])`. Grouped (counts approximate, from the authoritative list):

| Group | Commands (by backend module) |
|---|---|
| Auth/accounts (`db.rs`) | `login`, `logout`, `get_current_session`, `get_users`, `get_user_role_by_username`, `update_user_profile`, `update_security_question`, `get_security_question`, `reset_password_with_security_answer`, `verify_admin_password`, `verify_operator_password` |
| Settings (`db.rs`) | `get_settings`, `update_settings` (general/order-requirements/delivery settings) |
| Menu (`db.rs`) | `get_categories`, `get_menu_items`, `add_category`, `update_category`, `delete_category`, `add_menu_item`, `update_menu_item`, `delete_menu_item`, `toggle_menu_item_status` |
| Tables (`db.rs`) | `init_tables_if_needed`, `get_table_statuses`, `add_table`, `add_tables`, `delete_table`, `get_table_categories`, `add_table_category`, `update_table_category`, `delete_table_category`, `admin_update_table_status`, `get_detailed_table_statuses` |
| Orders/POS (`db.rs`) | `get_or_create_order`, `get_active_order`, `create_walkin_order`, `get_order_by_id`, `get_order_items`, `mark_kot_printed`, `add_item_to_order`, `remove_item_from_order`, `delete_item_from_order`, `checkout_order`, `get_order_history`, `update_order_discount`, `cancel_active_order`, `reassign_order_table`, `update_order_type`, `update_order_delivery_draft`, `get_order_takers`, `update_order_taker`, `delete_order_history` |
| Staff/attendance (`db.rs`) | `get_staff`, `get_staff_dropdown`, `add_staff`, `update_staff`, `delete_staff`, `get_staff_categories`, `add_staff_category`, `delete_staff_category`, `clock_in_out`, `get_attendance` |
| Customers (`db.rs`) | `get_customers`, `add_customer`, `resolve_customer`, `delete_customer` |
| Delivery (`db.rs`) | `get_delivery_settings`, `update_delivery_settings`, `get_active_deliveries`, `update_delivery_status`, `assign_delivery_driver`, `place_delivery_order` |
| Expenses (`db.rs`) | `get_expenses`, `add_expense`, `delete_expense` |
| Dashboard/reports (`db.rs`) | `get_dashboard_stats`, `get_revenue_overview`, `get_top_selling_items`, `get_recent_expenses`, `get_todays_sales`, `get_cashier_dashboard_stats`, `get_current_shift`, `start_shift`, `end_shift`, `get_analytics_report`, `get_detailed_report`, `save_text_report` |
| Payroll (`db.rs`) | `get_payroll_summary`, `get_payroll_period`, `get_payroll_record`, `update_payroll_record`, `process_payroll_batch`, `process_payout`, `get_payout_history`, `get_paid_staff_ids`, `process_batch_payout`, `reopen_payroll`, `void_payroll`, `delete_payroll_record`, `delete_payroll_period`, `pay_advance_salary`, `update_advance`, `delete_advance`, `get_advance_transactions_for_record`, `get_advance_history`, `get_staff_advance_balance`, `get_payroll_history` |
| Inventory (`db.rs`) | `get_inventory_items`, `add_inventory_item`, `update_inventory_item`, `delete_inventory_item`, `record_inventory_usage`, `record_inventory_purchase`, `get_inventory_transactions`, `get_inventory_summary`, `delete_inventory_transaction` |
| Backup/import (`db.rs`) | `get_backup_settings`, `update_backup_settings`, `perform_backup`, `check_and_run_auto_backup`, `validate_backup_file`, `import_backup_file` |
| Printing (`print.rs`, `db.rs`) | `get_print_settings`, `update_print_settings`, `list_printers`, `get_default_printer`, `print_thermal_ticket`, `print_designed_ticket`, `print_file_to_printer`, `thermal_preview` (devtools), plus `save_print_html`, `open_ticket_html`, `print_receipt_text`, `print_html_to_pdf` |
| License (`license.rs`) | `get_machine_hwid`, `check_license_status`, `activate_license`, `get_license_info`, `restore_license_from_backup`, `generate_license_code` |

## 12. Database Location & Connection

**[Confirmed]** — `src-tauri/src/db.rs` / `src-tauri/src/main.rs`.

- Production DB path: `%LOCALAPPDATA%\RMS\local.db` (directory auto-created). **No CWD fallback** — deliberate.
- Tests override with env var **`DB_PATH`** (e.g., `backend_test.db`, `payroll_audit_test.db` in `src-tauri/`), and the WDIO harness seeds its own `%LOCALAPPDATA%\RMS\e2e-test\test.db`.
- Connection settings: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- A shared connection lives in a `static DB_CONN` and is guarded by a mutex; `get_conn()` / `get_conn_locked()` / `reopen_connection_locked()` exist. Backup import intentionally closes and reopens the connection (with rollback on failure) so stale `-wal`/`-shm` files don't corrupt state.
- Panics: a global panic hook (main.rs) writes a rotating `%LOCALAPPDATA%\RMS\crash.log` (+ `.1`).

## 13. Database Schema (Tables)

**[Confirmed]** — from `db.rs` (`init_db` + `run_migrations`). Exact column sets below are the ones read from the migration/CREATE statements.

| Table | Key columns (types omitted where obvious) |
|---|---|
| `license` | `id` (PK, single row id=1), `current_key`, `expiry_date`, `activated_at`, `hwid`, `original_hwid`, `hwid_restored_at`, `restore_count`, `last_validated_date` |
| `restaurant_settings` | `id` (PK, id=1), `restaurant_name`, `logo_path`, `tax_rate REAL`, `total_tables` (+ many `order_*`/delivery/service-charge settings columns added by migrations) |
| `roles` | `id`, `name UNIQUE` (seeded Admin/Cashier) |
| `users` | `id`, `username UNIQUE`, `password_hash`, `role_id → roles`, `must_change_password`, `display_name`, `security_answer` (bcrypt), `security_question`; unique index on `LOWER(username)` |
| `categories` | `id`, `name UNIQUE` |
| `menu_items` | `id`, `name`, `category_id → categories`, `price REAL`, `image_path`, `is_active` |
| `expenses` | `id`, `amount REAL`, `date`, `category`, `note`, `reference_type`, `reference_id` (linking payroll payouts/advances) |
| `salary_payouts` | `id`, `staff_id`, `amount REAL`, `date` (legacy payout rows; new payroll uses `payroll_records`) |
| `orders` | `id`, `status`, `created_at`, `closed_at`, `order_type` (Dine-in/Takeaway/Delivery), `subtotal`, `tax_amount`, `discount_amount`, `service_charge_amount`, `amount_received`, `change_due`, `customer_id`, `customer_phone`, `cashier_name`, `order_note`, `order_taker_id`, `order_taker_name`, `table_id` (default 0), `order_number`, `order_period_key` (+ indexed), `delivery_status`, `delivery_address`, `delivery_driver_id`, `delivery_fee` |
| `order_items` | `id`, `order_id → orders`, `item_id`, `name` (snapshot of menu item), `price REAL` (snapshot), `quantity`, `kot_printed_qty` (default 0) |
| `staff_categories` | `id`, `name` (seeded `Order Taker`) |
| `staff` | `id`, `name`, `role` (default 'Staff'), `phone`, `salary REAL` (default 0), `status` (Active/…), `category_id`, `pin_code` (numeric PIN used by cashiers for order-taking) |
| `staff_attendance` | `id`, `staff_id → staff`, `date`, `clock_in`, `clock_out`, `status` (Present/…), `note` |
| `table_categories` | `id`, `name` |
| `table_status` | `category_id → table_categories`, `table_number`, `status`, `UNIQUE(category_id, table_number)` |
| `shifts` | `id`, `start_time`, `end_time`, `opening_cash`, `closing_cash`, `status` (open/closed) |
| `advance_salaries` | `id`, `staff_id → staff`, `amount`, `date`, `note`, `is_deducted`, `deducted_amount` (linkage to payroll is period/date-based) |
| `customers` | `id`, `name`, `phone UNIQUE`, `visits`, `total_spent`, `address` |
| `inventory_items` | `id`, `name UNIQUE`, `unit`, `low_stock_threshold`, `default_supplier`, `created_at`, `current_stock` (derived from transactions) |
| `inventory_transactions` | `id`, `item_id → inventory_items`, `type` (purchase/usage), `quantity`, `unit_price`, `total_cost`, `supplier`, `note`, `date`, `created_at` |
| `reset_attempts` | `username` (PK), `count`, `window_start` |
| `payroll_records` | `id`, `start_date`, `end_date`, `staff_id → staff`, `base_salary`, `bonus`, `deduction`, `advance_deduction`, `gross_pay`, `net_pay`, `status` (Pending/Paid), `payroll_id`, `created_at`, `updated_at`, `paid_at`; **UNIQUE(start_date, end_date, staff_id)** — prevents double pay for the same period; index on period |
| `print_settings` | single row (`CHECK (id = 1)`): `receipt_printer`, `kot_printer`, `delivery_receipt_printer`, `receipt_copies`, `kot_copies`, `delivery_receipt_copies`, legacy `print_mode`, and layout JSON columns `receipt_layout`, `kot_layout`, `delivery_receipt_layout` (legacy `delivery_printer`/`delivery_copies`/`delivery_layout` exist but are unused by the code) |

## 14. Database Migrations

**[Confirmed]** schema-versioning mechanism; step detail partially inferred:

- Versioning via **`PRAGMA user_version`** (`SCHEMA_VERSION` constant in `db.rs`). `run_migrations()` runs the pending steps once; it persists the new version **only after all steps succeed** (transactional-ish: full success required before the version lifts, so a partial run re-applies cleanly).
- Notable migration steps (from `db.rs`, in order): creation of the core eight tables (`license`, `restaurant_settings`, `roles`, `users`, `categories`, `menu_items`, `expenses`, `salary_payouts`); `restaurant_settings` column additions; `table_status`/`shifts`; `orders` expansion (delivery, order-taker, service-charge, `order_number`/`order_period_key`, `table_id`); `staff`/`advance_salaries`/`customers`; `license` additions; `inventory_*`; security-answer hashing + `reset_attempts`; password hashing refresh; `table_status` rebuild to `category_id`+`table_number` with unique constraint; payroll overhaul (UNIQUE period index, backfill of legacy `salary_payouts` → `payroll_records`); cleanup of empty orders; per-period `order_number` backfill; `print_settings`; legacy UTC date normalization.
- Rationales visible in code: payroll period uniqueness "prevents double pay"; the case-insensitive username index renames legacy case-duplicate usernames during migration (test `username_uniqueness.rs`); `order_number` reset follows `order_reset_frequency` (daily/weekly/etc.) stored in `restaurant_settings`.

## 15. Seed Data & First-Run State

**[Confirmed]** — `db.rs` `init_db`:

- `roles`: `(1,'Admin')`, `(2,'Cashier')` (INSERT OR IGNORE).
- `restaurant_settings` row id=1: name `"My Restaurant"`, `tax_rate 16.0`, `total_tables 10`.
- Two default users (bcrypt-hashed password — literal value **redacted** here; defined in `db.rs` seed code), both flagged `must_change_password=1`:
  - `admin@restaurant.com` → role Admin
  - `cashier@restaurant.com` → role Cashier
- `staff_categories` seeded with `'Order Taker'`.

## 16. Domain: Orders, POS & Checkout

**[Confirmed]** — `src/pages/POS.tsx` (1559 lines, the biggest page) + `db.rs` order commands.

- Order lifecycle: table selected → `get_or_create_order` / `create_walkin_order`/`get_active_order` → add/remove/delete items → optional discount → optional delivery draft → checkout → `status` transitions to closed/`"Delivery Pending"`.
- **Totals are always recomputed server-side at checkout** (`checkout_order`): tax = `round2(subtotal × tax_rate/100)`, gross = subtotal + tax + service charge (service charge applied only when `order_type` ∈ the configured service-charge type list), discount = `round2(min(requested, gross))`, total = gross + delivery_fee − discount. Rejects total ≤ 0 and missing/invalid received amount.
- KOT: `order_items.kot_printed_qty` tracks how many copies of the kitchen ticket have printed; `mark_kot_printed` increments it so a KOT reprint only prints the unprinted portion.
- Order numbers reset per period (`order_period_key` + `order_reset_frequency`). Tables free up on checkout/cancel. Cancellation requires confirmation (ConfirmModal). POS lets you assign an Order Taker (staff member) and change order type mid-order.
- Requirements gating (configurable in Settings → Order Requirements): require table for dine-in, require order taker for dine-in / other, require phone/address for delivery, auto-assign order taker.
- Cashier uses it for cash flow; Admin uses it too. POS shows quick-cash chips, live change calculation, discount editing, receipt printing on checkout, and a HOLD button (saves draft, navigates to `/pos/0`).

## 17. Domain: Menu & Categories

**[Confirmed]** — `src/pages/MenuManagement.tsx`.

- Category CRUD and menu-item CRUD (name, price, image path, category), plus active/inactive toggle (inactive items hidden from POS). Deletion of a category used by menu items is blocked server-side (cascade test coverage: `cascade_deletes.rs`). Icons are chosen from an icon keyword matcher (lucide) in the UI.

## 18. Domain: Tables

**[Confirmed]** — `src/pages/TableManagement.tsx` + `table_status`/`table_categories`.

- Table categories (sections/floors), single add or bulk add (syntax like `11-13,15`), delete (blocked when a category still has tables or an order is on a table), admin-only manual status override (`admin_update_table_status`). Statuses drive the POS table grid.

## 19. Domain: Staff, Attendance & Shifts

**[Confirmed]** — `StaffManagement.tsx`, `CashierDashboard.tsx`, `db.rs`.

- Staff CRUD (name, role, phone, salary, status, category, numeric PIN for cashier order-taking). Staff categories (e.g., `Order Taker`) used both by the POS order-taker feature and payroll grouping.
- Attendance: `clock_in_out` toggles staff `Present`/clocked-out for a given day. Cashier dashboard starts/ends shifts with opening/closing cash.

## 20. Domain: Inventory

**[Confirmed]** — `src/pages/Inventory.tsx` (813 lines) + `db.rs`.

- Items keyed by unique name, units presets, low-stock threshold, default supplier. Transactions are either `purchase` (stock up, optionally with unit price/cost and supplier) or `usage` (stock down). Stock level is computed from transactions. Purchases can **auto-create an expense row** (helpful for reports). Deleting a transaction restores stock accordingly. Low/out-of-stock pills appear in the overview and in reports.

## 21. Domain: Expenses

**[Confirmed]** — `src/pages/Expenses.tsx` + `db.rs`.

- Add/delete expense rows with amount, date, category, note. Date filtering by day/month/custom. Payroll payouts are inserted as expense rows (with `reference_type='payroll'`/`salary_advance` and `reference_id`) so payroll and advances appear in expense/report views without double-entry friction. Delete is restore-safe (voiding a payroll also deletes its payout rows).

## 22. Domain: Customers & Delivery

**[Confirmed]** — `Customers.tsx`, `DeliveryManagement.tsx`, `db.rs`.

- Customer registry keyed by unique phone; POS can auto-resolve or create a customer (`resolve_customer`, `get_customers`/`add_customer`). `visits`/`total_spent` increment on delivery/order checkout (test: `delivery.rs` validates `visits`).
- Delivery orders: checkout with `order_type=Delivery` → `"Delivery Pending"` → driver assignment (`assign_delivery_driver`) → status transitions to Delivered (closes the order). Delivery settings: base fee + free-delivery threshold. Delivery receipt printer/ticket with customer details block.

## 23. Domain: Payroll & Advances

**[Confirmed]** — `src/pages/payroll/*` + `db.rs` (+ `payroll/types.ts` contracts).

- Period-based: pick start/end date, load staff (`get_payroll_summary`), show attendance-based days, compute base salary, add bonuses/deductions, auto-deduct the staff's advance balance (`PayrollEditDrawer` shows live net-pay preview), then process selected staff or the whole period (`process_payroll_batch`).
- Double-pay protection via `UNIQUE(start_date, end_date, staff_id)`; `reopen_payroll` resets a paid period back to Pending (removing payout+expense rows), `void_payroll` restores the advances that had been deducted. History page can reopen/void/delete a period, reprint slips/reports, and export the payroll report to PDF.
- Advances: `pay_advance_salary` records advance + `advance_salaries` rows; `get_advance_history` groups by staff and period; advances are deducted automatically when payroll for the covering period is processed (test: `payroll_live_repro.rs` regression).
- Payroll slips render in a separate `PayrollSlipTemplate` (58/80mm thermal style) with Paid/Pending/Advance variants.

## 24. Domain: Reports & Dashboard

**[Confirmed]** — `Dashboard.tsx`, `CashierDashboard.tsx`, `Reports.tsx`, `ReportTemplate.tsx`.

- Admin Dashboard: KPI cards + recharts area/pie; revenue overview, top selling items (with images), recent expenses, today's sales. Cashier dashboard: today's stats + shift start/end + clock in/out.
- Reports: kinds daily/weekly/monthly/custom with a `DateFilterToolbar`; `get_analytics_report`/`get_detailed_report`; PDF export via `exportReportAsPdf` (headless Edge); `save_text_report` writes a text export; expense/inventory/payroll report templates are also PDF-exportable.

## 25. Domain: Settings Modules

**[Confirmed]** — `src/pages/Settings.tsx` (7 tabs) + section components.

| Tab / Section component | Covers |
|---|---|
| General (in `Settings.tsx`) | restaurant name, logo, contact, tax rate, service-charge types, order number reset frequency, etc. via `update_settings` |
| Order Requirements (`OrderRequirementsSection.tsx`) | six toggles: require table/order-taker for dine-in, require taker for other, require phone/address for delivery, auto-assign taker |
| Printing (`PrintSettingsSection.tsx`) | 4 tabs (printers / receipt / KOT / delivery-receipt): printer selection (`""` = OS default, `dialog`, `browser`, PDF printers allowed, fax/xps/onenote filtered), copy counts 1–99, Test-print buttons that run the real pipeline, and per-kind design tabs (widthMm 58–80, fontScale, charsPerLine override, header/footer text, item-name width %, many visibility toggles with `toggle-*` testids) |
| Delivery (`DeliverySettingsSection.tsx`) | base fee + free threshold |
| Backup (`BackupSection.tsx`) | frequency Off/Daily/Weekly, folder pick, "Backup Now" (admin-password gated), relative last-backup time |
| Data Migration (`DataMigrationSection.tsx`) | pick a `.db` file, `validate_backup_file` shows its restaurant, `import_backup_file` imports (admin-password gated) |
| License (inline) | license key/HWID/expiry/restore info, refresh |

`Settings.tsx` dispatches a `settingsUpdated` window event so the Sidebar/Header re-read the restaurant name/logo.

## 26. License & Hardware Locking

**[Confirmed]** — `src-tauri/src/license.rs` (985 lines).

- **HWID** (`get_hwid`): SHA-256 over permanent identifiers — CPU `ProcessorId`, boot-disk serial (`Win32_DiskDrive` Index 0), and SMBIOS system `UUID` — trimmed to 16 hex chars formatted `XXXX-XXXX-XXXX-XXXX`. WMI placeholder values ("Default string", "To be filled by O.E.M.", etc.) are filtered. Fallback (hostname|MAC|MachineGuid) only when no permanent ID exists (locked-down VM). First computed value is persisted in `license.hwid` and reused; cache invalidation on backup-license adoption.
- **License code scheme (current):** 16 hex chars `XXXX-XXXX-XXXX-XXXX` = HMAC-SHA256(`LICENSE_SECRET`, `HWID|expiry`). Verification scans candidate expiry dates from today out to +10 years (~3,660 HMACs) to recover the expiry; wrong-code vs wrong-machine produce the **identical** failure message. Constant-time comparison.
- **Owner password scheme:** activation codes are generated from an owner password constant `OWNER_PASSWORD` in `license.rs` (value **redacted** here by policy) plus `LICENSE_SECRET` (which must be rotated in lock-step with the password). The `generate_license_code` Tauri command and `scripts/keygen.cjs` (`create-key <HWID> <YYYY-MM-DD>`) produce codes.
- **Legacy RSA scheme (still verified):** base64 `HWID|YYYY-MM-DD\n<RSA-SHA256 signature>` with an embedded public key (`PUBLIC_KEY_PEM`); kept so pre-migration keys/backups work.
- **Enforcement:** 5-second cached `is_license_valid()` gate in `authorize()` (defense in depth) + App-level screen gating. `check_license_status` persists `last_validated_date` and **invalidates the license if the system clock is rolled back**.
- **Backup restore of license** (`restore_license_from_backup`): public/pre-login path but blocked when a valid license already exists (→ use Settings → Data Migration); globally throttled; requires the backup's admin password; validates against the backup's own embedded HWID + today's real date; adopts the backup license and tracks `original_hwid`/`restore_count`.

## 27. Printing System (HTML / PDF / Browser / Dialog)

**[Confirmed]** — `src/lib/printing.ts` (695 lines) + `src-tauri/src/print.rs` (754 lines).

- Destinations (selected by the configured printer name via `printTicketDocument(kind, element, document, text, settings)`):
  1. `browser` → `open_ticket_html` (write designed HTML, open via OS).
  2. `dialog` → hidden-iframe `window.print()`.
  3. blank → resolve OS default via `get_default_printer`.
  4. name matching `/pdf/i` → `print_html_to_pdf` (headless Edge → real PDF).
  5. any other physical printer → **thermal first** (`print_thermal_ticket`), with a **one-shot** fallback chain: `print_designed_ticket` (HTML→Edge PDF→`printto`) → `print_receipt_text` (plain-text RAW). Fallbacks never recurse.
- `print_designed_ticket`: writes temp `rms_ticket_{ns}.html`, Edge→PDF via `printto`, copies ×N.
- `print_html_to_pdf`: headless Edge (`--headless=new --disable-gpu --no-pdf-header-footer --user-data-dir=…`), 40 s deadline, cleans the temp Edge profile; then `opener::open`.
- Plain-text RAW printing (`print_text` / `print_raw_bytes`): embeds a C# `RawPrint` P/Invoke class into PowerShell (`Add-Type`) using `OpenPrinter`/`StartDocPrinter`/`WritePrinter`/`EndDocPrinter`; PDF printers are re-routed to a real PDF first (they can't consume RAW bytes).
- Printer discovery (`list_printers`): PowerShell `Get-Printer` JSON, cached 10 s (bypass with `force`); `get_default_printer` via WMI.
- Admin-gated print commands: `update_print_settings`, `print_html_to_pdf`, `print_file_to_printer`. Checkout-time printing (`print_thermal_ticket`, `print_designed_ticket`, `print_receipt_text`, `open_ticket_html`) is available to any authenticated role — required for cashier POS printing.
- Report PDF export (`src/lib/pdfExport.ts`): physical-printer blocklist (`microsoft print to pdf`, `fax`, `xps`, `onenote`) and a "ticket printer" guard so an A4 report never lands on an 80mm ticket printer.

## 28. Thermal Printing (Deterministic ESC/POS)

**[Confirmed]** — `src-tauri/src/thermal/` + `src/lib/thermalSamples.ts` + `src/pages/ThermalSimulator.tsx`. Full design rationale in `docs/01_ARCHITECTURE.md`, `docs/04_AI_AGENT_RULES.md`, `docs/05_VIRTUAL_PRINTER_TESTING.md`.

- Shared logical model `ReceiptDocument` (`thermal/model.rs`; snake_case; mirrored in `src/lib/printing.ts`): `kind` (receipt/kot/delivery_receipt), `restaurant`, `meta` (order no, date/time, type, table label, cashier, order taker), optional `customer`, `items`, `totals`, `payment`. The same JSON drives both HTML and ESC/POS renderers — React JSX is *not* the only source of truth.
- Printer profiles: `thermal_58mm(32 cpl)` / `thermal_80mm(48 cpl)`; `profile_for_paper(≤62mm → 58mm, else 80mm)`; font scaling via `effective_columns` (clamp scale 40–200, columns clamp 8..cpl); per-layout `charsPerLine` override (16–72) for tickets whose heads only fit fewer columns (e.g. 42 on a 512-dot 80mm head).
- Layout engine (`thermal/layout.rs`, 624 lines, pure functions): greedy word wrap with hard-split of unbreakable words (no char loss), centered wrapping, label `.` value padding, money formatting that mirrors frontend `rs.` format, explicit item columns (numbered rows, wrapped names stay in their own column, qty/total never drift), per-kind renderers for Receipt/KOT/Delivery, `calculate_document_height` = lines + cut margin only (no artificial blank space).
- ESC/POS builder (`thermal/escpos.rs`): `ESC @` init, alignment (`ESC a`), emphasis (`ESC E`), size (`GS !`), text (LF-terminated), divider, QR (`GS ( k` model-2), cut `GS V B 0`. Deterministic ASCII-safe encoding: typographic quotes/dashes/bullets normalized, control chars → space, all non-ASCII → `?` (Urdu requires a codepage-capable font — tracked separately). Includes a debug-only decoder.
- Renderer (`thermal/renderer.rs`): diff-driven command emission (emit `align`/`bold` only on state change), ends with a `bold(false)` guard, feeds + cut at the end.
- Printer abstraction (`thermal/printer.rs`): `RealThermalPrinter` (→ `print::print_raw_bytes`) and `VirtualThermalPrinter` (in-memory capture incl. decoded commands; rejects empty jobs without state change). Trait forbid implicit retries after uncertain state.
- `thermal_preview` command (`devtools.rs`) runs the **same production pipeline** and returns text view, decoded commands, base64 bytes, line count, columns — used by the dev-only `ThermalSimulator` page and the Rust golden tests.
- Golden test suite: `src-tauri/tests/thermal/tests.rs` (703 lines) + `src-tauri/tests/golden/{receipt,kot,delivery}/*.txt|.bin` — run via `npm run thermal:test`. Golden samples `SAMPLE_01..08` cover minimal, long item, 10/50 items, long restaurant info, zero values, large total, special chars.
- Frontend test-print + simulator data come from `src/lib/thermalSamples.ts` and live `Test` buttons in `PrintSettingsSection`.

## 29. Backups, Restore & Data Migration

**[Confirmed]** — `BackupSection.tsx`, `DataMigrationSection.tsx`, `db.rs`.

- `perform_backup`: copies the live DB to a user-chosen folder (optional auto schedule daily/weekly via `update_backup_settings`/`check_and_run_auto_backup`). Both are **Admin-only** (and `check_and_run_auto_backup` also requires a valid license + logged-in admin — called from `App.tsx` on load).
- `validate_backup_file`: reads the backup's restaurant name + license so the UI can preview before importing (validates DB file legibility).
- `import_backup_file`: copies the file in, closes the shared connection, clears stale `-wal`/`-shm`, reopens with rollback on failure; also adopts the backup's license/HWID path for migration scenarios.
- `restore_license_from_backup`: the pre-login equivalent for first-run on a new machine (see §26). Restore count/`original_hwid` tracked.

## 30. Security Considerations & Known Constraints

**[Confirmed]** — code-level observations:

- Central server-side authorization (never trusts the client role), server-side price recomputation at checkout, license gate + clock-rollback detection, forced password change, case-insensitive unique usernames, throttles for login/verify/reset, limited concurrent sessions.
- Printer settings updates are admin-only; ticket printing is open to authenticated roles (required for cashiers). Report exports refuse to print to ticket/PDF/fax printers.
- HTML escaping in the raw-text path; `save_print_html` (legacy, unused by the current frontend) runs `sanitize_html` stripping scripts/iframes/`on*=`/`javascript:`; `print_html_to_pdf`/`open_ticket_html` deliberately skip sanitize because it would strip `<style>` (Tailwind) — trust boundary noted in code comments.
- Thermal print logging is restricted to `kind/stage/profile` — never customer data.
- CSP in `tauri.conf.json` is strict (`script-src 'self'`), allows inline styles, `data:`/`https:` images and `ipc:`/`http://ipc.localhost` connect.
- **Environment constraint (this machine):** `cargo`/Rust commands are blocked by Windows Application Control (see §5). Do not attempt workarounds.
- Installer version string `0.1.0` in `installer.iss` while app/Cargo/tauri.json say `1.0.0` — a release-readiness mismatch (§32).

## 31. Testing Strategy

**[Confirmed]** — see also `docs/03_TESTING_STRATEGY.md`, `docs/05_VIRTUAL_PRINTER_TESTING.md`, `implementation_plan.md`.

| Layer | What exists |
|---|---|
| Rust unit tests (`src-tauri/src/thermal/tests.rs`) | wrap/columns/money/encoding/QR/height/virtual-printer invariants + golden snapshot comparison (`.txt` + raw `.bin`), width-overflow invariant across 11 docs × 2 profiles, KOT/delivery specifics |
| Rust integration tests (`src-tauri/tests/*.rs`, 19 files) | `auth`, `pos_cart`, `cascade_deletes`, `inventory`, `payroll_audit`, `payroll_live_repro`, `delivery`, `expenses`, `settings`, `print_settings`, `order_taker`, `username_uniqueness`, `table_categories`, `legacy_db_migration`, `import_reopen`, `backup_restore`, `integration`, `license` — ~26 `#[test]`, each in an isolated `DB_PATH`-overridden DB |
| E2E (WebdriverIO + Tauri plugin, `test/e2e/*.cjs`) | `diag` (takes a clean start), `loginFlow` (wrong password, admin sees nav, cashier blocked from admin nav), `menuManagement` (CRUD verified in SQLite), `staffPayroll` (staff, clock in/out, process payroll), `settings` (all 7 tabs, DB-verified save), `printSettings` (printer discovery, copies, live test prints, preview toggles), `orderFlow` (**runs last** — native print dialogs can block later specs). Harness: `setup.cjs` seeds a fresh isolated DB + self-signed license (via `scripts/.keys`), `watchdog.cjs` snapshots/restores the live DB and kills orphaned `rms.exe`/`msedgedriver` |
| Manual walkthrough | extensive phased matrix in `implementation_plan.md` (auth, POS, menu, tables, staff/payroll, inventory, customers/delivery, expenses, reports, settings, clean-machine installer checklist) |

**Status caveat:** Rust tests cannot be executed on this machine (cargo blocked). Frontend checks that pass here: `npx tsc`, `npm run build`, `node --check` on e2e/scripts. The e2e suite needs a locally built debug `rms.exe`.

## 32. Known Issues, Caveats & Observations

- `src-tauri/src/test_print.rs` is an orphan UTF-16LE scratch file (winspool FFI compile probe) — **not** declared in `lib.rs` or `Cargo.toml`; dead code. **[Confirmed]**
- `ThermalSimulator.tsx` calls `thermal_preview` via the raw `@tauri-apps/api/core` `invoke` (no `sessionToken`), while `thermal_preview` passes through the central `authorize` gate → the call would be rejected with "Not authenticated." **[Confirmed: code reading; UI impact Inferred]** — likely a latent bug worth fixing when the simulator is used.
- Legacy `buildReceiptText` (plain-text fallback) **truncates** long item names with `~`, whereas the Rust thermal layout engine **wraps** them; the fallback text is therefore not byte-identical to the ESC/POS ticket. **[Confirmed]**
- `print_settings` keeps legacy `delivery_printer`/`delivery_copies`/`delivery_layout` columns that are never read (`PrintSettings` uses the `delivery_receipt_*` columns). **[Confirmed]**
- `save_print_html` is registered but unused by the current frontend. **[Confirmed]**
- `installer.iss` declares version `0.1.0` while the app is `1.0.0`. **[Confirmed]**
- Root `README.md` is the untouched Tauri/React template; root `implementation_plan.md` references the old repo path `d:/RMS` and `v0.1.0` — stale, treat as historical. **[Confirmed]**
- `src-tauri/tests.rs` golden generator (`generate_golden_snapshots`) is `#[ignore]`-gated on purpose so goldens only change by explicit intent. **[Confirmed]**
- Earlier `git diff --check` "trailing whitespace" reports in `Settings.tsx` were CR-at-EOL artifacts (LF index vs CRLF working tree); re-checking with `core.whitespace=cr-at-eol` shows no real trailing whitespace. **[Confirmed, historical]**
- Toast auto-dismiss timing can interfere with WebdriverIO `waitUntil` assertions that outlive a toast's duration (toast types last 3500–6000 ms). **[Inferred — observed during e2e work]**
- Many `backend_*_test.db`/`-shm`/`-wal` and `cascade_*`/`payroll_*` `.db` files sit in `src-tauri/` from past Rust test runs — they are runtime artifacts, not sources. **[Confirmed]**

## 33. Conventions & Developer Guidelines

- **Follow the docs.** `docs/01_ARCHITECTURE.md` (two-renderer thermal architecture + routing), `docs/02_IMPLEMENTATION_PLAN.md` (phase order: types → profiles → wrap → columns → render → ESC/POS → printer → IPC → routing → fallback), `docs/03_TESTING_STRATEGY.md`, `docs/04_AI_AGENT_RULES.md` (highest-priority: treat thermal printing as deterministic layout, never CSS-hack it; regression test every thermal fix), `docs/05_VIRTUAL_PRINTER_TESTING.md`, `docs/RMS_THERMAL_PRINTING_MASTER_SPEC.md`, `docs/THERMAL_MIGRATION_BASELINE.md`.
- **Printing rules (non-negotiable):** physical thermal printing must go through the deterministic thermal renderer; never align columns with hardcoded spaces; never solve a thermal layout bug with margin/padding/zoom/CSS/@page hacks; no artificial receipt heights; fallback is explicit and never recursive; a failed print must not silently reprint.
- **Backend conventions:** money in `REAL` with `round2`; views recompute totals server-side; sessions/authorization centralized in `lib.rs::authorize`; DB access via the shared connection helpers; tests override `DB_PATH`.
- **Frontend conventions:** TypeScript strict, no unused vars; Tailwind v4 classes; shadcn-style primitives under `src/components/ui/`; lucide icons; `formatCurrency`/`parseDeviceDate`/`todayLocal` from `src/lib/utils.ts`; every backend call goes through `src/lib/api.ts` `invoke` (token injection) unless there is a specific reason not to; currency is `Rs.`.
- **UI feedback convention (established during recent work):** use the custom toast system (`useToast` → `success/error/info/warning`) for transient feedback; keep blocking `AlertModal`/`ConfirmModal` only for decisions that must halt the flow (e.g., POS checkout validation); keep field-level inline validation for forms; eye-candy risk: toasts auto-dismiss — never rely on them for waitUntil-style e2e assertions.
- **Workflow (from `docs/04_AI_AGENT_RULES.md`):** Inspect → Explain → Test-first → smallest consistent change → Verify (typecheck/build/tests/both printers) → Report (`Changed / Tests / Build / Remaining risks`). Scope: never refactor unrelated code or rename public APIs without necessity.
- **This environment:** no lint script; `npm run build` is the frontend gate; Rust verification is source-reading only (cargo blocked); commit only when explicitly asked.

---

### Appendix — Quick File Index (verified paths)

| Concern | Primary files |
|---|---|
| Frontend entry | `src/main.tsx`, `src/App.tsx`, `src/ErrorBoundary.tsx`, `src/App.css` |
| Frontend core libs | `src/lib/api.ts` (invoke wrapper), `src/lib/session.ts`, `src/lib/auth.tsx`, `src/lib/toast.tsx` (toast system), `src/lib/utils.ts`, `src/lib/printing.ts` (print router), `src/lib/pdfExport.ts`, `src/lib/thermalSamples.ts`, `src/lib/useClickOutside.ts` |
| Pages | `src/pages/*` (18) + `src/pages/payroll/*` (3 pages + `types.ts`) = 21 page components |
| Components | `src/components/*` (30, incl. `ui/`, 8 templates, 6 settings sections, modals, Sidebar/Header) |
| Tauri main | `src-tauri/src/main.rs` (panic log, init, HWID warm-up), `lib.rs` (authorize + 141-command handler) |
| Business logic/DB | `src-tauri/src/db.rs` (schema, migrations, all db commands) |
| Auth/sessions | `src-tauri/src/auth.rs` |
| License | `src-tauri/src/license.rs` |
| Printing | `src-tauri/src/print.rs`; thermal: `src-tauri/src/thermal/{mod,model,layout,escpos,renderer,printer,tests}.rs`; `devtools.rs` (`thermal_preview`) |
| Procs/HWID | `src-tauri/src/proc_util.rs` |
| Tauri config | `src-tauri/tauri.conf.json`, `capabilities/default.json`, `Cargo.toml`, `build.rs` |
| Tests | `src-tauri/tests/*.rs` (+ `tests/golden/`), `test/e2e/*.cjs`, `wdio.conf.cjs`, `scripts/watchdog.cjs` |
| Tooling | `scripts/keygen.cjs`, `installer.iss`, `vite.config.ts`, `tsconfig*.json`, `components.json` |
| Docs | `docs/*` (7 files), `implementation_plan.md` |