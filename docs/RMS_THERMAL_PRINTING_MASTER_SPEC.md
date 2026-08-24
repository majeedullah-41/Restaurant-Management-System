# RMS Thermal Printing Architecture

## Purpose

This document defines the target architecture for thermal receipt, KOT,
and delivery-ticket printing in the Restaurant Management System (RMS).

The goal is to make physical thermal printing deterministic and
independent from browser/PDF layout behavior while preserving the
existing React preview, browser printing, PDF printing, and print-dialog
functionality.

## Current System

The current pipeline is:

React template → standalone HTML → Edge headless PDF → Windows `printto`
→ thermal printer

It is reliable as a general document-printing strategy but can cause
thermal-specific problems:

-   excessive blank space
-   inconsistent page height
-   driver-dependent scaling
-   long receipts
-   wrapping differences
-   font-size differences
-   margins added by browser/driver/printer
-   layout changes caused by CSS/PDF rendering

## Target System

Use two renderers from one shared receipt definition:

``` text
                    PRINT REQUEST
                         |
                         v
                  Receipt Data Model
                         |
                         v
                  Receipt Layout Model
                    /            \
                   /              \
                  v                v
          HTML Renderer       ESC/POS Renderer
              |                    |
        +-----+------+             |
        |     |      |             |
      Browser PDF  Dialog          |
                                   v
                            Thermal Printer
```

### HTML Renderer

Used for:

-   Settings live preview
-   Browser destination
-   PDF destination
-   Native print dialog

### ESC/POS Renderer

Used for:

-   physical thermal printers
-   58mm and 80mm paper
-   deterministic line wrapping
-   deterministic columns
-   direct/raw printer output

## Source of Truth

The source of truth must be receipt data + receipt layout configuration.

React JSX must not be the only source of truth.

The system should conceptually have:

``` text
Order Data
    +
Receipt Layout
    =
Receipt Document
```

Both renderers consume the same logical document.

## Core Components

### Frontend

Recommended responsibilities:

-   `ReceiptTemplate.tsx`
-   `KotTicketTemplate.tsx`
-   `DeliveryReceiptTemplate.tsx`
-   `ReceiptDesigner`
-   `receiptLayout` types/schema
-   `printing.ts`

Frontend should:

1.  collect receipt data
2.  load layout settings
3.  create a logical receipt definition
4.  send print request
5.  render HTML when HTML output is required
6.  never implement ESC/POS byte-level logic

### Rust Backend

Recommended responsibilities:

-   receipt layout calculations
-   text wrapping
-   column calculations
-   ESC/POS command generation
-   printer profile handling
-   raw Windows spooler printing
-   printer errors and fallback

Suggested modules:

``` text
src-tauri/src/
├── print.rs
├── thermal/
│   ├── mod.rs
│   ├── model.rs
│   ├── layout.rs
│   ├── escpos.rs
│   ├── renderer.rs
│   ├── printer.rs
│   └── tests.rs
└── db.rs
```

Do not create unnecessary abstractions before tests exist.

## Printer Profile

Never assume every thermal printer has identical capabilities.

A printer profile should contain at least:

``` text
paper_width_mm
characters_per_line
font_mode
default_font_scale
supports_cut
supports_qr
supports_image
```

Typical starting profiles:

``` text
58mm:
  characters_per_line: configurable, commonly around 32

80mm:
  characters_per_line: configurable, commonly around 48
```

The actual printer profile must remain configurable because character
capacity depends on printer font mode, driver, and hardware.

## Thermal Layout Model

The thermal renderer should work with logical blocks:

``` text
Receipt
├── Header
├── RestaurantInfo
├── OrderInfo
├── CustomerInfo
├── Items
├── Totals
├── Payment
├── QR
└── Footer
```

Each block may have:

``` text
visible
alignment
bold
font_size
spacing_before
spacing_after
```

The item table should have explicit columns rather than manually
inserted spaces.

Example:

``` text
ITEM NAME                  QTY        TOTAL
Chicken Burger               2          900
Large Pizza                  1         1200
```

The renderer calculates actual widths.

## Column Rules

