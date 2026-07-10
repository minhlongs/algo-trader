import { test, expect, devices } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load landing page with heading and brand', async ({ page }) => {
    await page.goto('/dashboard/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('h1')).toBeVisible();
    const h1Text = await page.locator('h1').innerText();
    expect(h1Text).toContain('Solo Quant Desk');
  });

  test('should show CashClaw link in navigation', async ({ page }) => {
    await page.goto('/dashboard/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: 'CashClaw' }).first()).toBeVisible();
  });

  test('should have external links to docs and repo', async ({ page }) => {
    await page.goto('/dashboard/');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /Read Manifesto/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /View Source/i }).first()).toBeVisible();
  });

  test('should render correctly on mobile viewport', async ({ page }) => {
    await page.setViewportSize(devices['Pixel 5'].viewport);
    await page.goto('/dashboard/');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toBeEmpty();
    await expect(page.getByRole('link', { name: 'CashClaw' }).first()).toBeVisible();
  });
});
