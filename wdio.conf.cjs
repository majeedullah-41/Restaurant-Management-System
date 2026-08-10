const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let edgeDriver;
const appDataDir = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
const realDbPath = path.join(appDataDir, 'RMS', 'local.db');
const backupDbPath = path.join(appDataDir, 'RMS', 'local.db.backup');

exports.config = {
    runner: 'local',
    specs: [
        './test/e2e/**/*.test.cjs'
    ],
    maxInstances: 1,
    capabilities: [{
        maxInstances: 1,
        browserName: 'MicrosoftEdge',
        'ms:edgeOptions': {
            binary: process.env.RMS_EXE || 'D:\\RustTarget\\debug\\rms.exe',
            args: ['--remote-debugging-port=9222']
        }
    }],
    port: 4444,
    logLevel: 'info',
    bail: 0,
    baseUrl: 'http://localhost',
    waitforTimeout: 10000,
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    services: [],
    framework: 'mocha',
    reporters: ['spec'],
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000
    },
    
    beforeSession: function () {
        // Backup the real local.db and copy test.db over it
        const testDbPath = path.resolve(__dirname, 'test.db');
        if (fs.existsSync(realDbPath)) {
            fs.copyFileSync(realDbPath, backupDbPath);
        }
        
        const rmsDir = path.dirname(realDbPath);
        if (!fs.existsSync(rmsDir)) {
            fs.mkdirSync(rmsDir, { recursive: true });
        }
        
        // Remove WAL files so the new DB doesn't get corrupted by old WALs
        if (fs.existsSync(realDbPath + '-wal')) fs.unlinkSync(realDbPath + '-wal');
        if (fs.existsSync(realDbPath + '-shm')) fs.unlinkSync(realDbPath + '-shm');

        if (fs.existsSync(testDbPath)) {
            fs.copyFileSync(testDbPath, realDbPath);
        }

        const driverPath = process.env.EDGEDRIVER_PATH || path.resolve(__dirname, 'msedgedriver.exe');
        edgeDriver = spawn(driverPath, ['--port=4444'], {
            stdio: [null, process.stdout, process.stderr],
            env: {
                ...process.env,
                WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=9222'
            }
        });

        edgeDriver.on('error', (err) => {
            console.error('\nERROR: Failed to start msedgedriver.');
        });
    },

    afterSession: function () {
        if (edgeDriver) {
            edgeDriver.kill();
        }
        // Restore the real local.db
        if (fs.existsSync(backupDbPath)) {
            if (fs.existsSync(realDbPath + '-wal')) fs.unlinkSync(realDbPath + '-wal');
            if (fs.existsSync(realDbPath + '-shm')) fs.unlinkSync(realDbPath + '-shm');
            fs.copyFileSync(backupDbPath, realDbPath);
            fs.unlinkSync(backupDbPath);
        }
    }
}
