const { remote } = require('webdriverio');

(async () => {
    const browser = await remote({
        logLevel: 'trace',
        capabilities: {
            browserName: 'msedge',
            'ms:edgeOptions': {
                binary: 'D:\\RustTarget\\debug\\rms.exe'
            }
        }
    });

    console.log("Session created!");
    const title = await browser.getTitle();
    console.log("Title: " + title);
    
    await browser.deleteSession();
})().catch(e => {
    console.error(e);
});
