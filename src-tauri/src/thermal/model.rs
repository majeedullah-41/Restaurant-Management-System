//! Shared logical receipt model (Phase 2) and printer profiles (Phase 3).
//!
//! The frontend serializes a `ReceiptDocument` as JSON; both the thermal
//! renderer and (conceptually) the HTML renderer consume the same logical
//! document, so React JSX is never the only source of truth.

use serde::Deserialize;

/// Which ticket is being rendered. Drives section selection and headings.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReceiptKind {
    Receipt,
    Kot,
    DeliveryReceipt,
}

/// Restaurant identity block printed at the top of a ticket.
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
pub struct RestaurantInfo {
    pub name: String,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub contact: Option<String>,
}

/// Order metadata lines (order no / date / type / table / cashier).
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
pub struct OrderMeta {
    #[serde(default)]
    pub order_id: String,
    /// Full timestamp text exactly as the frontend shows it; the renderer
    /// splits it on the first space into DATE and TIME parts.
    #[serde(default)]
    pub date_time: String,
    #[serde(default)]
    pub order_type: String,
    #[serde(default)]
    pub table_label: String,
    #[serde(default)]
    pub cashier_name: String,
    #[serde(default)]
    pub order_taker_name: Option<String>,
}

/// Optional customer block (used by delivery receipts).
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
pub struct CustomerInfo {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
}

/// A single order line. `price` is ignored by the KOT renderer.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct LineItem {
    pub name: String,
    #[serde(default)]
    pub price: f64,
    #[serde(default)]
    pub quantity: u32,
}

/// Financial summary of the order.
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
pub struct Totals {
    #[serde(default)]
    pub subtotal: f64,
    #[serde(default)]
    pub tax_rate: f64,
    #[serde(default)]
    pub tax_amount: f64,
    #[serde(default)]
    pub discount: f64,
    /// Delivery receipts only; hidden when absent or zero.
    #[serde(default)]
    pub delivery_fee: Option<f64>,
    #[serde(default)]
    pub total_amount: f64,
}

/// Payment lines (cash received / change due).
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
pub struct PaymentInfo {
    #[serde(default)]
    pub amount_received: f64,
    #[serde(default)]
    pub change_amount: f64,
}

/// The complete logical ticket. `Order Data + Layout = Receipt Document`.
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct ReceiptDocument {
    pub kind: ReceiptKind,
    pub restaurant: RestaurantInfo,
    #[serde(default)]
    pub meta: OrderMeta,
    #[serde(default)]
    pub customer: Option<CustomerInfo>,
    #[serde(default = "Vec::new")]
    pub items: Vec<LineItem>,
    #[serde(default)]
    pub totals: Totals,
    #[serde(default)]
    pub payment: PaymentInfo,
}

// ─── Printer profile (Phase 3) ──────────────────────────────────────────────

/// Font mode advertised by most ESC/POS printers. Capacities differ per mode,
/// so the profile keeps the character capacity explicit and configurable.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FontMode {
    FontA,
    FontB,
}

/// Hardware capabilities of one physical/virtual thermal printer. Never assume
/// every printer matches a global default: capacity depends on font mode,
/// driver and hardware, so every field is configurable.
#[derive(Clone, Debug, PartialEq)]
pub struct PrinterProfile {
    pub paper_width_mm: u32,
    pub characters_per_line: u32,
    pub font_mode: FontMode,
    /// Percentage scale assumed when the layout does not override it.
    pub default_font_scale: u32,
    pub supports_cut: bool,
    pub supports_qr: bool,
    pub supports_image: bool,
}

impl PrinterProfile {
    /// Starting profile for 58mm printers. `characters_per_line` stays
    /// configurable — 32 is only the common default for Font A.
    pub fn thermal_58mm(characters_per_line: u32) -> Self {
        Self {
            paper_width_mm: 58,
            characters_per_line,
            font_mode: FontMode::FontA,
            default_font_scale: 100,
            supports_cut: true,
            supports_qr: false,
            supports_image: false,
        }
    }

    /// Starting profile for 80mm printers (`48` being the common Font A
    /// capacity). The 80mm renderer computes its own column widths from this
    /// value; nothing is scaled from 58mm output.
    pub fn thermal_80mm(characters_per_line: u32) -> Self {
        Self {
            paper_width_mm: 80,
            characters_per_line,
            font_mode: FontMode::FontA,
            default_font_scale: 100,
            supports_cut: true,
            supports_qr: false,
            supports_image: false,
        }
    }

    /// Character capacity after applying a font-scale percentage. Bigger font
    /// ⇒ fewer columns. Mirrors the frontend's `charsForLine` clamp behaviour
    /// but is bounded by the hardware profile rather than a global constant.
    pub fn effective_columns(&self, font_scale_percent: u32) -> usize {
        let scale = font_scale_percent.clamp(40, 200);
        let scaled =
            (self.characters_per_line as f64 * 100.0 / scale as f64).round();
        scaled.max(8.0).min(self.characters_per_line as f64) as usize
    }
}

/// Maps the paper width designed in Settings to a starting printer profile.
/// Capacities stay configurable constants here — never scattered globals
/// (spec Rule 5). 58mm ⇒ Font A ≈ 32 columns; anything larger (80mm) ⇒ 48.
pub fn profile_for_paper(paper_width_mm: u32) -> PrinterProfile {
    if paper_width_mm <= 62 {
        PrinterProfile::thermal_58mm(32)
    } else {
        PrinterProfile::thermal_80mm(48)
    }
}

// ─── Layout configuration adapter (Phase 8) ─────────────────────────────────

