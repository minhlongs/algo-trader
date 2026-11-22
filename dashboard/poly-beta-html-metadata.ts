/**
 * Build-time HTML metadata transform for `VITE_APP_MODE === 'poly-beta'`.
 *
 * Replaces commercial CashClaw pricing/CLOB-trading meta tags and JSON-LD with
 * truthful Paper-Only simulation disclosures when building the isolated
 * `poly-beta-dashboard` bundle, leaving the standard CashClaw build unchanged.
 */

export const POLY_BETA_INDEX_HTML = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Poly Bot vNext — Private Paper Beta ($100 Virtual Balance, No Real Money)</title>
  <meta name="description" content="Private Paper-Only Polymarket simulation pilot with a $100 virtual starting balance. No real-money deposits, no real orders, no custody, no promised profit, and no live-trading feature enabled." />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />

  <!-- OpenGraph -->
  <meta property="og:site_name" content="Poly Bot vNext · Paper Beta" />
  <meta property="og:title" content="Poly Bot vNext — Private Paper Beta ($100 Virtual Balance)" />
  <meta property="og:description" content="Isolated Paper-Only simulation ($100 virtual starting balance, $0 real funds). No real-money deposits, no real orders, no custody, no promised profit, and LIVE_TRADING_ENABLED=false." />
  <meta property="og:type" content="website" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Poly Bot vNext — Private Paper Beta ($100 Virtual Balance)" />
  <meta name="twitter:description" content="Paper-Only simulation pilot ($100 virtual starting balance). No real-money deposits, no real orders, no custody, no promised profit, and no live-trading feature enabled." />

  <!-- JSON-LD Structured Data (Paper-Only Simulation Disclosure) -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Poly Bot vNext Paper Beta",
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Web",
    "isAccessibleForFree": true,
    "description": "Private Paper-Only simulation harness with a $100 virtual starting balance. No real-money deposits, no real orders, no custody of funds, no promised profit, and no live-trading feature enabled (LIVE_TRADING_ENABLED=false).",
    "offers": {
      "@type": "Offer",
      "name": "Private Paper Pilot (Virtual Balance Only)",
      "price": "0",
      "priceCurrency": "USD",
      "description": "$100 virtual starting balance ($0 real monetary value). No paid plans, no deposits, no real orders, no custody, no promised profit, and no live-trading feature enabled."
    }
  }
  </script>
</head>
<body class="bg-bg text-white">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
`;

export function transformDashboardHtmlForMode(html: string, appMode: string | undefined): string {
  return appMode === 'poly-beta' ? POLY_BETA_INDEX_HTML : html;
}
