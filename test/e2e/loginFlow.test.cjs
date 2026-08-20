const assert = require('assert');

/**
 * End-to-end login & access-control test against the running desktop app.
 *
 * Covers: rejected credentials, a successful admin login, and the operator
 * restriction that a cashier role cannot see or reach admin-only navigation.
 * Leaves the shared app instance logged in as admin so later specs (which all
 * carry the `$$('#email')` guard) can skip re-authentication.
 *
 * Run with: npm run test:e2e
 */
describe('RMS Login & Access Control E2E Test', () => {
    it('rejects a wrong password with an error message', async () => {
        // The app may already be authenticated (shared instance). Log out to
        // reach the login form before testing a failed attempt.
        const emailField = await $$('#email');
        if (emailField.length === 0) {
            await $('button=Logout').click();
            await $('#email').waitForDisplayed({ timeout: 30000 });
        }

        await $('#email').setValue('admin@restaurant.com');
        await $('#password').setValue('wrong-password');
        await $('button=LOGIN').click();

        const error = await $('[data-testid="login-error"]');
        await error.waitForDisplayed({ timeout: 30000 });
        assert.strictEqual(await error.getText(), 'Invalid email or password');
    });

    it('logs in as admin and reaches the admin dashboard', async () => {
        await $('#email').setValue('admin@restaurant.com');
        await $('#password').setValue('admin123');
        await $('button=LOGIN').click();

        const posNav = await $('button=POS / New Order');
        await posNav.waitForDisplayed({ timeout: 30000 });
        const menuMgmt = await $('button=Menu Management');
        assert.ok(await menuMgmt.isDisplayed(), 'Admin should see the Menu Management nav item');
    });

    it('operator restriction: cashier sees only cashier pages', async () => {
        // Log out the admin session.
        await $('button=Logout').click();
        await $('#email').waitForDisplayed({ timeout: 30000 });

        // Log in as the seeded cashier.
        await $('#email').setValue('cashier@restaurant.com');
        await $('#password').setValue('cashier123');
        await $('button=LOGIN').click();

        const cashierHeader = await $('h1=Cashier Dashboard');
        await cashierHeader.waitForDisplayed({ timeout: 30000 });

        // Admin-only navigation must NOT be rendered for a cashier.
        for (const adminLabel of ['Menu Management', 'Settings', 'Staff Management', 'Payroll', 'Reports']) {
            const nav = await $(`button=${adminLabel}`);
            assert.strictEqual(await nav.isExisting(), false, `Cashier must not see "${adminLabel}"`);
        }

        // Cashier-appropriate navigation is present.
        assert.ok(await $('button=Order History').isExisting(), 'Cashier should see Order History');
        assert.ok(await $('button=POS / New Order').isExisting(), 'Cashier should see POS / New Order');
    });

    it('restores the admin session for the remaining specs', async () => {
        await $('button=Logout').click();
        await $('#email').waitForDisplayed({ timeout: 30000 });

        await $('#email').setValue('admin@restaurant.com');
        await $('#password').setValue('admin123');
        await $('button=LOGIN').click();

        await $('button=POS / New Order').waitForDisplayed({ timeout: 30000 });
    });
});