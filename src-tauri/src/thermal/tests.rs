//! Thermal test suite (Phase 7 + doc 05): unit tests for the pure layout
//! engine, ESC/POS byte-order tests, width invariants, virtual-printer
//! integration, and golden snapshot tests over fixed sample datasets.
//!
//! Golden files live in `<crate>/tests/golden/**`. They are generated once
//! with `cargo test --test-threads=1 generate_golden -- --ignored` and then
//! reviewed by hand; the comparison tests fail on any unexpected change.

use super::escpos::{self, commands, EscPosBuilder};
use super::layout::{
    calculate_document_height, center_lines, money, pad_between, plain_text, render_document,
    wrap_text,
};
use super::model::{
    CustomerInfo, LineItem, OrderMeta, PaymentInfo, PrinterProfile, ReceiptDocument, ReceiptKind,
    RestaurantInfo, ThermalLayout, Totals,
};
use super::printer::{PrintJob, ThermalPrinter, VirtualThermalPrinter};
use super::renderer::render_ticket;

// ─── Golden fixtures (doc 05 §9) ────────────────────────────────────────────

fn base_restaurant() -> RestaurantInfo {
    RestaurantInfo {
        name: "MY RESTAURANT".into(),
        address: Some("Main Road, Swat".into()),
        contact: Some("0345-1234567".into()),
    }
}

fn meta(order_id: &str, order_type: &str, table: &str) -> OrderMeta {
    OrderMeta {
        order_id: order_id.into(),
        date_time: "2026-08-22 14:33:10".into(),
        order_type: order_type.into(),
        table_label: table.into(),
        cashier_name: "Salman".into(),
        order_taker_name: None,
    }
}

fn item(name: &str, price: f64, quantity: u32) -> LineItem {
    LineItem { name: name.into(), price, quantity }
}

/// SAMPLE_01_MINIMAL — 1 item, no discount/tax, cash payment.
fn sample_minimal() -> ReceiptDocument {
    ReceiptDocument {
        kind: ReceiptKind::Receipt,
        restaurant: base_restaurant(),
        meta: meta("1024", "Dine-in", "T4"),
        customer: None,
        items: vec![item("Burger", 450.0, 1)],
        totals: Totals {
            subtotal: 450.0,
            tax_rate: 0.0,
            tax_amount: 0.0,
            discount: 0.0,
            delivery_fee: None,
            total_amount: 450.0,
        },
        payment: PaymentInfo { amount_received: 500.0, change_amount: 50.0 },
    }
}

/// SAMPLE_02_LONG_ITEM — wrapping policy under pressure.
fn sample_long_item() -> ReceiptDocument {
    let mut doc = sample_minimal();
    doc.meta.order_id = "1025".into();
    doc.items = vec![item(
        "Chicken Cheese Zinger Burger With Extra Cheese And Special Sauce",
        900.0,
        2,
    )];
    doc.totals = Totals {
        subtotal: 1800.0,
        tax_rate: 5.0,
        tax_amount: 90.0,
        discount: 100.0,
        delivery_fee: None,
        total_amount: 1790.0,
    };
    doc
}

/// SAMPLE_03_MANY_ITEMS — exactly 10 items (row-number prefix overflow guard).
fn sample_many_items() -> ReceiptDocument {
    let mut doc = sample_minimal();
    doc.meta.order_id = "1026".into();
    doc.items = (1..=10)
        .map(|i| item(&format!("Dish Number {i}"), 100.0 * i as f64, i))
        .collect();
    let subtotal: f64 = doc.items.iter().map(|i| i.price * i.quantity as f64).sum();
    doc.totals.subtotal = subtotal;
    doc.totals.total_amount = subtotal;
    doc.payment = PaymentInfo { amount_received: 5000.0, change_amount: 5000.0 - subtotal };
    doc
}

/// SAMPLE_04_VERY_LONG_ORDER — 50 items, receipt must remain continuous.
fn sample_very_long_order() -> ReceiptDocument {
    let mut doc = sample_minimal();
    doc.meta.order_id = "1027".into();
    doc.items = (1..=50)
        .map(|i| item(&format!("Party Platter Item {i:02}"), 50.0, 1))
        .collect();
    doc.totals.subtotal = 2500.0;
    doc.totals.total_amount = 2500.0;
    doc.payment = PaymentInfo { amount_received: 3000.0, change_amount: 500.0 };
    doc
}