Never align columns using hardcoded spaces.

Bad:

``` text
name + "        " + qty + "    " + total
```

Good:

``` text
columns = [
  item_name,
  quantity,
  total
]

layout_engine.calculate_columns(columns, available_width)
```

Long names must wrap into the item-name column without moving the
quantity or total columns.

## Wrapping Rules

Wrapping must happen before ESC/POS output.

For example:

``` text
Chicken Cheese Burger Special
Extra Large
```

must remain within the item-name column.

The second line should normally contain only the wrapped name, not
duplicate quantity or price.

## Vertical Layout

Avoid artificial fixed receipt heights.

The thermal document height should be:

``` text
sum(all rendered lines)
+ configured spacing
+ cut margin
```

Do not add a large bottom spacer.

## Existing Features To Preserve

Do not remove:

-   `receipt_printer`
-   `kot_printer`
-   `delivery_receipt_printer`
-   copy settings
-   `*_layout_json`
-   browser destination
-   dialog destination
-   PDF destination
-   OS default printer resolution
-   admin-only settings updates
-   cashier print permissions
-   plain-text fallback
-   sample print buttons

## Destination Routing

Recommended routing:

``` text
destination == browser
    -> HTML

destination == dialog
    -> HTML

destination == PDF
    -> HTML -> PDF

destination == physical thermal printer
    -> ESC/POS
    -> on failure: existing HTML/PDF or text fallback
```

The fallback must never recursively call itself.

## Security and Permissions

Printing commands may remain available to permitted operational roles as
they are today.

Changing printer settings remains admin-only.

Do not loosen settings permissions while implementing the thermal
renderer.

## Non-Goals

This architecture is not intended to:

-   replace the existing React receipt designer
-   replace report PDF generation
-   support arbitrary rich HTML on ESC/POS
-   guarantee identical pixel-level output between HTML and ESC/POS
-   rely on a printer driver to fix layout mistakes

## Implementation Rule

When fixing a thermal layout bug:

1.  identify whether it is a data, layout, wrapping, ESC/POS, or
    printer-profile problem
2.  fix it in the correct layer
3.  add a regression test
4.  do not randomly change CSS to compensate for ESC/POS problems

# RMS Thermal Printing Implementation Plan

## Objective

Introduce a deterministic ESC/POS thermal-printing path without breaking
the existing HTML/PDF/browser/dialog printing paths.

## Phase 1 --- Freeze Current Behavior

Before changing the architecture:

-   record current print settings schema
-   record current IPC commands
-   record all print callers
-   record existing fallback behavior
-   preserve current sample data
-   confirm existing browser/PDF/dialog behavior

Do not perform a large refactor before this baseline exists.

## Phase 2 --- Create Shared Receipt Types

Create a shared logical representation.

Example conceptual model:

``` text
ReceiptDocument
  metadata
  header
  order_info
  customer
  items
  totals
  payment
  footer
```

Use strongly typed Rust structures for the thermal path.

The frontend should provide all values required by the model.

## Phase 3 --- Printer Profiles

Implement:

``` text
PrinterProfile
```

with configurable:

-   paper width
-   character capacity
-   font mode
-   scaling
-   cut support
-   QR support

Do not make 58mm/80mm assumptions globally.

## Phase 4 --- Layout Engine

Implement pure functions first.

Suggested functions:

``` text
calculate_available_width()
calculate_columns()
wrap_text()
render_item_row()
render_header()
render_totals()
calculate_document_height()
```

Pure functions are easier to unit test than printer functions.

## Phase 5 --- ESC/POS Command Builder

Create a small command builder responsible for:

-   initialization
-   alignment
-   bold
-   font size
-   line feed
-   text encoding
-   divider
-   QR
-   cut

Keep command generation separate from receipt layout.

The layout engine decides WHAT should be printed.

The ESC/POS builder decides HOW that instruction is encoded.

## Phase 6 --- Windows Printer Output

Reuse the existing raw spooler approach where appropriate:

``` text
OpenPrinter
StartDocPrinter
WritePrinter
EndDocPrinter
ClosePrinter
```

