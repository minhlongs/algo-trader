# Accessibility Testing Strategy

## Overview

This document describes the accessibility (a11y) testing approach for the @mekong/algo-trader project. The primary focus is on the **dashboard** application (`dashboard/`), which is the primary customer-facing web UI. The backend (`src/`) is a CLI + API server with no browser-rendered UI and thus has minimal a11y surface.

## Tooling

| Tool | Status | Purpose |
|------|--------|---------|
| `axe-core` CLI | Not installed | Manual / CI audit of rendered pages |
| `@axe-core/playwright` | Not installed | Automated a11y assertions in E2E tests |
| `vitest` coverage (v8) | Configured | Detect untested UI branches via coverage gaps |

### Installation notes

To enable automated axe checks:

```bash
npm install -D @axe-core/playwright
# or
pnpm add -D @axe-core/playwright
```

The `axe` CLI can be installed globally for quick ad-hoc checks:

```bash
npm install -g @axe-core/cli
# then
axe http://localhost:5173 --exit
```

## Test Strategy (Dashboard only)

The dashboard (`dashboard/`) uses Vitest with jsdom and `@testing-library/react`. Axe assertions should be added to the existing component tests following this pattern:

```ts
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MyComponent } from './MyComponent';

expect.extend(toHaveNoViolations);

it('has no accessibility violations', async () => {
  const { container } = render(<MyComponent />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

### Priority pages for a11y coverage

1. Login / Signup flows (critical for onboarding)
2. Dashboard overview (stats row, charts)
3. Marketplace (strategy listing cards)
4. Settings page (form controls)
5. Live Trading page (real-time status indicators)
6. Pricing page (tier comparison cards)

### WCAG targets

- **Level**: AA (minimum)
- **Key checks**:
  - Color contrast (4.5:1 for normal text, 3:1 for large)
  - Keyboard navigation (all interactive elements reachable via Tab)
  - ARIA labels on icons and interactive controls
  - Focus indicators (visible focus ring on all interactive elements)
  - Form inputs associated with labels
  - Heading hierarchy (h1 -> h2 -> h3, no skips)

## Backend (src/)

The backend is a Node.js CLI and Express API server. Accessibility concerns are limited to:

- API error messages (clear, human-readable JSON)
- CLI help output (well-formatted, readable at any terminal width)
- Log output contrast (avoid red-only severity indicators)

No axe automation needed for backend.

## Coverage alignment

Coverage thresholds (80% branches/functions/lines/statements) are configured in `vitest.config.ts` at the project root. When adding a11y assertions to component tests, ensure the test file is included in the coverage run. Dashboard tests have their own vitest config (`dashboard/vitest.config.ts`) and should be covered separately.

## Future roadmap

1. Integrate `@axe-core/playwright` into E2E test suite (Playwright)
2. Add a11y CI gate (block PR if new violations found)
3. Run lighthouse-ci on production dashboard URL
4. Add keyboard-navigation smoke tests
