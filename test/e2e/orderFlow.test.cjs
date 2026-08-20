const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');

// The tauri-plugin-wdio-webdriver elementClick runs a programmatic el.click()
// on the matched <option>, which native <option> elements ignore — so WebdriverIO's
// selectByVisibleText/selectByIndex leave React's select unchanged. Set the value
// through the native setter and dispatch a bubbling change event instead.
async function selectOption(selectIndex, text) {
    await browser.execute(
        (idx, optText) => {
            const select = document.querySelectorAll('select')[idx];
            const option = Array.from(select.options).find((o) => o.textContent.trim() === optText);
            if (!option) throw new Error(`option "${optText}" not found in select[${idx}]`);
            const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
            setter.call(select, option.value);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        },
        selectIndex,
        text
    );
}

/**
 * End-to-end order flow against the running desktop app (rms.exe).
 *
 * Prerequisites:
 *  1. A built app binary: `npm run tauri build` (release) or `-- --debug`
 *     (D:\RustTarget\release\rms.exe / D:\RustTarget\debug\rms.exe, or RMS_EXE)
 *  2. msedgedriver.exe matching the installed Edge, at the repo root
 *  3. A valid license seeded by setup.cjs (requires scripts/.keys/private_key.pem)
 *  4. The app under test runs against an ISOLATED database (DB_PATH env set by
 *     wdio.conf.cjs) so it never touches the live store DB — any running RMS
 *     instance is safe to leave open.
 *
 * Run with: npm run test:e2e
 *
 * Store-DB safety: `npm run pretest:e2e` snapshots the live store DB
 * (%LOCALAPPDATA%\RMS\local.db) and `npm run posttest:e2e` kills any autonomous
 * WebDriver process left behind and restores the store DB from that snapshot
 * (see scripts/watchdog.cjs). The watchdog also refuses to start the suite while
 * the store DB is threatened.
 */
describe('RMS Order Flow E2E Test', () => {
    let db;

    before(async () => {
        const dbPath = process.env.E2E_DB_PATH || path.resolve(__dirname, '../../test.db');
        db = new Database(dbPath);
    });

    after(() => {
        db.close();
    });

    it('should login, create a dine-in order on table 1, add items, and checkout', async () => {
        // 1. Authentication (admin@restaurant.com credentials seeded by setup.cjs).
        //    The tauri-service reuses a single app instance across all specs, so
        //    the app may already be authenticated (logged in by an earlier spec
        //    in the same suite). Only show the login form when it is present.
        const emailField = await $$('#email');
        if (emailField.length > 0) {
            await emailField[0].waitForDisplayed({ timeout: 30000 });
            await emailField[0].setValue('admin@restaurant.com');
            await $('#password').setValue('admin123');
            await $('button=LOGIN').click();
        }

        // Wait for the admin layout (sidebar "POS / New Order" is admin-only)
        const posNav = await $('button=POS / New Order');
        await posNav.waitForDisplayed({ timeout: 30000 });

        // 2. Open POS (new order, no table yet)
        await posNav.click();
        const orderSummary = await $('h2=Order Summary');
        await orderSummary.waitForDisplayed({ timeout: 30000 });

        // 3. Assign table 1 (seeded as "Main 1"). Selecting it navigates to
        //    /admin/pos/1/new and re-initializes the POS. Select order in the
        //    DOM: [0]=sort, [1]=order type, [2]=order taker, [3]=table.
        const tableSelect = await $$('select')[3];
        await tableSelect.waitForDisplayed({ timeout: 30000 });
        await selectOption(3, 'Main 1');

        // Wait for the POS to finish re-initializing for table 1.
        await browser.waitUntil(
            async () => {
                const url = await browser.getUrl();
                const v = await $$('select')[3].getValue();
                return url.includes('/pos/1/') && v === '1';
            },
            { timeout: 30000, timeoutMsg: 'POS did not switch to table 1' }
        );

        // 4. Select the order taker. Dine-in orders refuse to add items until a
        //    table AND an order taker are chosen.
        await selectOption(2, 'admin');

        // 5. Add items: 2x Burger, 1x Coke (item cards in the left grid).
        const burger = await $('h3=Burger');
        await burger.waitForDisplayed({ timeout: 30000 });
        await burger.click();
        await burger.click();

        const coke = await $('h3=Coke');
        await coke.waitForDisplayed({ timeout: 30000 });
        await coke.click();

        // 6. Complete payment (exact amount, no cash change).
        const completeBtn = await $('#complete-payment-btn');
        await completeBtn.waitForEnabled({ timeout: 30000 });
        await completeBtn.click();

        // After checkout the order is Closed. The app also triggers a receipt
        // print (native print dialog, not webdriver-controllable) and tries to
        // reset to /pos/0 — the DB is the source of truth, so poll it here.
        await browser.waitUntil(
            () => {
                const row = db.prepare('SELECT status FROM orders ORDER BY id DESC LIMIT 1').get();
                return row && row.status === 'Closed';
            },
            { timeout: 30000, timeoutMsg: 'Order was not closed after checkout' }
        );

        // 7. Database verification (the critical backend assertion)
        const orderRow = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
        assert.ok(orderRow, 'Order should exist in DB');
        assert.strictEqual(orderRow.status, 'Closed', 'Order status should be Closed');
        assert.strictEqual(orderRow.table_number, 1, 'Table number should be 1');
        assert.strictEqual(orderRow.subtotal, 350.0, 'Subtotal should be 150*2 + 50 = 350');

        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderRow.id);
        assert.strictEqual(items.length, 2, 'Should have 2 distinct items (Burger, Coke)');

        const burgerRow = items.find(i => i.name === 'Burger');
        const cokeRow = items.find(i => i.name === 'Coke');
        assert.ok(burgerRow, 'Burger item should exist');
        assert.ok(cokeRow, 'Coke item should exist');
        assert.strictEqual(burgerRow.quantity, 2, 'Burger quantity should be 2');
        assert.strictEqual(cokeRow.quantity, 1, 'Coke quantity should be 1');

        const tableStatus = db.prepare('SELECT status FROM table_status WHERE table_number = 1').get();
        assert.strictEqual(tableStatus.status, 'Available', 'Table 1 should be Available again');
    });
});
