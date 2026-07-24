#!/usr/bin/env node

/**
 * License Key Generator for RMS (Restaurant Management System)
 * 
 * Usage:
 *   node scripts/keygen.js generate-keys          → Generate a new RSA keypair
 *   node scripts/keygen.js create-key <HWID> <EXPIRY_DATE>  → Create a license key
 * 
 * Examples:
 *   node scripts/keygen.js generate-keys
 *   node scripts/keygen.js create-key "A1B2-C3D4-E5F6-G7H8" "2026-12-31"
 * 
 * The generated public key must be embedded in src-tauri/src/license.rs (PUBLIC_KEY_PEM constant).
 * The private key must be kept secret — only used by this script to sign license keys.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const KEYS_DIR = path.join(__dirname, ".keys");
const PRIVATE_KEY_PATH = path.join(KEYS_DIR, "private_key.pem");
const PUBLIC_KEY_PATH = path.join(KEYS_DIR, "public_key.pem");

// ─── Command: generate-keys ─────────────────────────────────────────────────

function generateKeys() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  if (fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error("⚠️  Keys already exist in", KEYS_DIR);
    console.error("   Delete them first if you want to regenerate.");
    process.exit(1);
  }

  console.log("🔐 Generating RSA-2048 keypair...\n");

  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  fs.writeFileSync(PRIVATE_KEY_PATH, privateKey);
  fs.writeFileSync(PUBLIC_KEY_PATH, publicKey);

  console.log("✅ Keys generated successfully!\n");
  console.log("📁 Private key (KEEP SECRET):", PRIVATE_KEY_PATH);
  console.log("📁 Public key:", PUBLIC_KEY_PATH);
  console.log("\n" + "═".repeat(70));
  console.log("IMPORTANT: Copy the public key below into license.rs (PUBLIC_KEY_PEM):");
  console.log("═".repeat(70) + "\n");
  console.log(publicKey);
  console.log("═".repeat(70));
}

// ─── Command: create-key ─────────────────────────────────────────────────────

function createKey(hwid, expiryDate) {
  if (!hwid || !expiryDate) {
    console.error("❌ Usage: node keygen.js create-key <HWID> <EXPIRY_DATE>");
    console.error("   Example: node keygen.js create-key \"A1B2-C3D4-E5F6-G7H8\" \"2026-12-31\"");
    process.exit(1);
  }

  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(expiryDate)) {
    console.error("❌ Invalid date format. Use YYYY-MM-DD (e.g., 2026-12-31)");
    process.exit(1);
  }

  const expiry = new Date(expiryDate);
  if (isNaN(expiry.getTime())) {
    console.error("❌ Invalid date:", expiryDate);
    process.exit(1);
  }

  if (expiry <= new Date()) {
    console.error("⚠️  Warning: The expiry date is in the past!");
  }

  // Load private key
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error("❌ Private key not found. Run 'node keygen.js generate-keys' first.");
    process.exit(1);
  }

  const privateKey = fs.readFileSync(PRIVATE_KEY_PATH, "utf8");

  // Create payload: HWID|EXPIRY_DATE
  const payload = `${hwid}|${expiryDate}`;

  // Sign with RSA-SHA256
  const sign = crypto.createSign("SHA256");
  sign.update(payload);
  sign.end();
  const signature = sign.sign(privateKey); // Buffer

  // Encode: Base64( payload + \n + Base64(signature) )
  const signatureB64 = signature.toString("base64");
  const combined = `${payload}\n${signatureB64}`;
  const licenseKey = Buffer.from(combined).toString("base64");

  console.log("\n" + "═".repeat(70));
  console.log("🔑 LICENSE KEY GENERATED");
  console.log("═".repeat(70));
  console.log(`   HWID:   ${hwid}`);
  console.log(`   Expiry: ${expiryDate}`);
  console.log("═".repeat(70));
  console.log("\n" + licenseKey + "\n");
  console.log("═".repeat(70));
  console.log("Copy the key above and give it to the client to paste into the app.\n");
}

// ─── CLI Router ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "generate-keys":
    generateKeys();
    break;
  case "create-key":
    createKey(args[1], args[2]);
    break;
  default:
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              RMS License Key Generator                             ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                    ║
║  Commands:                                                         ║
║    generate-keys                  Generate RSA keypair             ║
║    create-key <HWID> <EXPIRY>     Create a license key             ║
║                                                                    ║
║  Examples:                                                         ║
║    node keygen.js generate-keys                                    ║
║    node keygen.js create-key "ABCD-EF12-3456-7890" "2026-12-31"    ║
║                                                                    ║
╚══════════════════════════════════════════════════════════════════════╝
`);
    break;
}