/// Thermal view of the per-ticket layout JSON saved by the React designer.
/// Mirrors the fields the renderers consume; unknown JSON keys are ignored and
/// invalid values fall back to the documented defaults, so a corrupted layout
/// blob can never break checkout printing.
#[derive(Clone, Debug, PartialEq)]
pub struct ThermalLayout {
    pub width_mm: u32,
    pub font_scale: u32,
    pub show_logo: bool,
    pub show_date: bool,
    pub show_time: bool,
    pub show_table: bool,
    pub show_cashier: bool,
    pub footer_message: String,
    pub show_end_marker: bool,

    // Receipt / delivery-receipt extras.
    pub header_text: String,
    pub show_order_no: bool,
    pub show_order_type: bool,
    pub show_tax: bool,
    pub show_discount: bool,
    pub show_cash_received: bool,
    pub show_change: bool,

    // KOT extra.
    pub show_order_taker: bool,

    // Delivery-receipt extras.
    pub show_customer_details: bool,
    pub show_delivery_address: bool,

    /// Manual column calibration (docs 05 §6/§7 — capacity is configurable).
    /// `None` = automatic from the printer profile (80mm ⇒ 48, 58mm ⇒ 32).
    /// Some engines print fewer than the standard 48 columns on 80mm paper
    /// (512-dot heads fit only 42), clipping right-aligned text; this lets
    /// the user calibrate until lines match the physical printable width.
    pub chars_per_line_override: Option<u32>,
}

impl Default for ThermalLayout {
    fn default() -> Self {
        // Defaults mirror DEFAULT_RECEIPT_LAYOUT in printing.ts.
        Self {
            width_mm: 80,
            font_scale: 100,
            show_logo: true,
            show_date: true,
            show_time: true,
            show_table: true,
            show_cashier: true,
            footer_message: String::new(),
            show_end_marker: true,
            header_text: "PAYMENT RECEIPT".into(),
            show_order_no: true,
            show_order_type: true,
            show_tax: true,
            show_discount: true,
            show_cash_received: true,
            show_change: true,
            show_order_taker: true,
            show_customer_details: true,
            show_delivery_address: true,
            chars_per_line_override: None,
        }
    }
}

fn bool_field(value: &serde_json::Value, key: &str, fallback: bool) -> bool {
    value.get(key).and_then(|v| v.as_bool()).unwrap_or(fallback)
}

fn str_field(value: &serde_json::Value, key: &str, fallback: &str) -> String {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| fallback.to_string())
}

impl ThermalLayout {
    /// Parses the stored layout JSON (`*_layout` column) for a ticket kind.
    /// Missing/invalid fields fall back to the defaults used by the designer.
    pub fn from_json(kind: ReceiptKind, raw: &str) -> Self {
        let mut layout = match kind {
            ReceiptKind::Receipt => Self::default(),
            ReceiptKind::Kot => Self {
                // DEFAULT_KOT_LAYOUT
                show_logo: false,
                footer_message: String::new(),
                header_text: "KOT".into(),
                ..Self::default()
            },
            ReceiptKind::DeliveryReceipt => Self {
                // DEFAULT_DR_LAYOUT
                show_table: false,
                footer_message: "Thank you for your order!".into(),
                header_text: "DELIVERY RECEIPT".into(),
                ..Self::default()
            },
        };

        let parsed: Result<serde_json::Value, _> = serde_json::from_str(raw);
        if let Ok(value) = parsed {
            if let Some(n) = value.get("widthMm").and_then(|v| v.as_f64()) {
                layout.width_mm = n.clamp(42.0, 112.0).round() as u32;
            }
            if let Some(n) = value.get("fontScale").and_then(|v| v.as_f64()) {
                layout.font_scale = n.clamp(50.0, 200.0).round() as u32;
            }
            layout.show_logo = bool_field(&value, "showLogo", layout.show_logo);
            layout.show_date = bool_field(&value, "showDate", layout.show_date);
            layout.show_time = bool_field(&value, "showTime", layout.show_time);
            layout.show_table = bool_field(&value, "showTable", layout.show_table);
            layout.show_cashier = bool_field(&value, "showCashier", layout.show_cashier);
            layout.footer_message =
                str_field(&value, "footerMessage", &layout.footer_message);
            layout.show_end_marker =
                bool_field(&value, "showEndMarker", layout.show_end_marker);
            layout.header_text = str_field(&value, "headerText", &layout.header_text);
            layout.show_order_no = bool_field(&value, "showOrderNo", layout.show_order_no);
            layout.show_order_type =
                bool_field(&value, "showOrderType", layout.show_order_type);
            layout.show_tax = bool_field(&value, "showTax", layout.show_tax);
            layout.show_discount = bool_field(&value, "showDiscount", layout.show_discount);
            layout.show_cash_received =
                bool_field(&value, "showCashReceived", layout.show_cash_received);
            layout.show_change = bool_field(&value, "showChange", layout.show_change);
            layout.show_order_taker =
                bool_field(&value, "showOrderTaker", layout.show_order_taker);
            layout.show_customer_details =
                bool_field(&value, "showCustomerDetails", layout.show_customer_details);
            layout.show_delivery_address =
                bool_field(&value, "showDeliveryAddress", layout.show_delivery_address);
            // 0 / missing = auto (profile capacity). Otherwise clamp to a sane
            // calibration range; anything the head can't render is the user's
            // visual call, so we only guard against nonsense values.
            layout.chars_per_line_override = match value.get("charsPerLine") {
                Some(v) => match v.as_f64() {
                    Some(n) if n >= 16.0 && n <= 72.0 => Some(n.round() as u32),
                    _ => None,
                },
                None => None,
            };
        }

        layout
    }
}
