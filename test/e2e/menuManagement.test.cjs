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
 * End-to-end Menu Management test: category + menu item CRUD against the real
 * app (rms.exe) on the isolated test DB. Verifies each action through the UI
 * AND through the database (the critical backend assertion).
 *
 * Run with: npm run test:e2e
 */
describe('RMS Menu Management E2E Test', () => {
    let db;

    before(async () => {
        const dbPath = process.env.E2E_DB_PATH || path.resolve(__dirname, '../../test.db');
        db = new Database(dbPath);
    });

    after(() => {
        db.close();
    });

    it('logs in (if needed) and opens Menu Management', async () => {
        const emailField = await $$('#email');
        if (emailField.length > 0) {
            await emailField[0].waitForDisplayed({ timeout: 30000 });
            await emailField[0].setValue('admin@restaurant.com');
            await $('#password').setValue('admin123');
            await $('button=LOGIN').click();
        }

        const posNav = await $('button=POS / New Order');
        await posNav.waitForDisplayed({ timeout: 30000 });

        await $('button=Menu Management').click();
        const addCatBtn = await $('[data-testid="add-category-btn"]');
        await addCatBtn.waitForDisplayed({ timeout: 30000 });
    });

    it('adds a category', async () => {
        await $('[data-testid="add-category-btn"]').click();
        await $('[data-testid="category-name-input"]').waitForDisplayed({ timeout: 30000 });
        await setNativeValue('[data-testid="category-name-input"]', 'E2E Test Category');
        await $('[data-testid="save-category-btn"]').click();

        // Wait for the modal to close and the new category to be in the DB.
        await browser.waitUntil(
            () => !!db.prepare('SELECT id FROM categories WHERE name = ?').get('E2E Test Category'),
            { timeout: 30000, timeoutMsg: 'Category was not persisted to the DB' }
        );

        const cat = db.prepare('SELECT * FROM categories WHERE name = ?').get('E2E Test Category');
        const nameEl = await $(`[data-testid="category-name-${cat.id}"]`);
        await nameEl.waitForDisplayed({ timeout: 30000 });
        assert.strictEqual(await nameEl.getText(), 'E2E Test Category');
    });

    it('adds a menu item into the new category', async () => {
        await $('[data-testid="add-item-btn"]').click();
        await $('[data-testid="item-name-input"]').waitForDisplayed({ timeout: 30000 });

        await setNativeValue('[data-testid="item-name-input"]', 'E2E Test Burger');
        await selectOption('[data-testid="item-category-select"]', 'E2E Test Category');
        await setNativeValue('[data-testid="item-price-input"]', '199.5');
        await $('[data-testid="save-item-btn"]').click();

        await browser.waitUntil(
            () => {
                const item = db.prepare('SELECT * FROM menu_items WHERE name = ?').get('E2E Test Burger');
                return item && item.price === 199.5;
            },
            { timeout: 30000, timeoutMsg: 'Menu item was not persisted to the DB' }
        );

        const item = db.prepare('SELECT * FROM menu_items WHERE name = ?').get('E2E Test Burger');
        const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get('E2E Test Category');
        assert.strictEqual(item.category_id, cat.id, 'Item should belong to the new category');

        const row = await $(`[data-testid="item-row-${item.id}"]`);
        await row.waitForDisplayed({ timeout: 30000 });
        assert.ok((await row.getText()).includes('E2E Test Burger'));
        assert.ok((await row.getText()).includes('199.50') || (await row.getText()).includes('199.5'));
    });

    it('edits the menu item price', async () => {
        const before = db.prepare('SELECT * FROM menu_items WHERE name = ?').get('E2E Test Burger');
        await $(`[data-testid="edit-item-${before.id}"]`).click();
        await $('[data-testid="item-name-input"]').waitForDisplayed({ timeout: 30000 });

        await setNativeValue('[data-testid="item-price-input"]', '250');
        await $('[data-testid="save-item-btn"]').click();

        await browser.waitUntil(
            () => {
                const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(before.id);
                return item && item.price === 250;
            },
            { timeout: 30000, timeoutMsg: 'Item price was not updated in the DB' }
        );
    });

    it('toggles the item availability', async () => {
        const before = db.prepare('SELECT * FROM menu_items WHERE name = ?').get('E2E Test Burger');
        assert.strictEqual(before.is_active, 1);

        await $(`[data-testid="toggle-item-${before.id}"]`).click();
        await browser.waitUntil(
            () => {
                const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(before.id);
                return item && item.is_active === 0;
            },
            { timeout: 30000, timeoutMsg: 'Item should be deactivated after toggle' }
        );

        await $(`[data-testid="toggle-item-${before.id}"]`).click();
        await browser.waitUntil(
            () => {
                const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(before.id);
                return item && item.is_active === 1;
            },
            { timeout: 30000, timeoutMsg: 'Item should be reactivated after toggle' }
        );
    });

    it('deletes the menu item', async () => {
        const item = db.prepare('SELECT * FROM menu_items WHERE name = ?').get('E2E Test Burger');
        await $(`[data-testid="delete-item-${item.id}"]`).click();
        await $('[data-testid="confirm-ok-btn"]').waitForDisplayed({ timeout: 30000 });
        await $('[data-testid="confirm-ok-btn"]').click();

        await browser.waitUntil(
            () => !db.prepare('SELECT id FROM menu_items WHERE id = ?').get(item.id),
            { timeout: 30000, timeoutMsg: 'Item was not deleted from the DB' }
        );
    });

    it('deletes the category (must be empty first)', async () => {
        const cat = db.prepare('SELECT * FROM categories WHERE name = ?').get('E2E Test Category');
        const itemCount = db.prepare('SELECT COUNT(*) as c FROM menu_items WHERE category_id = ?').get(cat.id).c;
        assert.strictEqual(itemCount, 0, 'Category must have no items before deletion');

        // The category delete button is only visible on hover (group-hover:flex),
        // so drive it through the DOM directly.
        await browser.execute((id) => {
            document.querySelector(`[data-testid="delete-category-${id}"]`).click();
        }, cat.id);
        await $('[data-testid="confirm-ok-btn"]').waitForDisplayed({ timeout: 30000 });
        await $('[data-testid="confirm-ok-btn"]').click();

        await browser.waitUntil(
            () => !db.prepare('SELECT id FROM categories WHERE id = ?').get(cat.id),
            { timeout: 30000, timeoutMsg: 'Category was not deleted from the DB' }
        );
    });
});