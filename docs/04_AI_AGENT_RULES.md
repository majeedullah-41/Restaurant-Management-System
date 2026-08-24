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
