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
