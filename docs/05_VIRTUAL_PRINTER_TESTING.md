# RMS Thermal Printing --- Virtual Printer & No-Hardware Testing

## Purpose

This document defines how to develop and test the RMS thermal printing
system when no physical thermal printer is available.

The virtual testing system must allow the AI coding agent to validate:

-   receipt width
-   line wrapping
-   column alignment
-   totals
-   spacing
-   receipt height
-   ESC/POS command generation
-   58mm layouts
-   80mm layouts
-   KOT layouts
-   delivery receipts
-   failure behavior

The objective is to make the thermal renderer testable without depending
on physical hardware.

------------------------------------------------------------------------

# 1. Core Principle

A thermal printer should be treated as an output device.

Do not require physical hardware to test the layout engine.

The development pipeline should be:

``` text
Receipt Data
     |
     v
Receipt Layout Model
     |
     v
Thermal Layout Engine
     |
     +-------------------+
     |                   |
     v                   v
Text Simulator      ESC/POS Renderer
     |                   |
     v                   v
Snapshot Tests       .bin Output
     |                   |
     +---------+---------+
               |
               v
        Automated Tests
```

When a physical printer becomes available, it should be used for final
hardware validation, not for every development iteration.

------------------------------------------------------------------------

# 2. Virtual Printer

Create a virtual printer abstraction.

Conceptually:

``` text
trait ThermalPrinter {
    print(bytes)
}
```

Implement at least:

``` text
RealThermalPrinter
VirtualThermalPrinter
```

The virtual printer should not send anything to Windows or a physical
device.

Instead it should capture:

-   generated ESC/POS bytes
-   decoded commands
-   logical printed lines
-   printer profile
-   print job metadata

Example:

``` text
VirtualPrintJob
├── printer_profile
├── receipt_kind
├── raw_bytes
├── decoded_commands
└── rendered_lines
```

------------------------------------------------------------------------

# 3. Human-Readable Text Output

Every thermal test should be able to generate a plain-text
representation.

Example 80mm output:

``` text
                 MY RESTAURANT
                Main Road, Swat
                 0345-1234567

Order #1024                  22 Aug 2026
------------------------------------------------
ITEM                              QTY       TOTAL
Chicken Burger                     2          900
Large Pizza                        1         1200
Fries                              2          400
------------------------------------------------
Subtotal                                      2500
Discount                                       100
Tax                                             50
------------------------------------------------
TOTAL                                         2450

Cash                                            3000
Change                                           550

                    THANK YOU!
```

The text representation must use the same layout calculations as the
ESC/POS renderer.

Do not create a second independent layout algorithm just for testing.

------------------------------------------------------------------------

# 4. Snapshot Testing

Store expected text output as snapshots.

Example:

``` text
tests/golden/
├── receipt_58mm_minimal.txt
├── receipt_58mm_long_item.txt
├── receipt_58mm_many_items.txt
├── receipt_80mm_minimal.txt
├── receipt_80mm_long_item.txt
├── receipt_80mm_many_items.txt
├── kot_58mm.txt
└── kot_80mm.txt
```

A snapshot test should:

1.  create fixed receipt data
2.  select a printer profile
3.  render the receipt
4.  produce human-readable lines
5.  compare against the expected snapshot

If the output changes unexpectedly, the test must fail.

Do not automatically update snapshots without reviewing the change.

------------------------------------------------------------------------

# 5. Width Validation

This is one of the most important automated checks.

For every output line:

``` text
visible_width(line) <= printer.columns
```

Example:

``` text
80mm profile
maximum = 48 columns
```

If:

``` text
line width = 51
```

the test must fail.

Error example:

``` text
THERMAL WIDTH OVERFLOW

Profile: 80mm
Maximum columns: 48
Actual width: 51

Line:
Chicken Cheese Burger Special      2      900
```

This should be treated as a layout error, not a printer error.

------------------------------------------------------------------------

# 6. 58mm Profile

The 58mm profile must define its printable capacity explicitly.

Do not assume a universal value.

