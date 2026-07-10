import { test, expect } from '@playwright/test';

test.describe('Pricing Page', () => {
  test('should load the pricing page and show plan tiers', async ({ page }) => {
    await page.goto('/dashboard/pricing');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Free', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Pro', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Enterprise', { exact: true }).first()).toBeVisible();
  });

  test('should display pricing amounts for tiers', async ({ page }) => {
    await page.goto('/dashboard/pricing');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('$0').first()).toBeVisible();
    await expect(page.getByText('$49').first()).toBeVisible();
    await expect(page.getByText('$199').first()).toBeVisible();
  });

  test('should have CTA link on the Pro (highlighted) tier', async ({ page }) => {
    await page.goto('/dashboard/pricing');
    await page.waitForLoadState('networkidle');

    const proCta = page.locator('a[href*="signup?tier=pro"]').first();
    await expect(proCta).toBeVisible();
  });

  test('should have FAQ section', async ({ page }) => {
    await page.goto('/dashboard/pricing');
    await page.waitForLoadState('networkidle');

    const faqButtons = page.locator('button:has(svg polyline)');
    const count = await faqButtons.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