/// SAMPLE_05_LONG_RESTAURANT_INFO — centered/wrapped header fields.
fn sample_long_restaurant_info() -> ReceiptDocument {
    let mut doc = sample_minimal();
    doc.restaurant = RestaurantInfo {
        name: "THE VERY LONG RESTAURANT NAME THAT DEFINITELY SHOULD WRAP".into(),
        address: Some("House 123, Street 456, Main Road, District Swat, Khyber Pakhtunkhwa".into()),
        contact: Some("+92 345 1234567 (Manager)".into()),
    };
    doc
}

/// SAMPLE_07_LARGE_TOTAL — values must stay inside the printable width.
fn sample_large_total() -> ReceiptDocument {
    let mut doc = sample_minimal();
    doc.items = vec![item("Gold Plated Biryani", 999999999.0, 1)];
    doc.totals = Totals {
        subtotal: 999999999.0,
        tax_rate: 5.0,
        tax_amount: 49999999.95,
        discount: 999999999.0,
        delivery_fee: None,
        total_amount: 999999999.0,
    };
    doc.payment = PaymentInfo { amount_received: 9999999999.9, change_amount: 8999999999.9 };
    doc
}

/// SAMPLE_08_SPECIAL_CHARACTERS — typographic punctuation + Urdu text.
fn sample_special_characters() -> ReceiptDocument {
    let mut doc = sample_minimal();
    doc.items = vec![
        item("Burger “special” - extra", 450.0, 1),
        item("برگر", 450.0, 1),
    ];
    doc.totals.total_amount = 900.0;
    doc.totals.subtotal = 900.0;
    doc
}

/// SAMPLE_06_ZERO_VALUES — optional rows follow visibility rules.
fn sample_zero_values() -> ReceiptDocument {
    let mut doc = sample_minimal();
    doc.totals.discount = 0.0;
    doc.totals.tax_amount = 0.0;
    doc.payment.change_amount = 0.0;
    doc
}

fn sample_kot() -> ReceiptDocument {
    let mut doc = sample_long_item();
    doc.kind = ReceiptKind::Kot;
    doc.restaurant.contact = None;
    doc.restaurant.address = None;
    doc.meta.order_taker_name = Some("Waiter Ali".into());
    doc.items = vec![
        LineItem { name: "Chicken Cheese Zinger Burger With Extra Cheese".into(), price: 0.0, quantity: 2 },
        LineItem { name: "Extra Mayo".into(), price: 0.0, quantity: 1 },
    ];
    doc
}

fn sample_delivery(evil: bool) -> ReceiptDocument {
    let mut doc = sample_long_item();
    doc.kind = ReceiptKind::DeliveryReceipt;
    doc.meta.order_type = "Delivery".into();
    doc.meta.table_label = String::new();
    doc.totals.delivery_fee = Some(150.0);
    doc.customer = Some(if evil {
        CustomerInfo {
            name: Some("A Very Long Customer Name That Should Also Wrap Correctly".into()),
            phone: Some("+92 300 0000000 / +92 301 1111111".into()),
            address: Some(
                "House 123, Street 456, Main Road, Somewhere, District Swat, Khyber Pakhtunkhwa"
                    .into(),
            ),
        }
    } else {
        CustomerInfo {
            name: Some("John Doe".into()),
            phone: Some("0345-1234567".into()),
            address: Some("Street 12, City".into()),
        }
    });
    doc
}

fn default_layout(kind: ReceiptKind) -> ThermalLayout {
    ThermalLayout::from_json(kind, "{}")
}

fn profiles() -> Vec<(&'static str, PrinterProfile)> {
    vec![
        ("58mm", PrinterProfile::thermal_58mm(32)),
        ("80mm", PrinterProfile::thermal_80mm(48)),
    ]
}

// ─── Unit tests: primitives ─────────────────────────────────────────────────

#[test]
fn money_matches_frontend_format() {
    assert_eq!(money(0.0), "Rs. 0.00");
    assert_eq!(money(450.0), "Rs. 450.00");
    assert_eq!(money(1234.5), "Rs. 1,234.50");
    assert_eq!(money(1234567.89), "Rs. 1,234,567.89");
    assert_eq!(money(999999999.0), "Rs. 999,999,999.00");
    assert_eq!(money(-12.5), "-Rs. 12.50");
}

