const assert = require('assert');
const Database = require('better-sqlite3');
const path = require('path');

describe('RMS Order Flow E2E Test', () => {
    let db;
    
    before(async () => {
        // Connect to test.db for direct assertions
        const dbPath = path.resolve(__dirname, '../../test.db');
        db = new Database(dbPath);
    });
    
    after(() => {
        db.close();
    });

    it('should login, create an order, add items, and checkout', async () => {
        // 1. Authentication
        const usernameInput = await $('input[type="text"]');
        const passwordInput = await $('input[type="password"]');
        const loginBtn = await $('button=Login');
        
        await usernameInput.waitForDisplayed({ timeout: 15000 });
        await usernameInput.setValue('admin');
        await passwordInput.setValue('admin123');
        await loginBtn.click();
        
        // Wait for dashboard to load (look for "Dashboard" header or POS link)
        const posLink = await $('a[href="/pos"]');
        await posLink.waitForDisplayed({ timeout: 10000 });
        
        // 2. Order Initialization
        await posLink.click();
        
        // Wait for Tables view
        const table1 = await $('div=1'); // Table 1 box
        await table1.waitForDisplayed({ timeout: 10000 });
        await table1.click();
        
        // Wait for POS Menu view
        const burgerBtn = await $('h3=Burger');
        await burgerBtn.waitForDisplayed({ timeout: 10000 });
        
        // 3. Cart Management
        // Add 2 Burgers, 1 Coke
        await burgerBtn.click();
        await burgerBtn.click();
        
        const cokeBtn = await $('h3=Coke');
        await cokeBtn.click();
        
        // Verify cart UI (Optional, but good practice)
        const checkoutBtn = await $('button=Checkout');
        await checkoutBtn.waitForDisplayed();
        
        // 4. Checkout Process
        await checkoutBtn.click();
        
        // Wait for Checkout Modal
        const amountReceivedInput = await $('input[type="number"]');
        await amountReceivedInput.waitForDisplayed({ timeout: 5000 });
        
        // Clear and set amount
        await amountReceivedInput.click();
        // Since React might overwrite, just set the value high enough to cover 350
        await amountReceivedInput.setValue('1000');
        
        // Click Complete Payment
        const completePaymentBtn = await $('button=Complete Payment');
        await completePaymentBtn.click();
        
        // Wait for receipt modal or return to tables
        const printBtn = await $('button=Print Receipt');
        await printBtn.waitForDisplayed({ timeout: 5000 });
        
        // Click New Order to return to Tables
        const newOrderBtn = await $('button=New Order');
        await newOrderBtn.click();
        
        // 5. Database Verification (The critical backend test)
        // Verify orders table
        const orderRow = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 1').get();
        assert.ok(orderRow, 'Order should exist in DB');
        assert.strictEqual(orderRow.status, 'Closed', 'Order status should be Closed');
        assert.strictEqual(orderRow.table_number, 1, 'Table number should be 1');
        assert.strictEqual(orderRow.subtotal, 350.0, 'Subtotal should be 150*2 + 50 = 350');
        
        // Verify order_items table
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderRow.id);
        assert.strictEqual(items.length, 2, 'Should have 2 distinct items (Burger, Coke)');
        
        const burger = items.find(i => i.name === 'Burger');
        const coke = items.find(i => i.name === 'Coke');
        assert.strictEqual(burger.quantity, 2, 'Burger quantity should be 2');
        assert.strictEqual(coke.quantity, 1, 'Coke quantity should be 1');
        
        // Verify table_status table
        const tableStatus = db.prepare('SELECT status FROM table_status WHERE table_number = 1').get();
        assert.strictEqual(tableStatus.status, 'Available', 'Table 1 should be Available again');
    });
});