Example configuration:

``` text
paper_width_mm: 58
characters_per_line: configurable
```

The exact character capacity must be verified against the selected font
mode and printer profile.

Tests must include:

-   minimal receipt
-   long item
-   long restaurant name
-   many items
-   large total
-   discount
-   tax
-   payment
-   KOT
-   delivery receipt

------------------------------------------------------------------------

# 7. 80mm Profile

The 80mm profile must also define:

``` text
paper_width_mm: 80
characters_per_line: configurable
```

Tests must include the same cases as 58mm.

The 80mm renderer must not simply scale the 58mm output.

It should calculate its own column widths.

------------------------------------------------------------------------

# 8. Long Text Tests

Create intentionally difficult text.

Example restaurant name:

``` text
THE VERY LONG RESTAURANT NAME THAT DEFINITELY SHOULD WRAP
```

Example address:

``` text
House 123, Street 456, Main Road, District Swat, Khyber Pakhtunkhwa
```

Example item:

``` text
Chicken Cheese Zinger Burger With Extra Cheese And Special Sauce
```

Expected behavior:

-   no horizontal overflow
-   text wraps according to the configured policy
-   quantity remains aligned
-   price remains aligned
-   no characters are silently lost

------------------------------------------------------------------------

# 9. Evil Receipt Data

Create deliberately difficult test cases.

## Evil Test 1 --- Long Restaurant Name

``` text
restaurant_name =
"THE VERY LONG RESTAURANT NAME THAT DEFINITELY SHOULD NOT FIT"
```

## Evil Test 2 --- Long Address

``` text
address =
"House 123, Street 456, Main Road, Somewhere, District Swat, KPK"
```

## Evil Test 3 --- Long Item

``` text
"Chicken Cheese Zinger Burger With Extra Cheese And Special Sauce"
```

## Evil Test 4 --- Many Items

Generate at least:

``` text
10 items
25 items
50 items
```

## Evil Test 5 --- Large Numbers

Test:

``` text
999999999
```

for totals and prices.

## Evil Test 6 --- Long Customer Name

Use a deliberately long customer name.

## Evil Test 7 --- Zero Values

Test:

``` text
discount = 0
tax = 0
change = 0
```

## Evil Test 8 --- Optional Sections

Enable and disable:

-   customer
-   tax
-   discount
-   payment
-   QR
-   footer
-   address
-   phone

The renderer must not leave unexplained blank areas when a section is
disabled.

------------------------------------------------------------------------

# 10. Item Table Testing

The item table is the most important part of a restaurant receipt.

Use explicit columns.

Example:

``` text
ITEM NAME                         QTY       TOTAL
Chicken Burger                     2          900
Large Pizza                        1         1200
```

Never use manual spaces for alignment.

The test must verify:

``` text
item column
quantity column
total column
```

remain inside the printable width.

------------------------------------------------------------------------

# 11. Wrapping Policy

The wrapping behavior must be explicitly defined.

Example policy:

``` text
Line 1:
item name

Line 2+:
continued item name

Final line:
quantity + total
```

Or another policy may be chosen.

The important requirement is consistency.

Tests must verify:

-   long item names
-   long customer names
-   long restaurant names
-   long addresses
-   long footer messages

No text should unexpectedly push numeric columns outside the printable
width.

------------------------------------------------------------------------

# 12. Receipt Height Testing

The virtual renderer must calculate the number of printed lines.

Example:

``` text
content lines = 38
configured cut margin = 3

expected final lines = 41
```

There must not be arbitrary padding such as:

``` text
+ 20 blank lines
```

unless explicitly configured.

Test:

``` text
final_content_index
```

and ensure no unexplained blank area occurs before the cut command.

------------------------------------------------------------------------

# 13. ESC/POS Binary Testing

The ESC/POS renderer should be able to save raw output:

``` text
debug/receipt_80mm.bin
```

This file can be inspected later or sent to a printer when hardware is
available.

Tests should verify important command ordering.

Example:

``` text
INIT
ALIGN CENTER
BOLD ON
RESTAURANT NAME
BOLD OFF
ALIGN LEFT
ORDER INFO
ITEMS
TOTALS
ALIGN CENTER
FOOTER
CUT
```

Do not assert every byte in every test.

Test exact bytes only where the byte sequence itself is important.

------------------------------------------------------------------------

# 14. ESC/POS Debug Decoder

Create a development-only decoder that converts raw ESC/POS into
readable commands.

Example:

``` text
[INIT]
[ALIGN CENTER]
[BOLD ON]
[TEXT] "MY RESTAURANT"
[BOLD OFF]
[ALIGN LEFT]
[TEXT] "Order #1024"
[LINE FEED]
[TEXT] "Burger                 2       900"
[LINE FEED]
[CUT]
```

This is much easier to debug than binary data.

The decoder should be development/test tooling and must not be required
by production printing.

------------------------------------------------------------------------

# 15. PNG Preview

Optionally provide a visual virtual-printer preview.

Pipeline:

``` text
Receipt Data
    |
    v
Thermal Layout Engine
    |
    v
Logical Printed Lines
    |
    v
PNG Renderer
```

The PNG renderer should use the same:

-   character width
-   wrapping
-   columns
-   alignment
-   line order

as the actual thermal renderer.

It must not use the existing browser receipt CSS as its layout
algorithm.

This gives developers a quick visual approximation of the thermal
output.

------------------------------------------------------------------------

# 16. Virtual Printer UI

Add a development-only screen or tool:

``` text
THERMAL PRINTER SIMULATOR

Paper:
[ 58mm ] [ 80mm ]

Receipt:
[ Customer Receipt ]
[ KOT ]
[ Delivery ]

Test Data:
[ Minimal ]
[ Long Item ]
[ 10 Items ]
[ 50 Items ]
[ Evil Receipt ]

[ Render ]

--------------------------------
       MY RESTAURANT
      Main Road, Swat
--------------------------------
Order #1024

ITEM                         TOTAL
Chicken Burger                  900
...

--------------------------------

[Export TXT]
[Export BIN]
[Export JSON]
```

This is extremely useful during vibe coding.

------------------------------------------------------------------------

# 17. Golden Test Suite

Create a stable set of golden cases.

Recommended:

``` text
golden/
├── receipt/
│   ├── 58mm_minimal.txt
│   ├── 58mm_long_item.txt
│   ├── 58mm_10_items.txt
│   ├── 58mm_50_items.txt
│   ├── 58mm_large_total.txt
│   ├── 80mm_minimal.txt
│   ├── 80mm_long_item.txt
│   ├── 80mm_10_items.txt
│   ├── 80mm_50_items.txt
│   └── 80mm_large_total.txt
├── kot/
│   ├── 58mm.txt
│   └── 80mm.txt
└── delivery/
    ├── 58mm.txt
    └── 80mm.txt
```

------------------------------------------------------------------------

# 18. Test Invariants

Every thermal receipt must satisfy:

## Width

``` text
every line <= configured width
```

## Item Preservation

``` text
input item count == rendered item count
```

unless one item intentionally occupies multiple wrapped lines.

## Order Preservation

``` text
rendered item order == source item order
```

## Total Preservation

``` text
rendered totals == source totals
```

within the system's defined money-formatting rules.

## No Duplication

An item must not appear twice because of wrapping.

## No Missing Content

Required fields must be present.

## No Unexplained Blank Lines

Blank lines must come from an explicit layout rule.

## Cut

The cut command must occur after the final intended content.

------------------------------------------------------------------------

# 19. Test Matrix

Run the following matrix:

  Test                     58mm   80mm
  ---------------------- ------ ------
  Minimal receipt             ✓      ✓
  Long restaurant name        ✓      ✓
  Long address                ✓      ✓
  Long item name              ✓      ✓
  10 items                    ✓      ✓
  25 items                    ✓      ✓
  50 items                    ✓      ✓
  Large total                 ✓      ✓
  Discount                    ✓      ✓
  Tax                         ✓      ✓
  Payment                     ✓      ✓
  Customer                    ✓      ✓
  QR                          ✓      ✓
  KOT                         ✓      ✓
  Delivery                    ✓      ✓

