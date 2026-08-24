//! Thermal layout engine (Phase 4). Pure functions only — no I/O, no Windows
//! APIs, fully unit-testable. Produces styled logical lines that both the
//! human-readable text output and the ESC/POS encoder consume, so there is
//! exactly ONE layout algorithm (doc 05 §3).

use super::model::{LineItem, ReceiptDocument, ReceiptKind, ThermalLayout};

/// Alignment carried alongside each logical line so the ESC/POS builder can
/// emit the matching command instead of relying on space padding.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TextAlign {
    Left,
    Center,
}

/// One logical printed line. `bold` maps to the ESC/POS emphasis command;
/// text snapshots simply ignore it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct StyledLine {
    pub text: String,
    pub align: TextAlign,
    pub bold: bool,
}

impl StyledLine {
    fn left(text: impl Into<String>) -> Self {
        Self { text: text.into(), align: TextAlign::Left, bold: false }
    }

    fn centered(text: impl Into<String>) -> Self {
        Self { text: text.into(), align: TextAlign::Center, bold: false }
    }

    fn centered_bold(text: impl Into<String>) -> Self {
        Self { text: text.into(), align: TextAlign::Center, bold: true }
    }
}

// ─── Primitive helpers ──────────────────────────────────────────────────────

/// Greedy word wrapping. Words longer than `width` are hard-split; no
/// character is ever silently lost (spec: "No Missing Content").
pub fn wrap_text(text: &str, width: usize) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut current = String::new();

    for word in text.split_whitespace() {
        let mut word = word;
        loop {
            let space_needed = if current.is_empty() { 0 } else { 1 };
            if word.chars().count() + space_needed + current.chars().count() <= width {
                if space_needed == 1 {
                    current.push(' ');
                }
                current.push_str(word);
                break;
            }
            // Word does not fit on the current line.
            if !current.is_empty() {
                out.push(std::mem::take(&mut current));
                continue; // retry on an empty line
            }
            // Single word longer than a full line: hard-split it.
            let take: usize = word
                .char_indices()
                .nth(width)
                .map(|(idx, _)| idx)
                .unwrap_or(word.len());
            out.push(word[..take].to_string());
            word = &word[take..];
            if word.is_empty() {
                break;
            }
        }
    }
    if !current.is_empty() {
        out.push(current);
    }
    if out.is_empty() {
        out.push(String::new());
    }
    out
}

/// Centers `text` within `width`, wrapping first when too long (the legacy
/// TypeScript builders truncated with `~`; the spec forbids character loss).
pub fn center_lines(text: &str, width: usize) -> Vec<String> {
    wrap_text(text, width)
        .into_iter()
        .map(|chunk| {
            if chunk.chars().count() >= width {
                return chunk;
            }
            let left = (width - chunk.chars().count()) / 2;
            format!("{}{}", " ".repeat(left), chunk)
        })
        .collect()
}

/// Left/right split (`label ..... value`). When the pair cannot fit, the label
/// wraps within the available space and the value keeps its own right-aligned
/// position — quantity/value columns never shift (spec Column Rules).
pub fn pad_between(left: &str, right: &str, width: usize) -> Vec<String> {
    let right_len = right.chars().count();
    let left_len = left.chars().count();
    if left_len + right_len < width {
        let spaces = width - left_len - right_len;
        return vec![format!("{}{}{}", left, " ".repeat(spaces), right)];
    }
    // Overflow: reserve room for the value on the final line.
    let usable = width.saturating_sub(right_len + 1);
    if usable >= 6 {
        let wrapped = wrap_text(left, usable);
        let last = wrapped.last().cloned().unwrap_or_default();
        let mut out = wrapped;
        out.last_mut().map(|l| {
            *l = format!("{}{}{}", l, " ".repeat(width - l.chars().count() - right_len), right)
        });
        let _ = last;
        return out;
    }
    // Not enough room beside the value: stack it, right-aligned.
    let mut out = wrap_text(left, width);
    out.push(format!("{}{}", " ".repeat(width.saturating_sub(right_len)), right));
    out
}

