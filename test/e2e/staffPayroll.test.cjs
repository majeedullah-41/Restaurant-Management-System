const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');

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
 * End-to-end Staff & Payroll test: register a staff member, clock them in/out
 * through the Attendance modal, and process a payroll payout — each verified
 * through the UI and the isolated test DB.
 *
 * Run with: npm run test:e2e
 */
describe('RMS Staff & Payroll E2E Test', () => {
    let db;

    before(async () => {
        const dbPath = process.env.E2E_DB_PATH || path.resolve(__dirname, '../../test.db');
        db = new Database(dbPath);
    });

    after(() => {
        db.close();
    });

    it('logs in (if needed) and opens Staff Management', async () => {
        const emailField = await $$('#email');
        if (emailField.length > 0) {
            await emailField[0].waitForDisplayed({ timeout: 30000 });
            await emailField[0].setValue('admin@restaurant.com');
            await $('#password').setValue('admin123');
            await $('button=LOGIN').click();
        }

        const posNav = await $('button=POS / New Order');
        await posNav.waitForDisplayed({ timeout: 30000 });

        await $('button=Staff Management').click();
        const addStaffBtn = await $('[data-testid="add-staff-btn"]');
        await addStaffBtn.waitForDisplayed({ timeout: 30000 });
    });

    it('registers a new staff member', async () => {
        await $('[data-testid="add-staff-btn"]').click();
        await $('[data-testid="staff-name-input"]').waitForDisplayed({ timeout: 30000 });

        await setNativeValue('[data-testid="staff-name-input"]', 'E2E Waiter');
        await selectOption('[data-testid="staff-category-select"]', 'Order Taker');
        await setNativeValue('[data-testid="staff-salary-input"]', '30000');
        await $('[data-testid="register-staff-btn"]').click();

        await browser.waitUntil(
            () => {
                const s = db.prepare('SELECT * FROM staff WHERE name = ?').get('E2E Waiter');
                return s && s.salary === 30000;
            },
            { timeout: 30000, timeoutMsg: 'Staff member was not persisted to the DB' }
        );

        const staff = db.prepare('SELECT * FROM staff WHERE name = ?').get('E2E Waiter');
        const row = await $(`[data-testid="staff-row-${staff.id}"]`);
        await row.waitForDisplayed({ timeout: 30000 });
        assert.ok((await row.getText()).includes('E2E Waiter'));
    });

    it('clocks the staff member in through the Attendance modal', async () => {
        const staff = db.prepare('SELECT * FROM staff WHERE name = ?').get('E2E Waiter');

        await $('[data-testid="attendance-btn"]').click();
        await $('[data-testid="clock-staff-select"]').waitForDisplayed({ timeout: 30000 });

        // Option text is rendered as "Name (Category)".
        await selectOption('[data-testid="clock-staff-select"]', 'E2E Waiter (Order Taker)');
        await $('[data-testid="clock-btn"]').click();

        // The Daily Log should show the record with a clock-in (no clock-out).
        await browser.waitUntil(
            () => {
                const rec = db.prepare(
                    'SELECT * FROM staff_attendance WHERE staff_id = ? AND clock_in IS NOT NULL AND clock_out IS NULL'
                ).get(staff.id);
                return !!rec;
            },
            { timeout: 30000, timeoutMsg: 'Staff clock-in was not recorded in the DB' }
        );

        // Dismiss the success AlertModal that appears after clocking in.
        await $('button=OK').waitForDisplayed({ timeout: 30000 });
        await $('button=OK').click();

        const record = await $(`[data-testid="attendance-record-${staff.id}"]`);
        await record.waitForDisplayed({ timeout: 30000 });
        assert.ok((await record.getText()).includes('In:'));
    });

    it('clocks the staff member out', async () => {
        const staff = db.prepare('SELECT * FROM staff WHERE name = ?').get('E2E Waiter');

        // The clock form resets after clock-in, so re-select the staff member.
        await selectOption('[data-testid="clock-staff-select"]', 'E2E Waiter (Order Taker)');
        await $('[data-testid="clock-btn"]').click();

        await browser.waitUntil(
            () => {
                const rec = db.prepare(
                    'SELECT * FROM staff_attendance WHERE staff_id = ? AND clock_out IS NOT NULL'
                ).get(staff.id);
                return !!rec;
            },
            { timeout: 30000, timeoutMsg: 'Staff clock-out was not recorded in the DB' }
        );

        // Dismiss the success AlertModal that appears after clocking out.
        await $('button=OK').waitForDisplayed({ timeout: 30000 });
        await $('button=OK').click();

        const record = await $(`[data-testid="attendance-record-${staff.id}"]`);
        await record.waitForDisplayed({ timeout: 30000 });
        assert.ok((await record.getText()).includes('Out:'));

        await $('[data-testid="attendance-close-btn"]').click();
        await $('[data-testid="add-staff-btn"]').waitForDisplayed({ timeout: 30000 });
    });

    it('processes payroll for the staff member', async () => {
        const staff = db.prepare('SELECT * FROM staff WHERE name = ?').get('E2E Waiter');

        // Expand the Payroll group and open Process Payroll.
        await $('button=Payroll').click();
        const processNav = await $('button=Process Payroll');
        await processNav.waitForDisplayed({ timeout: 30000 });
        await processNav.click();

        const processBtn = await $('[data-testid="process-payroll-btn"]');
        await processBtn.waitForDisplayed({ timeout: 30000 });

        // The payroll table lists every active staff member as Pending.
        const row = await $('tr*=E2E Waiter');
        await row.waitForDisplayed({ timeout: 30000 });
        const checkbox = await row.$('input[type="checkbox"]');
        await checkbox.click();

        // The process button is disabled until a record is selected.
        await processBtn.waitForEnabled({ timeout: 30000 });
        await processBtn.click();

        // Processing persists a salary payout and marks the record Paid.
        await browser.waitUntil(
            () => {
                const rec = db.prepare('SELECT * FROM payroll_records WHERE staff_id = ?').get(staff.id);
                const payout = db.prepare('SELECT * FROM salary_payouts WHERE staff_id = ?').get(staff.id);
                return rec && rec.status === 'Paid' && !!payout && payout.amount === 30000;
            },
            { timeout: 30000, timeoutMsg: 'Payroll payout was not recorded in the DB' }
        );

        const msg = await $('[data-testid="toast-success"]');
        await msg.waitForDisplayed({ timeout: 30000 });
        assert.match(await msg.getText(), /Processed/i);
    });
});