------------------------------------------------------------------------

# 20. Failure Simulation

The virtual printer should also simulate failures.

Test:

``` text
printer unavailable
printer name invalid
spooler failure
invalid ESC/POS data
invalid printer profile
invalid layout configuration
unsupported encoding
```

Expected behavior:

-   application does not crash
-   checkout remains responsive
-   error is logged
-   fallback is invoked according to policy
-   duplicate printing is avoided

------------------------------------------------------------------------

# 21. No-Hardware Development Workflow

When developing without a physical printer:

``` text
1. Change layout code
2. Run unit tests
3. Run golden snapshots
4. Run width validation
5. Run 58mm tests
6. Run 80mm tests
7. Generate TXT output
8. Generate ESC/POS BIN
9. Inspect virtual preview
10. Run application build
```

Only after all automated checks pass should a hardware test be required.

------------------------------------------------------------------------

# 22. Hardware Validation Later

When a physical printer becomes available:

``` text
Virtual Printer
      |
      | already validated
      v
ESC/POS bytes
      |
      v
Physical Printer
```

Hardware testing should then focus on device-specific behavior:

-   actual font appearance
-   actual paper width
-   print darkness
-   printer margins
-   cutting
-   QR readability
-   character encoding
-   printer-specific commands
-   speed
-   Windows spooler behavior

The physical printer should not be used to discover basic layout bugs
that could have been caught by automated tests.

------------------------------------------------------------------------

# 23. AI Agent Debugging Protocol

When a user reports:

> "The receipt is too long."

The agent must NOT immediately change CSS.

It should:

1.  run the same receipt through the virtual printer
2.  inspect line count
3.  inspect blank lines
4.  inspect section spacing
5.  inspect printer profile
6.  inspect wrapping
7.  identify the responsible layer
8.  add a regression test
9.  fix the layer
10. rerun the full test suite

When a user reports:

> "The total is shifted."

The agent should inspect:

``` text
available width
column widths
numeric alignment
font mode
line width
```

before changing unrelated styles.

------------------------------------------------------------------------

# 24. Recommended Debug Command

Add a development command such as:

``` text
cargo test thermal
```

and, if useful, a dedicated debug command:

``` text
npm run thermal:test
```

or:

``` text
npm run thermal:preview
```

The exact command should match the existing project tooling.

Example output:

``` text
RMS THERMAL TEST SUITE

58mm
✓ minimal
✓ long item
✓ 10 items
✓ 50 items
✓ large totals

80mm
✓ minimal
✓ long item
✓ 10 items
✓ 50 items
✓ large totals

INVARIANTS
✓ no width overflow
✓ totals preserved
✓ item order preserved
✓ no duplicate items
✓ no unexplained blank lines
✓ cut position valid

RESULT: 100% PASS
```

------------------------------------------------------------------------

# 25. Definition of Done

The virtual thermal-printing system is complete when:

-   [ ] virtual printer exists
-   [ ] TXT output exists
-   [ ] ESC/POS BIN output exists
-   [ ] printer profiles exist
-   [ ] 58mm tests exist
-   [ ] 80mm tests exist
-   [ ] golden snapshots exist
-   [ ] width overflow tests exist
-   [ ] wrapping tests exist
-   [ ] many-item tests exist
-   [ ] large-total tests exist
-   [ ] KOT tests exist
-   [ ] delivery tests exist
-   [ ] failure tests exist
-   [ ] no-hardware test workflow is documented
-   [ ] AI agent can reproduce layout bugs without a physical printer

## Final Principle

The development question should not be:

> "Can we print this correctly on my printer?"

It should first be:

> "Does our renderer generate a valid, deterministic thermal document
> for the selected printer profile?"

Once that is true, physical hardware becomes a final device-validation
step rather than the primary debugging tool.