#[test]
fn wrap_text_never_overflows_and_keeps_words() {
    let wrapped = wrap_text("Chicken Cheese Zinger Burger With Extra Cheese And Special Sauce", 16);
    assert!(wrapped.iter().all(|l| l.chars().count() <= 16));
    // No character silently lost.
    let rejoined = wrapped.join(" ");
    assert_eq!(rejoined.split_whitespace().count(), 10);
}

#[test]
fn wrap_text_hard_splits_unbreakable_words() {
    let wrapped = wrap_text("AAAAAAAAAAAAAAAAAAAA", 8);
    assert_eq!(wrapped, vec!["AAAAAAAA", "AAAAAAAA", "AAAA"]);
}

#[test]
fn center_lines_wraps_instead_of_truncating() {
    let lines = center_lines("TOO LONG TO FIT ON ONE LINE", 12);
    assert_eq!(lines.len(), 3);
    assert!(lines.iter().all(|l| l.chars().count() <= 12));
    // Centered: leading spaces are balanced floor((width-len)/2).
    assert_eq!(center_lines("HI", 6)[0], "  HI");
}

#[test]
fn pad_between_wraps_label_but_value_stays_right_aligned() {
    let lines = pad_between("VERY LONG LABEL INDEED", "123", 16);
    let last = lines.last().expect("non-empty");
    // The value keeps its right-aligned slot on the final line.
    assert!(last.ends_with("123"));
    assert!(last.chars().count() <= 16);
    assert_eq!(pad_between("A", "B", 3), vec!["A B"]);
}

#[test]
fn effective_columns_scale_and_clamp() {
    let p80 = PrinterProfile::thermal_80mm(48);
    assert_eq!(p80.effective_columns(100), 48);
    assert_eq!(p80.effective_columns(200), 24);
    // Scale below 40% clamps — capacity can never exceed the hardware value.
    assert_eq!(p80.effective_columns(10), 48);
    let p58 = PrinterProfile::thermal_58mm(32);
    assert_eq!(p58.effective_columns(200), 16);
    assert_eq!(p58.effective_columns(200), 16);
}

#[test]
fn layout_json_defaults_and_invalid_fallback() {
    let dr = default_layout(ReceiptKind::DeliveryReceipt);
    assert_eq!(dr.header_text, "DELIVERY RECEIPT");
    assert!(!dr.show_table);
    assert_eq!(dr.footer_message, "Thank you for your order!");

    let kot = default_layout(ReceiptKind::Kot);
    assert!(!kot.show_logo);
    assert!(kot.show_order_taker);

    // Corrupted JSON must fall back to defaults, not break printing.
    let broken = ThermalLayout::from_json(ReceiptKind::Receipt, "not json at all");
    assert_eq!(broken, ThermalLayout::default());

    // Valid JSON overrides individual fields and clamps ranges.
    let custom = ThermalLayout::from_json(
        ReceiptKind::Receipt,
        r#"{"widthMm": 999, "fontScale": 5, "showTax": false}"#,
    );
    assert_eq!(custom.width_mm, 112);
    assert_eq!(custom.font_scale, 50);
    assert!(!custom.show_tax);
}

