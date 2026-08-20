describe('DIAG', () => {
    it('dumps page state immediately', async () => {
        const body = await browser.execute(() => document.body ? document.body.innerText.slice(0, 1000) : 'NO BODY');
        console.log('BODY:', JSON.stringify(body));
        const url = await browser.getUrl();
        console.log('URL:', url);
        const html = await browser.execute(() => document.documentElement.outerHTML.slice(0, 500));
        console.log('HTML:', JSON.stringify(html));
        const hasTauri = await browser.execute(() => typeof window.__TAURI__);
        console.log('__TAURI__ type:', hasTauri);
    });
});