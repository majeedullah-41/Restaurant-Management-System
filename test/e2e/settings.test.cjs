const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');

// Same native-setter approach for React-controlled text/number inputs.
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
 * End-to-end Settings test: navigates the settings inner-sidebar tabs and
 * verifies saving general preferences persists through the UI into the
 * isolated test DB.
 *
 * Run with: npm run test:e2e
 */
describe('RMS Settings E2E Test', () => {
    let db;

    before(async () => {
        const dbPath = process.env.E2E_DB_PATH || path.resolve(__dirname, '../../test.db');
        db = new Database(dbPath);
    });

    after(() => {
        db.close();
    });

    it('logs in (if needed) and opens Settings', async () => {
        const emailField = await $$('#email');
        if (emailField.length > 0) {
            await emailField[0].waitForDisplayed({ timeout: 30000 });
            await emailField[0].setValue('admin@restaurant.com');
            await $('#password').setValue('admin123');
            await $('button=LOGIN').click();
        }

        const posNav = await $('button=POS / New Order');
        await posNav.waitForDisplayed({ timeout: 30000 });

        await $('button=Settings').click();
        const generalTab = await $('button=General Preferences');
        await generalTab.waitForDisplayed({ timeout: 30000 });
    });

    it('navigates every settings inner-sidebar tab', async () => {
        const tabs = [
            ['General Preferences', 'h2=General Preferences'],
            ['Order Requirements', 'h2=Order Entry Requirements'],
            ['Printing & Receipts', '[data-testid="print-settings-section"]'],
            ['Delivery Settings', 'h2=Delivery Configuration'],
            ['Backup & Restore', 'h2=Backup & Data Preservation'],
            ['Data Migration', 'h2*=Data Migration'],
            ['License Information', 'h2=License Information'],
        ];

        for (const [tabLabel, contentSelector] of tabs) {
            await $(`button=${tabLabel}`).click();
            const content = await $(contentSelector);
            await content.waitForDisplayed({ timeout: 30000 });
        }
    });

    it('saves general preferences and verifies the DB was updated', async () => {
        await $('button=General Preferences').click();
        const nameInput = await $('[data-testid="restaurant-name-input"]');
        await nameInput.waitForDisplayed({ timeout: 30000 });

        // Change the restaurant name (general prefs are pre-filled from get_settings).
        await setNativeValue('[data-testid="restaurant-name-input"]', 'E2E Test Restaurant');
        await $('[data-testid="save-settings-btn"]').click();

        const message = await $('[data-testid="toast-success"]');
        await message.waitForDisplayed({ timeout: 30000 });
        assert.match(await message.getText(), /Settings saved successfully/i);

        // The critical backend assertion: the new value is persisted.
        const settings = db.prepare('SELECT restaurant_name FROM restaurant_settings WHERE id = 1').get();
        assert.strictEqual(settings.restaurant_name, 'E2E Test Restaurant');

        // Restore the seeded name so other specs see the expected restaurant.
        await setNativeValue('[data-testid="restaurant-name-input"]', 'Test Restaurant');
        await $('[data-testid="save-settings-btn"]').click();
        await browser.waitUntil(
            () => db.prepare('SELECT restaurant_name FROM restaurant_settings WHERE id = 1').get().restaurant_name === 'Test Restaurant',
            { timeout: 30000, timeoutMsg: 'Restaurant name was not restored' }
        );
    });
});