#[test]
fn chars_per_line_override_is_parsed_clamped_and_applied() {
    // Missing / zero / out-of-range ⇒ auto (profile capacity).
    for raw in ["{}", r#"{"charsPerLine": 0}"#, r#"{"charsPerLine": 5}"#, r#"{"charsPerLine": 500}"#] {
        let layout = ThermalLayout::from_json(ReceiptKind::Receipt, raw);
        assert_eq!(layout.chars_per_line_override, None, "raw={raw}");
    }

    // Valid values survive clamped range checks.
    let layout = ThermalLayout::from_json(ReceiptKind::Receipt, r#"{"charsPerLine": 42}"#);
    assert_eq!(layout.chars_per_line_override, Some(42));

    // Renderer uses the override instead of the profile capacity: every line
    // must fit the calibrated width even though the profile allows 48.
    let profile = PrinterProfile::thermal_80mm(48);
    let ticket =
        render_ticket(&sample_many_items(), &profile, &layout).expect("renders");
    assert!(ticket.text.lines().all(|l| l.chars().count() <= 42));

    // Auto path still targets the profile capacity.
    let auto = render_ticket(&sample_many_items(), &profile, &default_layout(ReceiptKind::Receipt))
        .expect("renders");
    assert!(auto
        .text
        .lines()
        .any(|l| l.chars().count() > 42 && l.chars().count() <= 48));
}

#[test]
fn document_height_is_lines_plus_cut_margin_only() {
    assert_eq!(calculate_document_height(38, 3), 41);
    assert_eq!(calculate_document_height(38, 0), 38);
}

// ─── Width invariants (doc 05 §18) ──────────────────────────────────────────

fn all_sample_docs() -> Vec<(&'static str, ReceiptDocument)> {
    vec![
        ("minimal", sample_minimal()),
        ("long_item", sample_long_item()),
        ("many_items", sample_many_items()),
        ("very_long_order", sample_very_long_order()),
        ("long_restaurant", sample_long_restaurant_info()),
        ("zero_values", sample_zero_values()),
        ("large_total", sample_large_total()),
        ("special_chars", sample_special_characters()),
        ("kot", sample_kot()),
        ("delivery", sample_delivery(false)),
        ("delivery_evil", sample_delivery(true)),
    ]
}

#[test]
fn no_line_ever_exceeds_the_printable_width() {
    for (doc_name, doc) in all_sample_docs() {
        for (profile_name, profile) in profiles() {
            let columns = profile.effective_columns(default_layout(doc.kind).font_scale);
            let lines = render_document(&doc, columns, &default_layout(doc.kind));
            for line in &lines {
                assert!(
                    line.text.chars().count() <= columns,
                    "WIDTH OVERFLOW\nprofile: {profile_name} ({columns} cols)\ndoc: {doc_name}\nline ({}): {:?}",
                    line.text.chars().count(),
                    line.text
                );
            }
            let text = plain_text(&lines, columns);
            for line in text.lines() {
                assert!(
                    line.chars().count() <= columns,
                    "TEXT-VIEW OVERFLOW\nprofile: {profile_name}\nline: {line:?}"
                );
            }
        }
    }
}

// ─── Item/order/total preservation invariants ───────────────────────────────

#[test]
fn items_are_preserved_in_order_without_duplication() {
    for (_, doc) in all_sample_docs() {
        for (_, profile) in profiles() {
            let layout = default_layout(doc.kind);
            let columns = profile.effective_columns(layout.font_scale);
            let text = plain_text(&render_document(&doc, columns, &layout), columns);

            // Every input item renders exactly one numbered row, in order.
            let mut cursor = 0usize;
            for (idx, item) in doc.items.iter().enumerate() {
                let n = idx + 1;
                // Row prefixes are line-start `{n}. ` (padded to 3 chars).
                let needle = if n < 10 { format!("\n{}. ", n) } else { format!("\n{}.", n) };
                let pos = text[cursor..]
                    .find(&needle)
                    .map(|p| cursor + p)
                    .unwrap_or_else(|| panic!("missing row {} for item {:?}", n, item.name));
                let first_word = item.name.split_whitespace().next().unwrap_or_default();
                if !first_word.is_empty() {
                    assert!(
                        text[pos..].contains(first_word),
                        "row {} lacks its item text ({first_word:?})",
                        n
                    );
                }
                cursor = pos + 1; // keep later searches after this row start
            }
            // No extra numbered rows exist (no duplication).
            let numbered = text
                .lines()
                .filter(|l| {
                    let t = l.trim_start();
                    let digits: String = t.chars().take_while(|c| c.is_ascii_digit()).collect();
                    !digits.is_empty() && t[digits.len()..].starts_with('.')
                })
                .count();
            assert_eq!(numbered, doc.items.len(), "item count drift @{}mm", profile.paper_width_mm);
            // Grand total preserved (KOT intentionally prints no financials).
            if doc.kind != ReceiptKind::Kot {
                assert!(text.contains(&money(doc.totals.total_amount)));
            }
        }
    }
}

#[test]
fn ten_plus_items_keep_row_prefix_inside_width() {
    let doc = sample_many_items();
    let profile = PrinterProfile::thermal_58mm(32); // tightest case
    let layout = default_layout(doc.kind);
    let columns = profile.effective_columns(layout.font_scale);
    let text = plain_text(&render_document(&doc, columns, &layout), columns);
    assert!(text.contains("10."), "row number 10 must still print");
    for line in text.lines() {
        assert!(line.chars().count() <= columns);
    }
}

#[test]
fn disabled_sections_leave_no_unexplained_blank_runs() {
    let mut layout = default_layout(ReceiptKind::Receipt);
    layout.show_logo = false;
    layout.footer_message = String::new();
    layout.show_end_marker = false;
    layout.show_cash_received = false;
    layout.show_change = false;

    let doc = sample_minimal();
    let lines = render_document(&doc, 48, &layout);
    let blanks = lines.iter().filter(|l| l.text.is_empty()).count();
    assert_eq!(blanks, 0, "no blank lines expected, found {blanks}");
    // Content starts immediately (no leading gap where the logo was skipped).
    assert!(!lines[0].text.trim().is_empty());
    assert!(lines.iter().any(|l| l.text.contains("GRAND TOTAL")));
}

// ─── ESC/POS byte-order tests (doc 05 §13) ──────────────────────────────────

#[test]
fn escpos_stream_has_correct_command_order() {
    let doc = sample_minimal();
    let profile = PrinterProfile::thermal_80mm(48);
    let ticket = render_ticket(&doc, &profile, &default_layout(doc.kind)).expect("renders");

    let decoded = escpos::decode(&ticket.bytes);
    assert_eq!(decoded.first().map(String::as_str), Some("[INIT]"));
    assert_eq!(decoded.last().map(String::as_str), Some("[CUT]"));

    // Bold toggles exist and come in pairs.
    let bold_on = decoded.iter().filter(|c| c.as_str() == "[BOLD ON]").count();
    let bold_off = decoded.iter().filter(|c| c.as_str() == "[BOLD OFF]").count();
    assert!(bold_on > 0);
    assert_eq!(bold_on, bold_off);

    // Alignment switches to CENTER before the title line appears.
    let title_pos = decoded
        .iter()
        .position(|c| c.contains("*** PAYMENT RECEIPT ***"))
        .expect("title present");
    let last_center_before_title = decoded[..title_pos]
        .iter()
        .rposition(|c| c == "[ALIGN CENTER]")
        .expect("center alignment before title");
    assert!(decoded[last_center_before_title..title_pos].iter().all(|c| c != "[ALIGN LEFT]"));

    // Raw bytes really start with ESC @ and end with the cut command.
    assert_eq!(&ticket.bytes[0..2], commands::INIT);
    assert_eq!(&ticket.bytes[ticket.bytes.len() - commands::CUT.len()..], commands::CUT);
}

#[test]
fn escpos_omits_cut_when_profile_lacks_support() {
    let doc = sample_minimal();
    let mut profile = PrinterProfile::thermal_80mm(48);
    profile.supports_cut = false;
    let ticket = render_ticket(&doc, &profile, &default_layout(doc.kind)).expect("renders");
    assert!(!ticket.bytes.ends_with(commands::CUT));
}

#[test]
fn receipt_renders_order_taker_only_when_present() {
    let profile = PrinterProfile::thermal_80mm(48);

    let mut doc = sample_minimal();
    doc.meta.order_taker_name = Some("Waiter Ali".into());
    let with_taker = render_ticket(&doc, &profile, &default_layout(doc.kind)).expect("renders");
    assert!(with_taker.text.contains("ORDER TAKER"), "line missing:\n{}", with_taker.text);
    assert!(with_taker.text.contains("Waiter Ali"));
    for line in with_taker.text.lines() {
        assert!(line.chars().count() <= profile.characters_per_line as usize, "overflow: {line:?}");
    }

    let without_taker = render_ticket(&sample_minimal(), &profile, &default_layout(ReceiptKind::Receipt))
        .expect("renders");
    assert!(
        !without_taker.text.contains("ORDER TAKER"),
        "taker line must be absent when name is None:\n{}",
        without_taker.text
    );
}

#[test]
fn escpos_encoding_is_deterministic_ascii_safe() {
    // Typographic characters map to ASCII equivalents…
    assert_eq!(escpos::encode("\u{201C}x\u{201D}"), b"\"x\"");
    assert_eq!(escpos::encode("\u{2013}"), b"-");
    // …and unsupported scripts degrade to '?' without panicking.
    assert_eq!(escpos::encode("\u{0628}"), b"?");
    assert_eq!(EscPosBuilder::new().init().text_line("hi").build()[2], b'h');
}

#[test]
fn qr_requires_payload() {
    assert!(EscPosBuilder::new().qr("").is_err());
    let bytes = EscPosBuilder::new().qr("order-1024").expect("valid").build();
    assert!(bytes.windows(3).any(|w| w == commands::QR_FUNCTION));
}

// ─── Virtual printer integration (doc 05 §2/§20) ────────────────────────────

#[test]
fn virtual_printer_captures_bytes_decoded_commands_and_metadata() {
    let doc = sample_minimal();
    let profile = PrinterProfile::thermal_80mm(48);
    let ticket = render_ticket(&doc, &profile, &default_layout(doc.kind)).expect("renders");

    let printer = VirtualThermalPrinter::new();
    printer
        .send(&PrintJob {
            document_name: "receipt-80mm".into(),
            bytes: ticket.bytes.clone(),
            copies: 2,
        })
        .expect("virtual send succeeds");

    let jobs = printer.captured_jobs();
    assert_eq!(jobs.len(), 1);
    let job = &jobs[0];
    assert_eq!(job.document_name, "receipt-80mm");
    assert_eq!(job.copies, 2);
    assert_eq!(job.bytes, ticket.bytes);
    assert_eq!(job.decoded_commands.first().map(String::as_str), Some("[INIT]"));
    assert_eq!(job.decoded_commands.last().map(String::as_str), Some("[CUT]"));
}

#[test]
fn failure_simulation_rejects_empty_jobs_without_state_change() {
    let printer = VirtualThermalPrinter::new();
    let err = printer
        .send(&PrintJob { document_name: "bad".into(), bytes: vec![], copies: 1 })
        .expect_err("empty job fails");
    assert_eq!(err.stage.to_string(), "spooling");
    assert!(printer.captured_jobs().is_empty(), "failed job must not be captured (no duplicate prints)");
}

// ─── Golden snapshots ───────────────────────────────────────────────────────

fn golden_root() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/golden")
}

