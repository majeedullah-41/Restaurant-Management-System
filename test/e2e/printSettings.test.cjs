const assert = require('assert');

// The tauri-plugin-wdio-webdriver elementClick runs a programmatic el.click()
// on the matched <option>, which native <option> elements ignore — so WebdriverIO's
// selectByVisibleText/selectByIndex leave React's select unchanged. Set the value
// through the native setter and dispatch a bubbling change event instead.
async function selectOption(selector, text) {
    await browser.execute(
        (sel, optText) => {
            const select = document.querySelector(sel);
            const option = Array.from(select.options).find((o) => o.textContent.trim() === optText);
            if (!option) throw new Error(`option "${optText}" not found in ${sel}`);
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            setter.call(select, option.value);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        },
        selector,
        text
    );
}

// The plugin's clearValue/setValue don't reliably replace React-controlled
// inputs (they append). Set the value through the native setter and dispatch
// a bubbling input + change event instead.
async function setNativeValue(selector, value) {
    await browser.execute(
        (sel, newValue) => {
            const el = document.querySelector(sel);
            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
            setter.call(el, String(newValue));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        },
        selector,
        value
    );
}

/**
 * End-to-end test for the Printing & Receipts settings section.
 *
 * Runs against the real app (rms.exe) on an ISOLATED test database (see
 * wdio.conf.cjs). Covers: printer discovery, printer/copies controls, test
 * print, receipt + KOT design toggles with the live preview, and persisting
 * the settings. The "Test" button sends a real ticket to the selected printer
 * (default: the thermal "Black Copper 80").
 *
 * Run with: npm run test:e2e
 */
describe('RMS Printing & Receipts E2E Test', () => {
    it('logs in, opens Settings and the printers load from the real machine', async () => {
        // The app may already be authenticated (running after orderFlow in the
        // same suite). Only show the login form when it is actually present.
        const emailField = await $$('#email');
        if (emailField.length > 0) {
            await emailField[0].setValue('admin@restaurant.com');
            await $('#password').setValue('admin123');
            await $('button=LOGIN').click();
        }

        const posNav = await $('button=POS / New Order');
        await posNav.waitForDisplayed({ timeout: 30000 });

        await $('button=Settings').click();

        // Settings opens on the "General Preferences" tab by default; navigate
        // to the "Printing & Receipts" tab which renders the section under test.
        await $('button=Printing & Receipts').click();

        const section = await $('[data-testid="print-settings-section"]');
        await section.waitForDisplayed({ timeout: 30000 });

        // Printer dropdowns must be populated with real printers (the dev
        // machine's thermal printer is the canonical case).
        const optionNames = await browser.execute(() =>
            Array.from(document.querySelector('[data-testid="printer-receipt"]').options).map(o => o.textContent.trim())
        );
        assert.ok(
            optionNames.includes('Black Copper 80'),
            `Expected the thermal printer in the dropdown, got: ${optionNames.join(', ')}`
        );
    });

    it('printer selection and copies controls work', async () => {
        const printerSelect = await $('[data-testid="printer-receipt"]');
        await selectOption('[data-testid="printer-receipt"]', 'Black Copper 80');
        assert.strictEqual(await printerSelect.getValue(), 'Black Copper 80');

        const copies = await $('[data-testid="copies-receipt"]');
        await setNativeValue('[data-testid="copies-receipt"]', 2);
        assert.strictEqual(await copies.getValue(), '2');
    });

    it('test print fires the real PowerShell print pipeline', async () => {
        await $('[data-testid="test-receipt"]').click();
        const testMsg = await $('[data-testid="toast-success"]');
        await testMsg.waitForDisplayed({ timeout: 30000 });
        assert.match(await testMsg.getText(), /Test print sent/i);
    });

    it('receipt design: live preview renders and toggles update it', async () => {
        await $('[data-testid="tab-receipt"]').click();

        const preview = await $('[data-testid="receipt-preview"]');
        await preview.waitForDisplayed({ timeout: 30000 });

        // The live preview must actually render the template (the hidden class
        // is overridden). getText() returns '' for hidden nodes, so an empty
        // string here means the preview CSS override is broken.
        const text = await preview.getText();
        assert.ok(text.includes('PAYMENT RECEIPT'), `Preview should render the receipt header, got: "${text}"`);
        assert.ok(text.includes('ORD:'), 'ORDER NO. should be visible by default');

        // Toggling "Order number" off removes the line from the live preview.
        const orderNoToggle = await $('[data-testid="toggle-receipt-showOrderNo"]');
        assert.strictEqual(await orderNoToggle.getAttribute('aria-checked'), 'true');
        await orderNoToggle.click();
        await browser.waitUntil(
            async () => !(await preview.getText()).includes('ORD:'),
            { timeout: 5000, timeoutMsg: 'ORDER NO. should disappear when toggled off' }
        );
        assert.strictEqual(await orderNoToggle.getAttribute('aria-checked'), 'false');

        // And back on again.
        await orderNoToggle.click();
        await browser.waitUntil(
            async () => (await preview.getText()).includes('ORD:'),
            { timeout: 5000, timeoutMsg: 'ORDER NO. should reappear when toggled on' }
        );
    });

    it('kot design: live preview renders', async () => {
        await $('[data-testid="tab-kot"]').click();
        const preview = await $('[data-testid="kot-preview"]');
        await preview.waitForDisplayed({ timeout: 30000 });
        const text = await preview.getText();
        assert.ok(text.includes('KOT'), `KOT preview should render the KOT header, got: "${text}"`);
    });

    it('dr design: live preview renders and shows customer details', async () => {
        await $('[data-testid="tab-dr"]').click();
        const preview = await $('[data-testid="dr-preview"]');
        await preview.waitForDisplayed({ timeout: 30000 });

        const text = await preview.getText();
        assert.ok(text.includes('DELIVERY RECEIPT'), `DR preview should render the delivery receipt header, got: "${text}"`);
        assert.ok(text.includes('CUSTOMER:'), 'DR preview should render customer details by default');

        // Toggling "Delivery address" off removes the address from the preview.
        const addrToggle = await $('[data-testid="toggle-dr-showDeliveryAddress"]');
        assert.strictEqual(await addrToggle.getAttribute('aria-checked'), 'true');
        await addrToggle.click();
        await browser.waitUntil(
            async () => !(await preview.getText()).includes('ADDRESS:'),
            { timeout: 5000, timeoutMsg: 'Delivery address should disappear when toggled off' }
        );
        assert.strictEqual(await addrToggle.getAttribute('aria-checked'), 'false');

        // And back on again.
        await addrToggle.click();
        await browser.waitUntil(
            async () => (await preview.getText()).includes('ADDRESS:'),
            { timeout: 5000, timeoutMsg: 'Delivery address should reappear when toggled on' }
        );
    });

    it('save persists the settings', async () => {
        await $('[data-testid="tab-printers"]').click();
        await $('[data-testid="save-print-settings"]').click();
        const msg = await $('[data-testid="toast-success"]');
        await msg.waitForDisplayed({ timeout: 30000 });
        assert.match(await msg.getText(), /Print settings saved/i);
    });
});
