//! Development-only thermal preview tooling (docs/05 §14–§16).
//!
//! Runs the exact same pure render pipeline as production printing
//! (`render_ticket`) and returns the text view, the decoded ESC/POS command
//! listing and the raw byte stream (base64) so layout output can be inspected
//! in the simulator UI without hardware. Never called by checkout/print flows.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde::Serialize;

use crate::thermal::escpos;
use crate::thermal::model::{profile_for_paper, ReceiptDocument, ThermalLayout};
use crate::thermal::renderer::render_ticket;

#[derive(Serialize)]
pub struct ThermalPreview {
    /// Human-readable text view (same geometry as the byte stream).
    pub text: String,
    /// Decoded ESC/POS commands: `[INIT]`, `[TEXT] "…"`, `[CUT]`, …
    pub decoded_commands: Vec<String>,
    /// Raw ESC/POS bytes, base64-encoded for transport.
    pub bytes_base64: String,
    /// Logical content lines including the cut margin.
    pub line_count: usize,
    /// Columns the layout actually used (profile capacity after font scale).
    pub columns: usize,
}

#[tauri::command]
pub fn thermal_preview(
    document: ReceiptDocument,
    layout_json: Option<String>,
    paper_width_mm: u32,
) -> Result<ThermalPreview, String> {
    let profile = profile_for_paper(paper_width_mm);
    let layout_raw = layout_json.unwrap_or_default();
    let layout = ThermalLayout::from_json(document.kind, &layout_raw);
    let rendered = render_ticket(&document, &profile, &layout)?;
    Ok(ThermalPreview {
        text: rendered.text,
        decoded_commands: escpos::decode(&rendered.bytes),
        bytes_base64: BASE64.encode(&rendered.bytes),
        line_count: rendered.line_count,
        columns: profile.effective_columns(layout.font_scale),
    })
}
