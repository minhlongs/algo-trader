import { test, expect } from '@playwright/test';

test.describe('Enterprise Page', () => {
  test('should load enterprise page and show tab navigation', async ({ page }) => {
    await page.goto('/dashboard/enterprise');
    await page.waitForLoadState('networkidle');

    // Tab navigation should be visible with Pricing and Contact tabs
    const pricingTab = page.getByText('Pricing').first();
    await expect(pricingTab).toBeVisible();

    const contactTab = page.getByText('Contact').first();
    await expect(contactTab).toBeVisible();
  });

  test('should show enterprise plan cards (PRO, ENTERPRISE, MASTER)', async ({ page }) => {
    await page.goto('/dashboard/enterprise');
    await page.waitForLoadState('networkidle');

    // Enterprise plan cards should be visible
    await expect(page.getByText('PRO', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('ENTERPRISE', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('MASTER', { exact: true }).first()).toBeVisible();
  });

  test('should display enterprise plan prices', async ({ page }) => {
    await page.goto('/dashboard/enterprise');
    await page.waitForLoadState('networkidle');

    // Prices should be visible
    await expect(page.getByText('$99 / mo').first()).toBeVisible();
    await expect(page.getByText('$299 / mo').first()).toBeVisible();
    await expect(page.getByText('$999 / mo').first()).toBeVisible();
  });

  test('should switch to Contact tab and show form fields', async ({ page }) => {
    await page.goto('/dashboard/enterprise');
    await page.waitForLoadState('networkidle');

    // Click the Contact tab
    const contactTab = page.getByText('Contact').first();
    await contactTab.click();

    // After switching to Contact tab, the form heading should appear
    await expect(page.getByText('Talk to our team').first()).toBeVisible();

    // Form fields should be present
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#contactName')).toBeVisible();
    await expect(page.locator('#companyName')).toBeVisible();
    await expect(page.locator('#useCase')).toBeVisible();

    // Submit button should be visible
    await expect(page.getByText('Request enterprise access')).toBeVisible();
  });
});