The renderer should produce bytes.

The printer module should receive bytes.

Do not mix receipt layout calculations into Win32 printer code.

## Phase 7 --- Frontend Integration

Update `printTicketDocument()` so physical thermal printers use:

``` text
print_thermal_ticket(...)
```

HTML destinations remain unchanged.

The existing HTML route should remain available as fallback.

## Phase 8 --- Settings Integration

Keep existing settings fields.

Add printer-profile information only if required.

Do not duplicate layout configuration unnecessarily.

The React designer may continue to save JSON.

The thermal renderer should consume the relevant layout properties from
that JSON through a validated adapter.

## Phase 9 --- Failure Handling

Recommended sequence:

``` text
thermal print request
        |
        v
validate receipt
        |
        v
render ESC/POS bytes
        |
        v
send to printer
        |
   +----+----+
 success   failure
   |          |
   v          v
 finish     fallback
```

Every failure must be logged with:

-   print kind
-   printer name
-   paper profile
-   error stage
-   error message
-   fallback used

Do not log customer-sensitive data unnecessarily.

## Phase 10 --- Regression Cleanup

After the thermal route is stable:

-   remove unused temporary files from the thermal path
-   retain HTML/PDF functionality
-   remove dead legacy commands only after verifying no caller uses them
-   document the final routing

## Coding Rules

### Rule 1

Do not rewrite unrelated printing code.

### Rule 2

Do not modify database schema unless necessary.

### Rule 3

Do not solve printer alignment with CSS.

### Rule 4

Do not use fixed spaces for columns.

### Rule 5

Do not hardcode one printer's character capacity into global code.

### Rule 6

Every bug fix gets a regression test.

### Rule 7

Keep pure layout code independent of Windows APIs.

### Rule 8

Never block the UI indefinitely on a printer.

### Rule 9

Printing must remain safe to retry.

### Rule 10

Do not silently print twice after an uncertain printer error.

## Suggested Implementation Order

``` text
1. Types
2. Printer profiles
3. Text wrapping
4. Column engine
5. Logical receipt renderer
6. ESC/POS builder
7. Rust unit tests
8. Raw printer integration
9. Frontend IPC
10. Routing
11. Fallback
12. End-to-end testing
```

Do not reverse this order unless there is a concrete reason.

# RMS Thermal Printing Testing Strategy

## Goal

Thermal printing must be tested as a layout system, not merely by
checking whether a printer receives bytes.

A successful test must verify:

-   no unnecessary blank space
-   no horizontal overflow
-   correct wrapping
-   correct totals
-   correct alignment
-   correct paper width
-   correct copies
-   correct printer selection
-   correct fallback behavior

## Test Levels

### 1. Unit Tests

Test pure functions without a printer.

Examples:

-   text wrapping
-   column calculation
-   alignment
-   totals formatting
-   line generation
-   printer profile selection

### 2. Snapshot Tests

Generate the logical thermal output and compare it against a known
expected representation.

Example:

``` text
MY RESTAURANT
Main Road, Swat
0345-1234567
--------------------------------
Order #1024       22 Aug 2026
--------------------------------
ITEM                       TOTAL
Burger x2                    900
Pizza x1                    800
--------------------------------
Subtotal                    1700
Discount                     100
TOTAL                       1600
--------------------------------
        THANK YOU
```

Snapshot tests should be stable and human-readable.

### 3. ESC/POS Byte Tests

Verify that important commands exist in the correct order.

Examples:

``` text
initialize
center
bold on
text
bold off
left
items
cut
```

Do not assert every byte for every test unless the byte sequence itself
is the feature being tested.

### 4. Integration Tests

Test the Rust command that receives a receipt and sends it to the
printer abstraction.

Use a mock printer/spooler where possible.

### 5. Hardware Tests

A small physical test matrix is required.

At minimum:

``` text
58mm printer
80mm printer
```

Test every supported printer family when practical.

## Golden Test Data

Create fixed sample datasets.

### SAMPLE_01_MINIMAL

``` text
1 item
1 quantity
no discount
no tax
cash payment
```