struct GoldenCase {
    dir: &'static str,
    name: String,
    doc: ReceiptDocument,
}

fn golden_cases() -> Vec<GoldenCase> {
    let mut cases = Vec::new();

    for (name, doc) in [
        ("minimal", sample_minimal()),
        ("long_item", sample_long_item()),
        ("10_items", sample_many_items()),
        ("50_items", sample_very_long_order()),
        ("large_total", sample_large_total()),
    ] {
        cases.push(GoldenCase { dir: "receipt", name: name.into(), doc });
    }

    cases.push(GoldenCase { dir: "kot", name: "default".into(), doc: sample_kot() });

    cases.push(GoldenCase { dir: "delivery", name: "default".into(), doc: sample_delivery(false) });
    cases.push(GoldenCase { dir: "delivery", name: "evil".into(), doc: sample_delivery(true) });

    cases
}

fn render_golden(case: &GoldenCase, profile: &PrinterProfile) -> String {
    let layout = default_layout(case.doc.kind);
    let columns = profile.effective_columns(layout.font_scale);
    format!(
        "{}\n--- profile: {}mm / {} columns ---\n",
        plain_text(&render_document(&case.doc, columns, &layout), columns),
        profile.paper_width_mm,
        columns
    )
}

/// Writes/refreshes every golden file. Run explicitly:
/// `cargo test generate_golden_snapshots -- --ignored --nocapture`
#[test]
#[ignore = "golden generator — run manually and review the diff"]
fn generate_golden_snapshots() {
    for case in golden_cases() {
        for (profile_name, profile) in profiles() {
            let path = golden_root()
                .join(case.dir)
                .join(format!("{}_{}_{}.txt", case.dir, profile_name, case.name));
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).expect("create golden dir");
            }
            std::fs::write(&path, render_golden(&case, &profile)).expect("write golden");
            // Raw ESC/POS next to the text snapshot (doc 05 §13): inspectable
            // offline and printable later via `print_raw_bytes` for hardware
            // validation without re-running the app.
            let bin_path = path.with_extension("bin");
            let layout = default_layout(case.doc.kind);
            let ticket = render_ticket(&case.doc, &profile, &layout).expect("render golden bytes");
            std::fs::write(&bin_path, &ticket.bytes).expect("write golden bin");
            println!("wrote {} (+ .bin)", path.display());
        }
    }
}

