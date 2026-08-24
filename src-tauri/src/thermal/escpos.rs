//! ESC/POS command builder (Phase 5). Encodes layout decisions into printer
//! bytes. The layout engine decides WHAT to print; this module decides HOW
//! that instruction is encoded. Also hosts the development-only debug decoder.

/// Command prefixes (ESC/POS, ESC/POS-compatible printers).
pub mod commands {
    pub const ESC: u8 = 0x1B;
    pub const GS: u8 = 0x1D;

    /// `ESC @` — initialize printer (clears buffer, resets modes).
    pub const INIT: &[u8] = &[ESC, 0x40];
    /// `ESC a n` — justification: 0 left, 1 center, 2 right.
    pub const ALIGN: &[u8] = &[ESC, 0x61];
    /// `ESC E n` — emphasis on/off.
    pub const BOLD: &[u8] = &[ESC, 0x45];
    /// `GS ! n` — character size magnification.
    pub const SIZE: &[u8] = &[GS, 0x21];
    /// `GS V B 0` — feed + partial cut.
    pub const CUT: &[u8] = &[GS, 0x56, 0x42, 0x00];
    /// `GS ( k` QR model-2 store sequence prefix (payload built dynamically).
    pub const QR_FUNCTION: &[u8] = &[GS, 0x28, 0x6B];
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Align {
    Left,
    Center,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CharSize {
    Normal,
    /// Double width + double height (`GS ! 0x11`).
    Double,
}

/// Accumulates the byte stream for one print job in printer order.
#[derive(Default, Debug)]
pub struct EscPosBuilder {
    bytes: Vec<u8>,
}

impl EscPosBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn init(mut self) -> Self {
        self.bytes.extend_from_slice(commands::INIT);
        self
    }

    pub fn align(mut self, align: Align) -> Self {
        let code = match align {
            Align::Left => 0u8,
            Align::Center => 1,
            Align::Right => 2,
        };
        self.bytes.extend_from_slice(commands::ALIGN);
        self.bytes.push(code);
        self
    }

    pub fn bold(mut self, on: bool) -> Self {
        self.bytes.extend_from_slice(commands::BOLD);
        self.bytes.push(u8::from(on));
        self
    }

    pub fn size(mut self, size: CharSize) -> Self {
        self.bytes.extend_from_slice(commands::SIZE);
        self.bytes.push(match size {
            CharSize::Normal => 0x00,
            CharSize::Double => 0x11,
        });
        self
    }

    /// Encoded text followed by a line feed.
    pub fn text_line(mut self, text: &str) -> Self {
        self.bytes.extend_from_slice(&encode(text));
        self.line_feed()
    }

    pub fn line_feed(mut self) -> Self {
        self.bytes.push(0x0A);
        self
    }

    pub fn divider(self, width: usize) -> Self {
        self.text_line(&"-".repeat(width))
    }

    /// QR code (model 2) using the `GS ( k` storage function. Only emit when
    /// the printer profile advertises QR support; callers must check first.
    pub fn qr(mut self, data: &str) -> Result<Self, String> {
        let payload = encode(data);
        if payload.is_empty() {
            return Err("QR payload is empty".into());
        }
        // Function 165: store data.
        let len = payload.len() as u16 + 3;
        self.bytes.extend_from_slice(commands::QR_FUNCTION);
        self.bytes.extend_from_slice(&(len).to_le_bytes());
        self.bytes.push(0x31); // fn 165
        self.bytes.push(0x50); // model 2 low byte
        self.bytes.extend_from_slice(&payload);
        Ok(self)
    }

    pub fn cut(mut self) -> Self {
        self.bytes.extend_from_slice(commands::CUT);
        self
    }

    pub fn build(self) -> Vec<u8> {
        self.bytes
    }
}

// ─── Encoding strategy (explicit per testing spec SAMPLE_08) ────────────────

/// Replaces typographic punctuation with ASCII equivalents so receipts never
/// print mojibake, then maps every remaining non-ASCII character to `?`.
///
/// This is the documented encoding strategy until a specific codepage/printer
/// profile requires more (Urdu rendering needs a codepage-capable font and is
/// tracked separately); behaviour is deterministic and covered by tests.
pub fn encode(text: &str) -> Vec<u8> {
    let normalized: String = text
        .chars()
        .map(|c| match c {
            '\u{2018}' | '\u{2019}' | '\u{201B}' => '\'',
            '\u{201C}' | '\u{201D}' | '\u{201F}' => '"',
            '\u{2013}' | '\u{2014}' | '\u{2212}' => '-',
            '\u{2022}' => '*',
            '\u{2026}' => '.',
            c if c.is_control() && c != '\n' => ' ',
            c => c,
        })
        .collect();

    normalized
        .chars()
        .map(|c| if c.is_ascii() { c as u8 } else { b'?' })
        .collect()
}

// ─── Debug decoder (development/test tooling only — doc 05 §14) ─────────────

/// Decodes raw ESC/POS bytes into readable command lines such as
/// `[INIT]`, `[ALIGN CENTER]`, `[BOLD ON]`, `[TEXT] "…"`, `[LF]`, `[CUT]`.
/// Not used by production printing.
pub fn decode(bytes: &[u8]) -> Vec<String> {
    let mut out = Vec::new();
    let mut i = 0;
    let mut text = String::new();

    fn flush_text(text: &mut String, out: &mut Vec<String>) {
        if !text.is_empty() {
            out.push(format!("[TEXT] \"{}\"", text));
            text.clear();
        }
    }

    while i < bytes.len() {
        match bytes[i] {
            0x1B if i + 1 < bytes.len() => match bytes[i + 1] {
                0x40 => {
                    flush_text(&mut text, &mut out);
                    out.push("[INIT]".into());
                    i += 2;
                }
                0x61 if i + 2 < bytes.len() => {
                    flush_text(&mut text, &mut out);
                    out.push(
                        [
                            ("[ALIGN LEFT]", 0u8),
                            ("[ALIGN CENTER]", 1),
                            ("[ALIGN RIGHT]", 2),
                        ]
                        .iter()
                        .find(|(_, code)| *code == bytes[i + 2])
                        .map(|(name, _)| name.to_string())
                        .unwrap_or_else(|| format!("[ALIGN {}]", bytes[i + 2])),
                    );
                    i += 3;
                }
                0x45 if i + 2 < bytes.len() => {
                    flush_text(&mut text, &mut out);
                    out.push(if bytes[i + 2] == 1 { "[BOLD ON]".into() } else { "[BOLD OFF]".into() });
                    i += 3;
                }
                _ => {
                    text.push(bytes[i] as char);
                    i += 1;
                }
            },
            0x1D if i + 3 < bytes.len() && bytes[i + 1] == 0x21 => {
                flush_text(&mut text, &mut out);
                out.push(format!("[SIZE {:02X}]", bytes[i + 2]));
                i += 3;
            }
            0x1D if i + 3 < bytes.len() && bytes[i + 1] == 0x56 => {
                flush_text(&mut text, &mut out);
                out.push("[CUT]".into());
                i += 4;
            }
            0x0A => {
                flush_text(&mut text, &mut out);
                out.push("[LF]".into());
                i += 1;
            }
            b => {
                text.push(b as char);
                i += 1;
            }
        }
    }
    flush_text(&mut text, &mut out);
    out
}
