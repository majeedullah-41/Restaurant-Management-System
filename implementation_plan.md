# Production Readiness & Testing Plan — Restaurant Management System

## Overview

Your RMS is a full-featured Tauri v2 desktop application (React frontend + Rust/SQLite backend) with 17 pages, 24 components, ~140 IPC commands, licensing, payroll, POS, delivery, inventory, and reporting. Below is a structured plan to take it from `v0.1.0` to a confident production release.

---

## Phase 1 — Fix Known Issues & Code Hygiene

> **Goal**: Eliminate all compiler warnings, lint errors, and known UI bugs before testing begins.

### 1.1 Fix All Compilation Errors
- [ ] Run `npm run build` (Vite + TSC) — fix every TypeScript error
- [ ] Run `cargo build --release` — fix every Rust warning (`#![allow(...)]` is hiding issues in [lib.rs](file:///d:/RMS/src-tauri/src/lib.rs))
- [ ] Remove `#![allow(dead_code, unused_variables, non_snake_case)]` and address each warning individually

### 1.2 Version Bump
- [ ] Change version from `0.1.0` → `1.0.0` in [package.json](file:///d:/RMS/package.json), [Cargo.toml](file:///d:/RMS/src-tauri/Cargo.toml), and [tauri.conf.json](file:///d:/RMS/src-tauri/tauri.conf.json)

### 1.3 Tauri Config Hardening
- [ ] Set `"fullscreen": false`, `"resizable": true`, `"minWidth": 1024`, `"minHeight": 600` in [tauri.conf.json](file:///d:/RMS/src-tauri/tauri.conf.json)
- [ ] Review CSP for production (currently allows `data:` for img-src — confirm this is intentional for base64 logos)

---

## Phase 2 — Manual Walkthrough Testing (YOU do this)

> **Goal**: Systematically click through every feature as if you're the restaurant owner. Use a notepad to log bugs.

### 2.1 Authentication & Security
| # | Test | Pass? |
|---|------|-------|
| 1 | Login with valid Admin credentials | |
| 2 | Login with wrong password — see error message | |
| 3 | Login with Operator credentials — verify restricted sidebar | |
| 4 | Forgot password flow — security question reset | |
| 5 | Force password change on first login | |
| 6 | Session expiry — leave app idle, confirm redirect to login | |
| 7 | Operator tries to access admin-only pages via URL — blocked | |

### 2.2 POS & Order Flow (Most Critical)
| # | Test | Pass? |
|---|------|-------|
| 1 | Create a Dine-in order from a table | |
| 2 | Add multiple items, change quantities | |
| 3 | Remove an item from the cart | |
| 4 | Apply discount (flat + percentage) | |
| 5 | Apply tax — verify calculation | |
| 6 | Apply service charge — verify it only applies to the configured order types | |
| 7 | Checkout with cash — verify change calculation | |
| 8 | Print receipt (Preview mode) — verify logo, watermark, all fields | |
| 9 | Print receipt (Direct/Text mode) — verify plain text layout + watermark | |
| 10 | Create a Takeaway order (walk-in, no table) | |
| 11 | Create a Delivery order — fill customer + address | |
| 12 | Print KOT (Kitchen Order Ticket) | |
| 13 | Cancel an active order — verify table becomes free | |
| 14 | Reassign an order to a different table | |
| 15 | Change order type mid-order (Dine-in → Takeaway) | |
| 16 | Verify order number resets correctly (Daily/Weekly/etc.) | |

### 2.3 Menu Management
| # | Test | Pass? |
|---|------|-------|
| 1 | Add a new category | |
| 2 | Add a menu item with price and image | |
| 3 | Edit a menu item's name and price | |
| 4 | Toggle a menu item active/inactive — verify it hides from POS | |
| 5 | Delete a menu item | |
| 6 | Delete a category — verify items are handled | |

### 2.4 Table Management
| # | Test | Pass? |
|---|------|-------|
| 1 | Add a single table | |
| 2 | Add multiple tables in batch | |
| 3 | Delete a table | |
| 4 | Create/edit/delete table categories (sections/floors) | |
| 5 | Table status changes correctly: Available → Occupied → Available after checkout | |

### 2.5 Staff & Payroll
| # | Test | Pass? |
|---|------|-------|
| 1 | Add a new staff member with all fields | |
| 2 | Edit staff details | |
| 3 | Delete a staff member | |
| 4 | Clock in/out — verify attendance records | |
| 5 | Process payroll for a period | |
| 6 | Pay advance salary, verify deduction in payroll | |
| 7 | Print salary slip — verify watermark is present and non-removable | |
| 8 | Edit a payroll record | |
| 9 | Void/reopen a payroll period | |
| 10 | View payroll history | |

### 2.6 Inventory
| # | Test | Pass? |
|---|------|-------|
| 1 | Add an inventory item (name, unit, quantity, alert threshold) | |
| 2 | Record a purchase (stock increase) | |
| 3 | Record usage (stock decrease) | |
| 4 | Verify low-stock alert triggers | |
| 5 | View inventory transaction history | |
| 6 | Delete an inventory item | |

### 2.7 Customers & Delivery
| # | Test | Pass? |
|---|------|-------|
| 1 | Add a customer | |
| 2 | Search/resolve a customer during order | |
| 3 | Place a delivery order | |
| 4 | Update delivery status (Preparing → Out for Delivery → Delivered) | |
| 5 | Assign a driver | |
| 6 | Verify delivery fee appears on receipt | |

### 2.8 Expenses
| # | Test | Pass? |
|---|------|-------|
| 1 | Add an expense with category and amount | |
| 2 | Delete an expense | |
| 3 | Verify expenses appear in daily reports | |

### 2.9 Reports & Dashboard
| # | Test | Pass? |
|---|------|-------|
| 1 | Dashboard loads — revenue, order count, top items display | |
| 2 | Cashier Dashboard — shift start/end, stats display | |
| 3 | Generate a daily report | |
| 4 | Generate a weekly/monthly report | |
| 5 | Export report (text/print) | |
| 6 | Verify charts render correctly | |
| 7 | Verify date filter toolbar works across all ranges | |

### 2.10 Settings
| # | Test | Pass? |
|---|------|-------|
| 1 | Inner sidebar navigation works (all 6 tabs) | |
| 2 | Save general preferences — name, contact, logo, tax, service charge | |
| 3 | Print settings — change mode, receipt layout toggles | |
| 4 | Delivery settings — configure zones/fees | |
| 5 | Backup — manual backup works | |
| 6 | Backup — auto-backup triggers on schedule | |
| 7 | Restore from backup — verify data integrity | |
| 8 | Data migration — import from old DB format | |
| 9 | License info displays correctly | |
| 10 | License renewal flow works | |

---

## Phase 3 — Automated Backend Tests (Rust)

> **Goal**: Run existing tests + add critical missing ones.

### 3.1 Run Existing Tests
```bash
cd d:\RMS\src-tauri
cargo test
```

You already have 11 test files covering auth, payroll audit, POS cart, print settings, etc. Run them and fix any failures.

### 3.2 Add Missing Critical Tests
| Test File | What to Cover |
|-----------|--------------|
| `tests/inventory.rs` | Add/update/delete item, purchase/usage recording, stock calculations |
| `tests/delivery.rs` | Delivery order flow, status transitions, driver assignment |
| `tests/expenses.rs` | Add/delete expense, report aggregation |
| `tests/backup_restore.rs` | Backup creation, restore integrity, auto-backup scheduling |
| `tests/settings.rs` | Save/load settings round-trip, service charge type parsing |

---

## Phase 4 — E2E Tests (WebDriverIO)

> **Goal**: Expand from 2 existing e2e tests to cover all critical user journeys.

### 4.1 Run Existing E2E Tests
```bash
npm run test:e2e
```

You have [orderFlow.test.cjs](file:///d:/RMS/test/e2e/orderFlow.test.cjs) and [printSettings.test.cjs](file:///d:/RMS/test/e2e/printSettings.test.cjs). Fix any failures.

### 4.2 Add Priority E2E Tests
| Test File | What to Cover |
|-----------|--------------|
| `loginFlow.test.cjs` | Login, wrong password, operator restrictions |
| `menuManagement.test.cjs` | CRUD categories + items |
| `staffPayroll.test.cjs` | Add staff, clock in/out, process payroll |
| `settings.test.cjs` | Navigate inner sidebar, save preferences |

---

## Phase 5 — Edge Cases & Stress Testing

> **Goal**: Break the app intentionally to find hidden bugs.

### 5.1 Data Edge Cases
- [ ] Create an order with 0 items — attempt checkout (should block)
- [ ] Enter negative tax rate, negative price — verify validation
- [ ] Enter extremely long restaurant name (500+ chars) — verify UI doesn't break
- [ ] Enter special characters in all text fields (Arabic, emoji, quotes, `<script>`)
- [ ] Set discount greater than order total — verify behavior
- [ ] Delete a staff member who has active payroll records — verify cascade handling
- [ ] Delete a category that has menu items — verify items are handled

### 5.2 Concurrent Scenarios
- [ ] Two windows/instances open on the same machine — verify DB locking works
- [ ] Rapid click "Checkout" button multiple times — verify no duplicate orders

### 5.3 Network & System
- [ ] App works fully offline (it should — no network needed after license activation)
- [ ] Kill the app mid-order (Task Manager) — reopen and verify order is still there
- [ ] Disk near full — verify backup warns or fails gracefully

---

## Phase 6 — Production Build & Installer

> **Goal**: Create a polished, installable release.

### 6.1 Build Configuration
- [ ] Update `productName` in [tauri.conf.json](file:///d:/RMS/src-tauri/tauri.conf.json) to final name
- [ ] Set proper app icon (all sizes in `src-tauri/icons/`)
- [ ] Confirm NSIS installer settings (install path, shortcuts, uninstaller)

### 6.2 Build & Smoke Test
```bash
npm run tauri build
```
- [ ] Install the MSI on a **clean Windows machine** (or VM)
- [ ] Install the NSIS .exe setup on a **different clean machine**
- [ ] Verify first-launch: license screen → activation → login → dashboard
- [ ] Verify uninstall fully cleans up

### 6.3 Clean Machine Checklist
| # | Test on Fresh PC | Pass? |
|---|------------------|-------|
| 1 | Installer runs without errors | |
| 2 | App launches on first try | |
| 3 | License activation works | |
| 4 | Create first admin account / default login works | |
| 5 | Complete a full order cycle | |
| 6 | Print a receipt | |
| 7 | Backup and restore | |
| 8 | Uninstall removes app cleanly | |

---

## Phase 7 — Final Polish

> **Goal**: Professional touches before shipping.

- [ ] Add "About" section with version number visible to user
- [ ] Verify all print templates have the `Eaglenest Creations (0346-4451505)` watermark
- [ ] Verify dark mode looks good on every page
- [ ] Test at minimum window size (1024×600) — no overflows
- [ ] Remove any `console.log` statements from production code
- [ ] Remove WDIO/test plugins from production build (already conditional via `#[cfg(debug_assertions)]` ✅)

---

## Recommended Execution Order

| Priority | Phase | Time Estimate | Who |
|----------|-------|---------------|-----|
| 🔴 **P0** | Phase 1 — Fix compilation | 1-2 hours | Me (I can do this) |
| 🔴 **P0** | Phase 2 — Manual walkthrough | 3-4 hours | **You** (with the notepad) |
| 🟡 **P1** | Phase 3 — Rust backend tests | 2-3 hours | Me |
| 🟡 **P1** | Phase 5 — Edge case testing | 1-2 hours | **You** |
| 🟢 **P2** | Phase 4 — E2E tests | 3-4 hours | Me |
| 🟢 **P2** | Phase 6 — Production build | 1-2 hours | Together |
| 🟢 **P2** | Phase 7 — Final polish | 1-2 hours | Together |

> [!IMPORTANT]
> **Phase 2 (Manual Walkthrough) is the most important phase.** No amount of automated testing replaces you sitting down and using every single feature like your customer will. I can fix bugs and write tests, but only you can feel whether the app is ready.

## Open Questions

1. **Do you have a clean Windows PC or VM** to test the installer on? This is critical — bugs often only show up on machines that don't have development tools installed.
2. **What is the default admin login** for a fresh install? I need to verify the first-run experience.
3. **Do you want me to start with Phase 1** (fixing compilation) and **Phase 3** (writing more Rust tests) while you do Phase 2 (manual walkthrough)?
