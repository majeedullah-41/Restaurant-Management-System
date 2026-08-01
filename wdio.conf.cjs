const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let edgeDriver;

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
            binary: 'D:\\RustTarget\\debug\\rms.exe',
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
    
    // Set DB_PATH environment variable for tests
    beforeSession: function () {
        process.env.DB_PATH = path.resolve(__dirname, 'test.db');
        
        const driverPath = path.resolve(__dirname, 'msedgedriver.exe');
        edgeDriver = spawn(driverPath, ['--port=4444'], {
            stdio: [null, process.stdout, process.stderr]
        });
    },

    afterSession: function () {
        if (edgeDriver) {
            edgeDriver.kill();
        }
    }
}