/// Port of the frontend `formatCurrency`: `-Rs.`/`Rs.` + `1,234.56`
/// (en-US grouping, two decimals, half-up rounding, sign on the symbol).
pub fn money(amount: f64) -> String {
    let negative = amount < 0.0;
    let cents = (amount.abs() * 100.0).round() as i64;
    let whole = cents / 100;
    let frac = cents % 100;

    let digits = whole.to_string();
    let mut grouped = String::with_capacity(digits.len() + digits.len() / 3);
    for (idx, ch) in digits.chars().enumerate() {
        if idx > 0 && (digits.len() - idx) % 3 == 0 {
            grouped.push(',');
        }
        grouped.push(ch);
    }

    format!(
        "{}Rs. {}.{:02}",
        if negative { "-" } else { "" },
        grouped,
        frac
    )
}

/// Splits the shared timestamp text into its date and time parts exactly like
/// the frontend builders (`data.date.split(" ")`).
pub fn split_date_time(date_time: &str) -> (String, String) {
    match date_time.split_once(' ') {
        Some((d, t)) => (d.to_string(), t.to_string()),
        None => (date_time.to_string(), String::new()),
    }
}

fn rule(width: usize) -> StyledLine {
    StyledLine::left("-".repeat(width))
}

fn pad_left(value: &str, width: usize) -> String {
    let len = value.chars().count();
    if len >= width {
        value.to_string()
    } else {
        format!("{}{}", " ".repeat(width - len), value)
    }
}

// ─── Item table (calculated columns — never hardcoded spaces) ────────────────

/// Minimum usable name-column width before the renderer switches to stacked
/// rows instead of squeezing quantity/value columns out of alignment.
const MIN_NAME_WIDTH: usize = 4;

/// Calculated column plan for the item table. Widths derive from the profile
/// capacity AND the actual data (a `Rs. 999,999,999.00` total needs more room
/// than the five characters of the word TOTAL).
struct ItemColumns {
    /// Fixed 3-char row-number prefix (`1. `, `10.`).
    prefix: usize,
    /// Right-aligned quantity column.
    qty: usize,
    /// Required width of the right-aligned total column (receipts only),
    /// sized to the longest rendered amount.
    total: Option<usize>,
}

impl ItemColumns {
    fn receipt(_width: usize, items: &[LineItem]) -> Self {
        let (prefix, qty) = (3usize, 3usize);
        let longest_amount = items
            .iter()
            .map(|i| money(i.price * i.quantity as f64).chars().count())
            .chain(std::iter::once("TOTAL".chars().count()))
            .max()
            .unwrap_or(5);
        Self { prefix, qty, total: Some(longest_amount) }
    }

    fn kot(_width: usize) -> Self {
        Self { prefix: 3, qty: 4, total: None }
    }
}

/// Renders one item row. The name wraps INSIDE its own column; continuation
/// lines never repeat quantity or price (master-spec Wrapping Rules).
/// When even the minimum name column would not fit beside the numeric tail,
/// the row stacks: full-width name lines first, then the right-aligned tail —
/// every emitted line always stays inside the printable width.
fn render_item_row(index: usize, item: &LineItem, cols: &ItemColumns, width: usize) -> Vec<StyledLine> {
    let prefix = format!("{:<width$}", format!("{}.", index + 1), width = cols.prefix);
    let qty = pad_left(&item.quantity.to_string(), cols.qty);
    let tail = match cols.total {
        Some(total_w) => format!("{}  {}", qty, pad_left(&money(item.price * item.quantity as f64), total_w)),
        None => qty,
    };

    let name_width = width.saturating_sub(cols.prefix + 1 + tail.chars().count());
    let chunks = wrap_text(&item.name, name_width.max(MIN_NAME_WIDTH));

    if name_width >= MIN_NAME_WIDTH {
        let mut out = Vec::with_capacity(chunks.len());
        for (row, chunk) in chunks.iter().enumerate() {
            let mut line = if row == 0 { prefix.clone() } else { " ".repeat(cols.prefix) };
            line.push_str(chunk);
            if row == 0 {
                line.push_str(&" ".repeat(name_width.saturating_sub(chunk.chars().count())));
                line.push(' ');
                line.push_str(&tail);
            }
            out.push(StyledLine::left(line));
        }
        return out;
    }

    // Stacked mode: names first, numeric tail alone and right-aligned last.
    let mut out: Vec<StyledLine> = chunks
        .into_iter()
        .enumerate()
        .map(|(row, chunk)| {
            let indent = " ".repeat(if row == 0 { cols.prefix } else { cols.prefix });
            StyledLine::left(format!("{}{}", indent, chunk))
        })
        .collect();
    let tail_len = tail.chars().count();
    out.push(StyledLine::left(format!("{}{}", " ".repeat(width.saturating_sub(tail_len)), tail)));
    out
}

