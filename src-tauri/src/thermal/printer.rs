//! Printer output abstraction (Phase 6 / doc 05 §2). The renderer produces
//! bytes; implementations of `ThermalPrinter` receive them. The virtual
//! printer captures jobs so the whole pipeline is testable without hardware.

use std::cell::RefCell;

use super::escpos;

/// One spool request produced by the renderer.
#[derive(Clone, Debug)]
pub struct PrintJob {
    /// Human-readable job name for the Windows spooler queue.
    pub document_name: String,
    pub bytes: Vec<u8>,
    pub copies: u32,
}

/// Staged printer error — every failure identifies its stage
/// (master spec Error Handling Rule).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PrintStage {
    PrinterResolution,
    Spooling,
}

impl std::fmt::Display for PrintStage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PrintStage::PrinterResolution => write!(f, "printer_resolution"),
            PrintStage::Spooling => write!(f, "spooling"),
        }
    }
}

#[derive(Clone, Debug)]
pub struct PrintError {
    pub stage: PrintStage,
    pub message: String,
}

impl std::fmt::Display for PrintError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.stage, self.message)
    }
}

/// Output device trait. Implementations must not retry on their own (Rule 10:
/// never silently print twice after an uncertain printer state).
pub trait ThermalPrinter {
    fn send(&self, job: &PrintJob) -> Result<(), PrintError>;
}

/// Sends the job through the existing winspool RAW pipeline in `print.rs`.
#[derive(Clone, Debug, Default)]
pub struct RealThermalPrinter {
    /// `None` resolves to the OS default printer inside the spooler script.
    pub printer_name: Option<String>,
}

impl ThermalPrinter for RealThermalPrinter {
    fn send(&self, job: &PrintJob) -> Result<(), PrintError> {
        crate::print::print_raw_bytes(self.printer_name.as_deref(), &job.bytes, job.copies)
            .map_err(|message| PrintError { stage: PrintStage::Spooling, message })
    }
}

/// A captured virtual print job (doc 05 §2): raw bytes plus decoded commands
/// so tests and the debug tooling can inspect exactly what would print.
#[derive(Clone, Debug)]
pub struct CapturedJob {
    pub document_name: String,
    pub bytes: Vec<u8>,
    pub decoded_commands: Vec<String>,
    pub copies: u32,
}

/// In-memory sink. Never touches Windows or a physical device.
#[derive(Default)]
pub struct VirtualThermalPrinter {
    captured: RefCell<Vec<CapturedJob>>,
}

impl VirtualThermalPrinter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn captured_jobs(&self) -> Vec<CapturedJob> {
        self.captured.borrow().clone()
    }
}

impl ThermalPrinter for VirtualThermalPrinter {
    fn send(&self, job: &PrintJob) -> Result<(), PrintError> {
        if job.bytes.is_empty() {
            return Err(PrintError { stage: PrintStage::Spooling, message: "empty byte stream".into() });
        }
        self.captured.borrow_mut().push(CapturedJob {
            document_name: job.document_name.clone(),
            decoded_commands: escpos::decode(&job.bytes),
            copies: job.copies.max(1),
            bytes: job.bytes.clone(),
        });
        Ok(())
    }
}