### SAMPLE_02_LONG_ITEM

``` text
Very long item name
```

Expected:

-   wraps correctly
-   total remains aligned
-   no overflow

### SAMPLE_03_MANY_ITEMS

``` text
10+ items
```

Expected:

-   every item appears
-   no missing rows
-   no duplicate rows
-   no unexpected large gaps

### SAMPLE_04_VERY_LONG_ORDER

``` text
50+ items
```

Expected:

-   receipt remains continuous
-   no artificial page breaks
-   no huge blank area

### SAMPLE_05_LONG_RESTAURANT_INFO

Test:

-   long restaurant name
-   long address
-   long phone number

Expected:

-   centered/wrapped correctly
-   no clipping

### SAMPLE_06_ZERO_VALUES

Test:

-   zero discount
-   zero tax
-   zero change

Expected:

-   optional rows follow configured visibility rules

### SAMPLE_07_LARGE_TOTAL

Test very large totals.

Expected:

-   total remains within printable width

### SAMPLE_08_SPECIAL_CHARACTERS

Test supported Urdu/local characters and symbols according to the
selected printer encoding strategy.

Expected behavior must be explicitly defined.

### SAMPLE_09_58MM

Run the complete sample suite with a 58mm profile.

### SAMPLE_10_80MM

Run the complete sample suite with an 80mm profile.

## Property Tests

Useful invariants:

### Width invariant

For every rendered line:

``` text
visible_width(line) <= printer.columns
```

### No trailing overflow

No line may exceed the configured printable width.

### Item preservation

Every input item must appear exactly once unless the layout
intentionally splits it across lines.

### Total preservation

Printed subtotal, discount, tax, and total must match the source receipt
values.

### Order preservation

Items must appear in the same order as the source data.

### No accidental duplication

A failed print must not automatically issue a second physical print
unless retry behavior is explicitly requested.

## Visual Hardware Checklist

For each physical printer:

-   [ ] restaurant name centered
-   [ ] address centered
-   [ ] order number visible
-   [ ] date/time visible
-   [ ] item names readable
-   [ ] quantities aligned
-   [ ] prices aligned
-   [ ] totals aligned
-   [ ] discount correct
-   [ ] tax correct
-   [ ] final total visually prominent
-   [ ] payment information readable
-   [ ] no clipping
-   [ ] no horizontal overflow
-   [ ] no unnecessary blank area
-   [ ] cut occurs after content
-   [ ] second copy is correct when configured
-   [ ] long item names wrap correctly
-   [ ] 10+ item order remains continuous

## Regression Protocol

Whenever a bug is reported:

1.  reproduce using fixed sample data
2.  determine the layer responsible
3.  add a failing automated test
4.  fix the layer
5.  run the full thermal suite
6.  test one physical printer
7.  document the regression

Never fix only the visual symptom.

## Test Output Artifacts

During development, allow a debug mode that can produce:

``` text
receipt.txt
receipt_debug.json
receipt_escpos.bin
receipt_layout.json
```

These artifacts make AI-agent debugging much easier.

## Performance Tests

Measure:

-   receipt generation time
-   printer submission time
-   UI blocking duration

The thermal renderer should be fast enough that normal checkout does not
feel delayed.

Do not perform unnecessary browser/PDF rendering in the thermal path.

## Failure Tests

Simulate:

-   printer not found
-   printer offline
-   spooler failure
-   invalid printer profile
-   invalid layout JSON
-   unsupported QR
-   unsupported encoding
-   malformed receipt data

Expected:

-   clear error
-   no application crash
-   no duplicate print
-   appropriate fallback
-   useful log entry

# RMS Thermal Printing --- AI Agent Rules

## Mission

Implement and maintain a production-quality thermal printing system for
the RMS.

The system must be reliable for restaurant checkout operations.

Printing errors are operationally important because they can cause:

-   duplicate bills
-   missing KOTs
-   wrong totals
-   slow checkout
-   paper waste
-   customer confusion

## Highest-Priority Rule

Do not treat thermal printing as ordinary web printing.

Physical thermal printing must use a deterministic thermal renderer.

## Before Changing Code

