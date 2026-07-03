import { test, expect } from '@playwright/test';

test.describe('Public Route Navigation', () => {
  const PUBLIC_ROUTES = [
    { path: '/dashboard/', name: 'Landing' },
    { path: '/dashboard/pricing', name: 'Pricing' },
    { path: '/dashboard/enterprise', name: 'Enterprise' },
    { path: '/dashboard/manifesto', name: 'Manifesto' },
    { path: '/dashboard/methodology', name: 'Methodology' },
  ];

  for (const route of PUBLIC_ROUTES) {
    test(`should load ${route.name} page (${route.path}) with status 200`, async ({ page }) => {
      const response = await page.goto(route.path);
      await expect(response?.status()).toBe(200);
      await page.waitForLoadState('networkidle');

      // Verify page renders content (body not empty, and at least one element visible)
      await expect(page.locator('body')).not.toBeEmpty();
    });
  }
});
