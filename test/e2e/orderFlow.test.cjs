const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');

/**
 * End-to-end order flow against the running desktop app (rms.exe).
 *
 * Prerequisites:
 *  1. `npm run build && npm run tauri build -- --debug` (or a debug build at
 *     D:\RustTarget\debug\rms.exe / RMS_EXE env override)
 *  2. msedgedriver.exe matching the installed Edge, at the repo root
 *  3. A valid license seeded by setup.cjs (requires scripts/.keys/private_key.pem)
 *  4. No other instance of rms.exe already running (file lock on local.db)
 *
 * Run with: npm run test:e2e
 */
describe('RMS Order Flow E2E Test', () => {
    let db;

    before(async () => {
        const dbPath = path.resolve(__dirname, '../../test.db');
        db = new Database(dbPath);
    });

    after(() => {
        db.close();
    });

    it('should login, create a dine-in order on table 1, add items, and checkout', async () => {
        // 1. Authentication (admin@restaurant.com credentials seeded by setup.cjs)
        const emailInput = await $('#email');
        const passwordInput = await $('#password');
        const loginBtn = await $('button=LOGIN');

        await emailInput.waitForDisplayed({ timeout: 30000 });
        await emailInput.setValue('admin');
        await passwordInput.setValue('admin123');
        await loginBtn.click();

        // Wait for the admin layout (sidebar "POS / New Order" is admin-only)
        const posNav = await $('button=POS / New Order');
        await posNav.waitForDisplayed({ timeout: 30000 });

        // 2. Open POS (new order, no table yet)
        await posNav.click();
        const orderSummary = await $('h2=Order Summary');
        await orderSummary.waitForDisplayed({ timeout: 30000 });

        // 3. Assign table 1 (seeded as "Main 01"). Selecting it navigates to
        //    /admin/pos/1/new and re-initializes the POS.
        const tableSelect = await $$('select')[0];
        await tableSelect.waitForDisplayed({ timeout: 30000 });
        await tableSelect.selectByVisibleText('Main 01');

        // Wait for the POS to finish re-initializing for table 1.
        await browser.waitUntil(
            async () => (await $$('select')[0].getValue()) === '1',
            { timeout: 30000, timeoutMsg: 'POS did not switch to table 1' }
        );

        // 4. Select the order taker. Dine-in orders refuse to add items until a
        //    table AND an order taker are chosen.
        const takerSelect = await $$('select')[2];
        await takerSelect.selectByVisibleText('admin');

        // 5. Add items: 2x Burger, 1x Coke
        await (await $('button=Add Item')).click();
        const selectItems = await $('h2=Select Items');
        await selectItems.waitForDisplayed({ timeout: 30000 });

        const burger = await $('h3=Burger');
        await burger.waitForDisplayed({ timeout: 30000 });
        await burger.click();
        await burger.click();

        const coke = await $('h3=Coke');
        await coke.waitForDisplayed({ timeout: 30000 });
        await coke.click();

        // 6. Back to payment view and complete payment (exact amount, no cash change)
        await (await $('button=Close Menu')).click();
        const completeBtn = await $('#complete-payment-btn');
        await completeBtn.waitForEnabled({ timeout: 30000 });
        await completeBtn.click();

        // After a successful checkout the POS navigates back to /pos/0 (~2s).
        await browser.waitUntil(
            async () => (await $$('select')[0].getValue()) === 'Walk-in Customer',
            { timeout: 30000, timeoutMsg: 'POS did not reset to walk-in after checkout' }
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