macro_rules! golden_test {
    ($test_name:ident, $dir:expr, $case:expr, $profile:expr) => {
        #[test]
        fn $test_name() {
            let case = $case;
            let path = golden_root()
                .join($dir)
                .join(format!("{}_{}_{}.txt", $dir, $profile.0, case.name));
            let expected = std::fs::read_to_string(&path).unwrap_or_else(|e| {
                panic!(
                    "golden file missing ({}): {e}. Run `cargo test generate_golden_snapshots -- --ignored`.",
                    path.display()
                )
            });
            assert_eq!(render_golden(&case, &($profile.1)), expected, "snapshot drift for {}", path.display());
        }
    };
}

mod golden_receipt_58 {
    use super::*;
    golden_test!(minimal, "receipt", golden_receipt_case("minimal"), ("58mm", PrinterProfile::thermal_58mm(32)));
    golden_test!(long_item, "receipt", golden_receipt_case("long_item"), ("58mm", PrinterProfile::thermal_58mm(32)));
    golden_test!(items10, "receipt", golden_receipt_case("10_items"), ("58mm", PrinterProfile::thermal_58mm(32)));
    golden_test!(items50, "receipt", golden_receipt_case("50_items"), ("58mm", PrinterProfile::thermal_58mm(32)));
    golden_test!(large_total, "receipt", golden_receipt_case("large_total"), ("58mm", PrinterProfile::thermal_58mm(32)));

