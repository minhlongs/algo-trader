import { test, expect } from '@playwright/test';

test.describe('Enterprise Page', () => {
  test('should load enterprise page and show tab navigation', async ({ page }) => {
    await page.goto('/dashboard/enterprise');
    await page.waitForLoadState('networkidle');

    // Tab navigation visible
    await expect(page.getByText('Pricing').first()).toBeVisible();
    await expect(page.getByText('Contact').first()).toBeVisible();
    await expect(page.getByText('Success').first()).toBeVisible();
  });

  test('should show enterprise plan cards (Pro, Enterprise, Master)', async ({ page }) => {
    await page.goto('/dashboard/enterprise');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Pro', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Enterprise', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Master', { exact: true }).first()).toBeVisible();
  });

  test('should display enterprise plan prices', async ({ page }) => {
    await page.goto('/dashboard/enterprise');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('$99 / mo').first()).toBeVisible();
    await expect(page.getByText('$299 / mo').first()).toBeVisible();
    await expect(page.getByText('$999 / mo').first()).toBeVisible();
  });

  test('should switch to Contact tab and show form fields', async ({ page }) => {
    await page.goto('/dashboard/enterprise');
    await page.waitForLoadState('networkidle');

    await page.getByText('Contact').first().click();

    await expect(page.getByText('Talk to our team').first()).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#contactName')).toBeVisible();
    await expect(page.locator('#companyName')).toBeVisible();
    await expect(page.locator('#useCase')).toBeVisible();
    await expect(page.getByText('Request enterprise access')).toBeVisible();
  });
});