fn render_item_header(cols: &ItemColumns, width: usize) -> StyledLine {
    let right = match cols.total {
        Some(total_w) => format!("{}  {}", pad_left("QTY", cols.qty), pad_left("TOTAL", total_w)),
        None => pad_left("QTY", cols.qty),
    };
    pad_between("# ITEM", &right, width)
        .into_iter()
        .map(StyledLine::left)
        .next()
        .unwrap_or_else(|| StyledLine::left(""))
}

// ─── Shared sections ────────────────────────────────────────────────────────

/// Restaurant identity block (name/address/contact), shown only when the
/// layout enables it. Long values wrap instead of clipping (doc 05 §8).
fn render_restaurant_block(doc: &ReceiptDocument, width: usize, out: &mut Vec<StyledLine>) {
    if !(doc.restaurant.name.is_empty()) {
        center_lines(&doc.restaurant.name.to_uppercase(), width)
            .into_iter()
            .for_each(|l| out.push(StyledLine { bold: true, ..StyledLine::centered(l) }));
    }
    if let Some(address) = &doc.restaurant.address {
        if !address.is_empty() {
            center_lines(&address.to_uppercase(), width)
                .into_iter()
                .for_each(|l| out.push(StyledLine::centered(l)));
        }
    }
    if let Some(contact) = &doc.restaurant.contact {
        if !contact.is_empty() {
            center_lines(contact, width)
                .into_iter()
                .for_each(|l| out.push(StyledLine::centered(l)));
        }
    }
}

/// DATE/TIME meta row honouring the individual visibility toggles.
fn render_date_time(layout: &ThermalLayout, meta: &super::model::OrderMeta, out: &mut Vec<StyledLine>, width: usize) {
    if !(layout.show_date || layout.show_time) {
        return;
    }
    let (date_part, time_part) = split_date_time(&meta.date_time);
    let label = [layout.show_date.then_some("DATE"), layout.show_time.then_some("TIME")]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join("/");
    let value = [layout.show_date.then_some(date_part), layout.show_time.then_some(time_part)]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ");
    pad_between(&label, &value, width)
        .into_iter()
        .for_each(|l| out.push(StyledLine::left(l)));
}