    fn golden_receipt_case(name: &str) -> GoldenCase {
        golden_cases().into_iter().find(|c| c.dir == "receipt" && c.name == name).unwrap()
    }
}

mod golden_receipt_80 {
    use super::*;
    golden_test!(minimal, "receipt", golden_receipt_case("minimal"), ("80mm", PrinterProfile::thermal_80mm(48)));
    golden_test!(long_item, "receipt", golden_receipt_case("long_item"), ("80mm", PrinterProfile::thermal_80mm(48)));
    golden_test!(items10, "receipt", golden_receipt_case("10_items"), ("80mm", PrinterProfile::thermal_80mm(48)));
    golden_test!(items50, "receipt", golden_receipt_case("50_items"), ("80mm", PrinterProfile::thermal_80mm(48)));
    golden_test!(large_total, "receipt", golden_receipt_case("large_total"), ("80mm", PrinterProfile::thermal_80mm(48)));

    fn golden_receipt_case(name: &str) -> GoldenCase {
        golden_cases().into_iter().find(|c| c.dir == "receipt" && c.name == name).unwrap()
    }
}

mod golden_kot {
    use super::*;
    golden_test!(kot_58, "kot", golden_case("default"), ("58mm", PrinterProfile::thermal_58mm(32)));
    golden_test!(kot_80, "kot", golden_case("default"), ("80mm", PrinterProfile::thermal_80mm(48)));

    fn golden_case(name: &str) -> GoldenCase {
        golden_cases().into_iter().find(|c| c.dir == "kot" && c.name == name).unwrap()
    }
}

mod golden_delivery {
    use super::*;
    golden_test!(delivery_default_58, "delivery", golden_case("default"), ("58mm", PrinterProfile::thermal_58mm(32)));
    golden_test!(delivery_default_80, "delivery", golden_case("default"), ("80mm", PrinterProfile::thermal_80mm(48)));
    golden_test!(delivery_evil_58, "delivery", golden_case("evil"), ("58mm", PrinterProfile::thermal_58mm(32)));
    golden_test!(delivery_evil_80, "delivery", golden_case("evil"), ("80mm", PrinterProfile::thermal_80mm(48)));

    fn golden_case(name: &str) -> GoldenCase {
        golden_cases().into_iter().find(|c| c.dir == "delivery" && c.name == name).unwrap()
    }
}
