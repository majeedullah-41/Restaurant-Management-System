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
