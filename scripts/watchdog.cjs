#!/usr/bin/env node

/**
 * E2E risk mitigation watchdog.
 *
 * The WebDriver harness (wdio.conf.cjs) is designed to run the app under test
 * against a FULLY ISOLATED database (%LOCALAPPDATA%\RMS\e2e-test\test.db) so
 * the live store DB (%LOCALAPPDATA%\RMS\local.db) is never touched. But a
 * killed / hung test run can leave an autonomous WebDriver app instance behind:
 *
 *   - rms.exe spawned by the harness carries `--remote-debugging-port=9222` in
 *     its command line. If it was launched WITHOUT the DB_PATH override (or the
 *     override was dropped by a shell/parent restart), it silently points at
 *     the LIVE STORE database and keeps writing test data into it.
 *   - msedgedriver.exe is the WebDriver server that keeps those instances
 *     running; killing the harness (Ctrl+C / taskkill / CI timeout) often
 *     orphans it and its app children.
 *
 * The watchdog snapshots the store DB before the E2E suite starts, and after
 * the suite finishes (or is killed) it scans for those autonomous processes.
 * If it finds one that is (or could be) driving the live store DB, it kills it
 * and restores the store DB from the pre-run snapshot. It is deliberately
 * conservative: it never touches the normally-running app (no debug port), and
 * it only restores the store DB when it actually killed a dangerous process.
 *
 * Usage:
 *   node scripts/watchdog.cjs snapshot   Copy store DB -> e2e snapshot
 *   node scripts/watchdog.cjs cleanup    Kill dangerous procs + restore store DB
 *   node scripts/watchdog.cjs status     Report without changing anything
 *   node scripts/watchdog.cjs help
 *
 * Environment overrides (same semantics as the harness):
 *   RMS_EXE          path to the app binary (default D:\RustTarget\debug\rms.exe)
 *   WATCHDOG_DB_PATH live store DB path (default %LOCALAPPDATA%\RMS\local.db)
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const appDataDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const RMS_DIR = path.join(appDataDir, 'RMS');
const STORE_DB = process.env.WATCHDOG_DB_PATH || path.join(RMS_DIR, 'local.db');

// Same snapshot location convention as the harness. A copy left here is also a
// useful recovery point after a botched manual run.
const SNAPSHOT_DIR = path.join(RMS_DIR, 'e2e-watchdog');
const SNAPSHOT_DB = path.join(SNAPSHOT_DIR, 'local.db');

function log(msg) {
    console.log(`[watchdog] ${msg}`);
}

function warn(msg) {
    console.warn(`[watchdog] WARN: ${msg}`);
}

// ─── SQLite checkpoint ───────────────────────────────────────────────────────

// The app writes in WAL mode, so pending frames may live in the -wal sidecar.
// Checkpointing first makes the main .db file a complete, self-contained
// snapshot (safe to copy and safe to restore even if the -wal cannot be
// removed). Uses the project's better-sqlite3; falls back to a plain copy if
// it is unavailable (module not installed).
function checkpointDb(dbPath) {
    if (!fs.existsSync(dbPath)) {
        return;
    }
    let Database = null;
    try {
        Database = require('better-sqlite3');
    } catch (e) {
        warn(`better-sqlite3 unavailable (${e.message}); snapshot may not include the latest WAL frames.`);
        return;
    }
    try {
        const db = new Database(dbPath, { readonly: false, timeout: 5000, fileMustExist: true });
        try {
            db.pragma('wal_checkpoint(TRUNCATE)');
        } finally {
            db.close();
        }
    } catch (e) {
        warn(`could not checkpoint ${dbPath}: ${e.message}`);
    }
}

// ─── WMI helpers ─────────────────────────────────────────────────────────────

// Powershell's exe arg-parser strips quotes from individual tokens, so the
// whole script is passed as ONE -Command string. The filter value is embedded
// with PowerShell single-quote escaping ('' -> ').
function runWmic(script) {
    return spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        timeout: 30000,
        windowsHide: true,
    });
}

function wmicTable(query) {
    const res = runWmic(
        `Get-CimInstance Win32_Process -Filter '${query.filter.replace(/'/g, "''")}' -ErrorAction SilentlyContinue | Select-Object ${query.fields.map(f => f.label).join(',')} | Format-List`
    );
    if (res.status !== 0) {
        return null;
    }
    const rows = [];
    let cur = {};
    for (const line of res.stdout.split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
        if (m) {
            cur[m[1]] = m[2];
        } else if (/^\s*$/.test(line) && Object.keys(cur).length) {
            rows.push(cur);
            cur = {};
        }
    }
    if (Object.keys(cur).length) {
        rows.push(cur);
    }
    return rows;
}

function getProcesses(name) {
    return wmicTable({
        filter: `Name = '${name}'`,
        fields: [
            { label: 'ProcessId' },
            { label: 'ParentProcessId' },
            { label: 'CommandLine' },
            { label: 'Name' },
        ],
    });
}

function getProcessEnvironment(pid) {
    const res = runWmic(
        `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction SilentlyContinue | Select-Object CommandLine | Format-List`
    );
    if (res.status !== 0) {
        return '';
    }
    return res.stdout;
}

function killProcess(pid, name) {
    const res = runWmic(`Stop-Process -Id ${pid} -Force`);
    if (res.status === 0) {
        log(`killed ${name} (PID ${pid})`);
        return true;
    }
    warn(`failed to kill ${name} (PID ${pid}): ${res.stderr.trim() || 'unknown error'}`);
    return false;
}

// ─── Detection ───────────────────────────────────────────────────────────────

function isDebugPortCmdline(cmdline) {
    return /--remote-debugging-port\s*=\s*\d+/.test(cmdline);
}

// The app under test is started by the harness with a DB_PATH env override.
// When the harness's process tree is killed that override can be lost for
// newly launched children; any app instance that runs against the LIVE store
// DB is dangerous.
function envHasLiveDb(pid) {
    const out = getProcessEnvironment(pid);
    const dbMatch = out.match(/DB_PATH\s*=\s*["']?([^"'\r\n]+)/i);
    if (!dbMatch) {
        return true; // no DB_PATH override -> resolves to the live store DB
    }
    const val = dbMatch[1].replace(/\\$/, '');
    const live = STORE_DB.replace(/\//g, '\\').toLowerCase();
    const valLower = val.toLowerCase();
    return valLower === live || valLower === path.join(appDataDir, 'RMS\\local.db').toLowerCase();
}

// ─── Commands ────────────────────────────────────────────────────────────────

function snapshot() {
    if (!fs.existsSync(STORE_DB)) {
        warn(`store DB not found at ${STORE_DB} — skipping snapshot (nothing to protect yet).`);
        return;
    }
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

    // Checkpoint so the main file is complete on its own, then copy it. The
    // -wal sidecar is also copied (best-effort) for the no-checkpoint path.
    checkpointDb(STORE_DB);
    fs.copyFileSync(STORE_DB, SNAPSHOT_DB);
    if (fs.existsSync(STORE_DB + '-wal')) {
        try {
            fs.copyFileSync(STORE_DB + '-wal', SNAPSHOT_DB + '-wal');
        } catch (e) {
            warn(`could not copy WAL sidecar: ${e.message}`);
        }
    }
    log(`snapshot taken: ${SNAPSHOT_DB}`);
}

function findDangerousProcesses() {
    const dangerous = [];

    const apps = getProcesses('rms.exe') || [];
    for (const p of apps) {
        if (isDebugPortCmdline(p.CommandLine || '') && envHasLiveDb(p.ProcessId)) {
            dangerous.push({ pid: p.ProcessId, name: 'rms.exe (debug port, live DB)' });
        }
    }

    // The WebDriver server itself is only a threat when it is still holding the
    // store DB open (DB_PATH override pointing at the live store DB).
    const drivers = getProcesses('msedgedriver.exe') || [];
    for (const p of drivers) {
        if (envHasLiveDb(p.ProcessId)) {
            dangerous.push({ pid: p.ProcessId, name: 'msedgedriver.exe (live DB)' });
        }
    }

    return dangerous;
}

function cleanup() {
    const dangerous = findDangerousProcesses();

    if (!dangerous.length) {
        log('no autonomous WebDriver processes found. store DB is safe.');
        return { killed: [], restored: false };
    }

    log(`found ${dangerous.length} autonomous process(es) that could touch the store DB:`);
    for (const p of dangerous) {
        log(`  - ${p.name} (PID ${p.pid})`);
    }

    const killed = dangerous.filter((p) => killProcess(p.pid, p.name));

    // Give Windows a moment to release the DB file handles before restoring.
    if (killed.length) {
        const wait = Date.now() + 2000;
        while (Date.now() < wait) {
            // busy-wait for file handle release
        }
        const restored = restore();
        if (!restored) {
            process.exitCode = 1;
        }
        return { killed, restored };
    }

    warn('could not kill any process; store DB NOT restored. Kill the processes manually.');
    return { killed, restored: false };
}

function restore() {
    if (!fs.existsSync(SNAPSHOT_DB)) {
        warn(`no snapshot found at ${SNAPSHOT_DB} — cannot restore the store DB.`);
        return false;
    }

    // Checkpoint the current store DB first (best-effort) so its -wal is folded
    // into the file we are about to replace.
    checkpointDb(STORE_DB);

    // Remove stale -wal/-shm so old frames are never replayed over the restored
    // file (the same trick the app's import path uses). If they are still
    // locked, a LIVE RMS instance is holding the store DB open — restoring over
    // it could be undone by that instance's next checkpoint, so refuse.
    const stale = ['-wal', '-shm'].filter((suffix) => fs.existsSync(STORE_DB + suffix));
    for (const suffix of stale) {
        try {
            fs.rmSync(STORE_DB + suffix, { force: true });
        } catch (e) {
            warn(`store DB is locked by a running RMS instance (could not remove ${STORE_DB + suffix}).`);
            warn('Close the app and re-run `npm run watchdog cleanup`. Store DB NOT restored.');
            return false;
        }
    }

    fs.copyFileSync(SNAPSHOT_DB, STORE_DB);
    log(`store DB restored from pre-run snapshot: ${STORE_DB}`);
    return true;
}

function status() {
    const dangerous = findDangerousProcesses();
    if (dangerous.length) {
        console.error('[watchdog] store DB THREATENED by:');
        for (const p of dangerous) {
            console.error(`  - ${p.name} (PID ${p.pid})`);
        }
        console.error('[watchdog] run `node scripts/watchdog.cjs cleanup` to kill them and restore the store DB.');
        process.exitCode = 1;
        return;
    }
    log('store DB is safe — no autonomous WebDriver processes found.');
    console.log(`  store DB: ${STORE_DB}`);
    console.log(`  snapshot: ${SNAPSHOT_DB}${fs.existsSync(SNAPSHOT_DB) ? '' : ' (none taken yet)'}`);
}

function help() {
    console.log(`
RMS E2E store-DB watchdog

Commands:
  snapshot   Copy the store DB (and WAL sidecar) to the e2e-watchdog snapshot dir.
  cleanup    Kill autonomous WebDriver processes threatening the store DB, then
             restore the store DB from the snapshot if anything was killed.
  status     Report whether the store DB is currently threatened (exit 1 if so).
  help       Show this help.

Environment overrides:
  RMS_EXE             app binary path  (default D:\\RustTarget\\debug\\rms.exe)
  WATCHDOG_DB_PATH    live store DB    (default %LOCALAPPDATA%\\RMS\\local.db)
`);
}

// ─── CLI Router ──────────────────────────────────────────────────────────────

const cmd = (process.argv[2] || '').toLowerCase();

switch (cmd) {
    case 'snapshot':
        snapshot();
        break;
    case 'cleanup':
        cleanup();
        break;
    case 'status':
        status();
        break;
    case 'help':
    case '-h':
    case '--help':
        help();
        break;
    default:
        help();
        process.exitCode = 2;
}
