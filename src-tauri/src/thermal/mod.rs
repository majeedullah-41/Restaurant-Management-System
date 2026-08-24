//! Deterministic thermal (ESC/POS) rendering for receipt/KOT/delivery
//! tickets. Layout is computed by pure functions (`layout`), encoded by a
//! command builder (`escpos`), and emitted through a printer abstraction
//! (`printer`) so everything can be tested without hardware.
//!
//! See `docs/RMS_THERMAL_PRINTING_MASTER_SPEC.md` for the architecture rules.

pub mod escpos;
pub mod layout;
pub mod model;
pub mod printer;
pub mod renderer;

#[cfg(test)]
mod tests;