The agent MUST inspect:

``` text
src/lib/printing.ts
src-tauri/src/print.rs
src-tauri/src/db.rs
ReceiptTemplate.tsx
KotTicketTemplate.tsx
DeliveryReceiptTemplate.tsx
all print callers
print settings schema
```

The agent must understand the existing pipeline before modifying it.

## Preserve Existing Behavior

Do not break:

-   receipt printing
-   KOT printing
-   delivery receipt printing
-   copy counts
-   browser printing
-   print dialog
-   PDF output
-   OS default printer
-   printer-name selection
-   admin settings permissions
-   cashier printing permissions
-   existing fallback behavior

## Do Not Do This

Never solve a thermal layout issue by randomly changing:

``` text
margin
padding
zoom
@page height
CSS width
PDF page height
iframe dimensions
```

unless the issue is specifically in the HTML renderer.

## Thermal Renderer Rules

The thermal renderer must:

-   use printer profiles
-   calculate printable width
-   wrap text
-   calculate columns
-   prevent overflow
-   generate ESC/POS
-   avoid unnecessary blank lines
-   avoid artificial receipt heights

## Column Rule

Never do:

``` text
item + "     " + qty + "     " + total
```

Use calculated columns.

## Layout Rule

Separate:

``` text
data
layout
rendering
printer output
```

Do not put all four responsibilities in one function.

## Error Handling Rule

Every print stage must identify itself.

Recommended stages:

``` text
validation
layout
escpos_generation
printer_resolution
spooling
fallback
```

Errors should say which stage failed.

## Fallback Rule

Fallback must be explicit.

Never silently print through two routes after an uncertain printer
state.

If the printer may have accepted the job before returning an error, do
not automatically retry unless the system can determine that the job was
not accepted.

## Testing Rule

Every thermal bug requires a regression test.

Minimum tests for layout changes:

-   minimal receipt
-   long item
-   many items
-   large total
-   58mm
-   80mm

## AI Workflow

For every task:

### Step 1 --- Inspect

Read the relevant files.

### Step 2 --- Explain

Before a large change, identify:

-   current behavior
-   root cause
-   affected layer
-   proposed change

### Step 3 --- Test First

Add or update a test that demonstrates the problem.

### Step 4 --- Implement

Make the smallest architecture-consistent change.

### Step 5 --- Verify

Run:

-   Rust tests
-   frontend tests if affected
-   type checking
-   linting
-   build
-   thermal snapshot tests

### Step 6 --- Report

State:

``` text
Changed:
Tests:
Build:
Remaining risks:
```

## Scope Control

Do not refactor unrelated code.

Do not rename public APIs without necessity.

Do not replace the entire printing architecture merely because one
receipt has a layout issue.

Prefer incremental migration.

## Database Rule

Do not change print-settings schema unless required.

Existing legacy columns should not be removed during the thermal
renderer implementation.

## React Rule

React remains responsible for visual HTML rendering.

Do not duplicate the entire React UI inside Rust.

The Rust thermal renderer should render the logical receipt, not
arbitrary JSX.

## Debug Mode

When diagnosing a layout problem, the agent should be able to output:

``` text
logical receipt
printer profile
calculated column widths
wrapped lines
ESC/POS command summary
```

This is more useful than repeatedly changing CSS and asking the user to
print.

## Definition of Done

A thermal-printing change is complete only when:

-   [ ] layout tests pass
-   [ ] 58mm tests pass
-   [ ] 80mm tests pass
-   [ ] long item wrapping passes
-   [ ] many-item receipt passes
-   [ ] totals are correct
-   [ ] no line exceeds printable width
-   [ ] no unnecessary blank space is produced
-   [ ] existing browser output still works
-   [ ] existing PDF output still works
-   [ ] existing dialog output still works
-   [ ] fallback behavior still works
-   [ ] build succeeds
-   [ ] relevant hardware test passes

## Final Principle

The AI agent must optimize for:

``` text
Predictability > Cleverness
Correctness > Visual hacks
Deterministic thermal output > Browser reproduction
Small tested changes > Large rewrites
```
