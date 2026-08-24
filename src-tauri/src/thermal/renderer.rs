//! Receipt renderer (Phase 5/6 boundary): turns a `ReceiptDocument` into
//! styled lines and then into ESC/POS bytes. Renderer produces bytes; the
//! printer module receives bytes — the two responsibilities never mix.

use super::escpos::{Align, EscPosBuilder};
use super::layout::{plain_text, render_document, StyledLine, TextAlign};
use super::model::{PrinterProfile, ReceiptDocument, ThermalLayout};

/// Rendered ticket ready for output.
#[derive(Clone, Debug)]
pub struct RenderedTicket {
    /// Human-readable text view (same geometry as the byte output).
    pub text: String,
    /// ESC/POS byte stream (init … content … cut).
    pub bytes: Vec<u8>,
    pub line_count: usize,
}

/// Renders the document for a printer profile. `cut_margin_lines` blank lines
/// are added before the cut so the content is never clipped by the blade.
pub fn render_ticket(
    doc: &ReceiptDocument,
    profile: &PrinterProfile,
    layout: &ThermalLayout,
) -> Result<RenderedTicket, String> {
    // Manual calibration wins when present (docs 05 §6/§7); otherwise derive
    // capacity from the profile and font scale.
    let columns = layout
        .chars_per_line_override
        .map(|c| c as usize)
        .unwrap_or_else(|| profile.effective_columns(layout.font_scale));
    let lines = render_document(doc, columns, layout);
    if lines.is_empty() {
        return Err("validation: receipt rendered to zero lines".into());
    }

    let cut_margin = if profile.supports_cut { 3 } else { 0 };
    Ok(RenderedTicket {
        text: plain_text(&lines, columns),
        line_count: super::layout::calculate_document_height(lines.len(), cut_margin),
        bytes: encode_ticket(&lines, columns, profile),
    })
}

/// Walks the logical lines in order and emits the matching commands:
/// init → per-line alignment/bold/text/LF → trailing feeds → cut.
fn encode_ticket(lines: &[StyledLine], columns: usize, profile: &PrinterProfile) -> Vec<u8> {
    let mut builder = EscPosBuilder::new().init();

    // Emit alignment/bold only when the state changes so the byte stream stays
    // minimal and deterministic (decoder snapshots stay readable).
    let mut last_align: Option<Align> = None;
    let mut last_bold: Option<bool> = None;

    for line in lines {
        let align = match line.align {
            TextAlign::Left => Align::Left,
            TextAlign::Center => Align::Center,
        };
        if last_align != Some(align) {
            builder = builder.align(align);
            last_align = Some(align);
        }
        if last_bold != Some(line.bold) {
            builder = builder.bold(line.bold);
            last_bold = Some(line.bold);
        }
        builder = builder.text_line(&line.text);
    }

    // Never leave emphasis dangling into the next spooler job.
    if last_bold == Some(true) {
        builder = builder.bold(false);
    }

    // Feed past the cutter, then cut when the hardware supports it.
    for _ in 0..if profile.supports_cut { 3 } else { 1 } {
        builder = builder.line_feed();
    }
    if profile.supports_cut {
        builder = builder.cut();
    }

    let _ = columns;
    builder.build()
}
