import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('should load landing page with title and key content', async ({ page }) => {
    await page.goto('/dashboard/');
    // Wait for the page to fully render
    await page.waitForLoadState('networkidle');

    // Check that the page has visible heading content about market making
    await expect(page.locator('h1')).toBeVisible();
    const h1Text = await page.locator('h1').innerText();
    expect(h1Text.toLowerCase()).toContain('polymarket');

    // Verify the tagline / subtitle is visible
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('CashClaw');
  });

  test('should have a visible pricing section on the landing page', async ({ page }) => {
    await page.goto('/dashboard/');
    await page.waitForLoadState('networkidle');

    // Scroll down to find pricing section
    const pricingSection = page.locator('text=Pricing').first();
    await pricingSection.scrollIntoViewIfNeeded();
    await expect(pricingSection).toBeVisible();

    // Verify that "See full pricing details" link exists
    const pricingLink = page.getByText('See full pricing details');
    await pricingLink.scrollIntoViewIfNeeded();
    await expect(pricingLink).toBeVisible();
  });

  test('should have a "View Pricing" button in the hero section', async ({ page }) => {
    await page.goto('/dashboard/');
    await page.waitForLoadState('networkidle');

    const viewPricingButton = page.getByText('View Pricing');
    await expect(viewPricingButton).toBeVisible();
  });
});