/// Totals/payment/footer tail shared by receipts and delivery receipts
/// (`delivery_fee` and the customer block are delivery-specific).
fn render_financials(
    doc: &ReceiptDocument,
    layout: &ThermalLayout,
    width: usize,
    out: &mut Vec<StyledLine>,
) {
    let totals = &doc.totals;
    out.push(rule(width));
    pad_between("SUBTOTAL", &money(totals.subtotal), width)
        .into_iter()
        .for_each(|l| out.push(StyledLine::left(l)));
    if layout.show_tax {
        pad_between(
            &format!("TAX ({})", format_rate(totals.tax_rate)),
            &money(totals.tax_amount),
            width,
        )
        .into_iter()
        .for_each(|l| out.push(StyledLine::left(l)));
    }
    if layout.show_discount && totals.discount > 0.0 {
        pad_between("DISCOUNT", &format!("-{}", money(totals.discount)), width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    if let Some(fee) = totals.delivery_fee {
        if fee > 0.0 {
            pad_between("DELIVERY FEE", &money(fee), width)
                .into_iter()
                .for_each(|l| out.push(StyledLine::left(l)));
        }
    }
    out.push(rule(width));
    pad_between("GRAND TOTAL", &money(totals.total_amount), width)
        .into_iter()
        .for_each(|l| out.push(StyledLine { bold: true, ..StyledLine::left(l) }));
    out.push(rule(width));
    if layout.show_cash_received {
        pad_between("CASH RECEIVED", &money(doc.payment.amount_received), width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    if layout.show_change {
        pad_between("CHANGE DUE", &money(doc.payment.change_amount), width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
}

/// Formats a tax rate like JavaScript template interpolation does
/// (`5` → `"5"`, `5.5` → `"5.5"`).
fn format_rate(rate: f64) -> String {
    if rate.fract() == 0.0 {
        format!("{}", rate as i64)
    } else {
        format!("{}", rate)
    }
}

/// Trailing branding/footer/end-marker block.
fn render_footer(out: &mut Vec<StyledLine>, layout: &ThermalLayout, width: usize, end_marker: &str, brand: bool) {
    out.push(rule(width));
    let footer = layout.footer_message.trim();
    if !footer.is_empty() {
        center_lines(&footer.to_uppercase(), width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::centered(l)));
    }
    if brand {
        center_lines("Software Provided by", width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::centered(l)));
        center_lines("Eaglenest Creations (0346-4451505)", width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::centered(l)));
    }
    if layout.show_end_marker {
        out.push(StyledLine::centered(end_marker));
        out.push(rule(width));
    }
}

// ─── Per-kind renderers ─────────────────────────────────────────────────────

fn render_receipt(doc: &ReceiptDocument, layout: &ThermalLayout, width: usize) -> Vec<StyledLine> {
    let mut out = Vec::new();

    if layout.show_logo {
        render_restaurant_block(doc, width, &mut out);
    }
    out.push(StyledLine::centered_bold(format!(
        "*** {} ***",
        layout.header_text.trim().to_uppercase()
    )));
    out.push(rule(width));

    if layout.show_order_no {
        pad_between("ORDER NO.", &doc.meta.order_id, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    render_date_time(layout, &doc.meta, &mut out, width);
    if layout.show_order_type {
        pad_between("TYPE", &doc.meta.order_type, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    if layout.show_table {
        pad_between("TABLE", &doc.meta.table_label, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    if layout.show_cashier {
        pad_between("CASHIER", &doc.meta.cashier_name, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    if layout.show_order_taker {
        if let Some(taker) = &doc.meta.order_taker_name {
            pad_between("ORDER TAKER", taker, width)
                .into_iter()
                .for_each(|l| out.push(StyledLine::left(l)));
        }
    }

    let cols = ItemColumns::receipt(width, &doc.items);
    out.push(render_item_header(&cols, width));
    out.push(rule(width));
    for (idx, item) in doc.items.iter().enumerate() {
        out.extend(render_item_row(idx, item, &cols, width));
    }

    render_financials(doc, layout, width, &mut out);
    render_footer(&mut out, layout, width, "*** END OF RECEIPT ***", true);
    out
}

fn render_kot(doc: &ReceiptDocument, layout: &ThermalLayout, width: usize) -> Vec<StyledLine> {
    let mut out = Vec::new();

    if layout.show_logo && !doc.restaurant.name.is_empty() {
        center_lines(&doc.restaurant.name.to_uppercase(), width)
            .into_iter()
            .for_each(|l| out.push(StyledLine { bold: true, ..StyledLine::centered(l) }));
    }
    out.push(StyledLine::centered_bold("KOT"));
    out.push(StyledLine::centered_bold("*** KITCHEN COPY ***"));
    out.push(rule(width));

    out.extend(
        pad_between("ORDER NO.", &doc.meta.order_id, width)
            .into_iter()
            .map(StyledLine::left),
    );
    render_date_time(layout, &doc.meta, &mut out, width);
    out.extend(
        pad_between("TYPE", &doc.meta.order_type, width)
            .into_iter()
            .map(StyledLine::left),
    );
    if layout.show_table && doc.meta.order_type == "Dine-in" {
        pad_between("TABLE", &doc.meta.table_label, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    if layout.show_cashier {
        pad_between("CASHIER", &doc.meta.cashier_name, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    if layout.show_order_taker {
        if let Some(taker) = &doc.meta.order_taker_name {
            pad_between("ORDER TAKER", taker, width)
                .into_iter()
                .for_each(|l| out.push(StyledLine::left(l)));
        }
    }

    let cols = ItemColumns::kot(width);
    out.push(render_item_header(&cols, width));
    out.push(rule(width));
    for (idx, item) in doc.items.iter().enumerate() {
        out.extend(render_item_row(idx, item, &cols, width));
    }

    render_footer(&mut out, layout, width, "*** END OF KOT ***", false);
    out
}

fn render_delivery(doc: &ReceiptDocument, layout: &ThermalLayout, width: usize) -> Vec<StyledLine> {
    let mut out = Vec::new();

    if layout.show_logo {
        render_restaurant_block(doc, width, &mut out);
    }
    out.push(StyledLine::centered_bold(format!(
        "*** {} ***",
        layout.header_text.trim().to_uppercase()
    )));
    out.push(rule(width));

    if layout.show_order_no {
        pad_between("ORDER NO.", &doc.meta.order_id, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    render_date_time(layout, &doc.meta, &mut out, width);
    if layout.show_order_type {
        pad_between("TYPE", &doc.meta.order_type, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }
    if layout.show_cashier {
        pad_between("CASHIER", &doc.meta.cashier_name, width)
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
    }

    let cols = ItemColumns::receipt(width, &doc.items);
    out.push(render_item_header(&cols, width));
    out.push(rule(width));
    for (idx, item) in doc.items.iter().enumerate() {
        out.extend(render_item_row(idx, item, &cols, width));
    }

    render_financials(doc, layout, width, &mut out);

    if layout.show_customer_details {
        let customer = doc.customer.clone().unwrap_or_default();
        out.push(rule(width));
        out.push(StyledLine::left("CUSTOMER DETAILS:"));
        // Values wrap inside the printable width — no silent clipping.
        for l in wrap_text(
            &format!(
                "NAME: {}",
                customer.name.filter(|n| !n.is_empty()).unwrap_or_else(|| "WALK-IN".into())
            ),
            width,
        ) {
            out.push(StyledLine::left(l));
        }
        for l in wrap_text(
            &format!(
                "PHONE: {}",
                customer.phone.filter(|p| !p.is_empty()).unwrap_or_else(|| "N/A".into())
            ),
            width,
        ) {
            out.push(StyledLine::left(l));
        }
        if layout.show_delivery_address {
            out.push(StyledLine::left("ADDRESS:"));
            wrap_text(
                customer
                    .address
                    .filter(|a| !a.is_empty())
                    .unwrap_or_else(|| "NO ADDRESS PROVIDED".into())
                    .as_str(),
                width,
            )
            .into_iter()
            .for_each(|l| out.push(StyledLine::left(l)));
        }
    }

    render_footer(&mut out, layout, width, "*** END OF DELIVERY RECEIPT ***", true);
    out
}

// ─── Public entry points ────────────────────────────────────────────────────

/// Renders the logical document into styled lines constrained to `columns`.
pub fn render_document(doc: &ReceiptDocument, columns: usize, layout: &ThermalLayout) -> Vec<StyledLine> {
    match doc.kind {
        ReceiptKind::Receipt => render_receipt(doc, layout, columns),
        ReceiptKind::Kot => render_kot(doc, layout, columns),
        ReceiptKind::DeliveryReceipt => render_delivery(doc, layout, columns),
    }
}

/// Human-readable plain-text view (snapshots, debug artifacts, simulator UI).
/// Applies alignment to `columns`; identical geometry to the ESC/POS output.
pub fn plain_text(lines: &[StyledLine], columns: usize) -> String {
    let mut out = String::new();
    for line in lines {
        match line.align {
            TextAlign::Left => out.push_str(&line.text),
            TextAlign::Center => {
                let len = line.text.chars().count();
                if len >= columns || len == 0 {
                    out.push_str(&line.text);
                } else {
                    let left = (columns - len) / 2;
                    out.push_str(&" ".repeat(left));
                    out.push_str(&line.text);
                }
            }
        }
        out.push('\n');
    }
    out
}

/// Document height = rendered lines + configured cut margin. Never pads with
/// artificial blank space (master spec: Vertical Layout).
pub fn calculate_document_height(line_count: usize, cut_margin_lines: usize) -> usize {
    line_count + cut_margin_lines
}
