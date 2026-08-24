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
