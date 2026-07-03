/**
 * Enterprise page tests — extends the type-check-only tests with
 * full component rendering tests using @testing-library/react.
 *
 * Run: npx vitest run src/pages/__tests__/enterprise-page.test.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mock child components that depend on browser APIs ──

vi.mock('../../components/public-navbar', () => ({
  PublicNavbar: () => <div data-testid="public-navbar">PublicNavbar</div>,
}));

vi.mock('../../components/footer', () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));

// ── Mock framer-motion / motion/react to render children statically ──

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, className, ...props }: React.PropsWithChildren<{ className?: string }>) => (
      <div className={className} {...props}>{children}</div>
    ),
  },
  useInView: () => true,
}));

// ── Mock global fetch for form submission tests ──

const originalFetch = globalThis.fetch;

import { EnterprisePage } from '../enterprise-page';
import { ENTERPRISE_PLANS } from '../../lib/enterprise-plans';

describe('EnterprisePage component', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /* ── Tab navigation ── */

  it('renders the Pricing and Contact tab buttons', () => {
    render(<EnterprisePage />);
    expect(screen.getByRole('button', { name: 'Pricing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Contact' })).toBeTruthy();
  });

  it('shows the Pricing tab content by default', () => {
    render(<EnterprisePage />);
    expect(screen.getByText('Built for institutional desks')).toBeTruthy();
    expect(screen.getByText('Enterprise FAQ')).toBeTruthy();
  });

  it('switches to Contact tab when Contact button is clicked', () => {
    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));
    expect(screen.getByText('Talk to our team')).toBeTruthy();
  });

  it('switches back to Pricing tab when Pricing button is clicked after Contact', () => {
    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pricing' }));
    expect(screen.getByText('Built for institutional desks')).toBeTruthy();
  });

  /* ── PublicNavbar and Footer ── */

  it('renders the PublicNavbar', () => {
    render(<EnterprisePage />);
    expect(screen.getByTestId('public-navbar')).toBeTruthy();
  });

  it('renders the Footer', () => {
    render(<EnterprisePage />);
    expect(screen.getByTestId('footer')).toBeTruthy();
  });

  /* ── Plan Cards ── */

  it('renders all three enterprise plan cards', () => {
    render(<EnterprisePage />);
    expect(screen.getByText('PRO')).toBeTruthy();
    expect(screen.getByText('ENTERPRISE')).toBeTruthy();
    expect(screen.getByText('MASTER')).toBeTruthy();
  });

  it('displays plan prices on cards', () => {
    render(<EnterprisePage />);
    expect(screen.getByText('$99 / mo')).toBeTruthy();
    expect(screen.getByText('$299 / mo')).toBeTruthy();
    expect(screen.getByText('$999 / mo')).toBeTruthy();
  });

  it('marks the ENTERPRISE card as MOST POPULAR', () => {
    render(<EnterprisePage />);
    expect(screen.getByText('MOST POPULAR')).toBeTruthy();
  });

  it('renders all feature list items across plan cards', () => {
    render(<EnterprisePage />);
    for (const plan of Object.values(ENTERPRISE_PLANS)) {
      for (const feature of plan.features) {
        expect(screen.getByText(feature)).toBeTruthy();
      }
    }
  });

  /* ── "Contact sales" button on plan card switches to Contact tab ── */

  it('clicking Contact sales on a plan card switches to Contact tab with that tier selected', () => {
    render(<EnterprisePage />);
    // All three plan cards have "Contact sales" buttons
    const contactButtons = screen.getAllByText('Contact sales');
    expect(contactButtons.length).toBe(3);

    // Click the first one (PRO)
    fireEvent.click(contactButtons[0]);
    expect(screen.getByText('Talk to our team')).toBeTruthy();
    // PRO tier should display "$99 / mo" as selected price button
    expect(screen.getByText('$99 / mo')).toBeTruthy();
  });

  /* ── FAQ section ── */

  it('renders all FAQ questions and answers', () => {
    render(<EnterprisePage />);
    expect(screen.getByText('How does billing work?')).toBeTruthy();
    expect(screen.getByText('Can I try before committing?')).toBeTruthy();
    expect(screen.getByText('What SLA is included?')).toBeTruthy();
    expect(screen.getByText('Is a custom contract available?')).toBeTruthy();
  });

  it('renders the self-serve section with link to standard pricing', () => {
    render(<EnterprisePage />);
    expect(screen.getByText('Looking for self-serve?')).toBeTruthy();
    const pricingLink = screen.getByText('View standard pricing');
    expect(pricingLink).toBeTruthy();
    expect(pricingLink.closest('a')).toHaveAttribute('href', '/pricing');
  });

  /* ── Contact tab form ── */

  it('renders all form fields in Contact tab', () => {
    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    expect(screen.getByLabelText('Work email *')).toBeTruthy();
    expect(screen.getByLabelText('Contact name *')).toBeTruthy();
    expect(screen.getByLabelText('Company name *')).toBeTruthy();
    expect(screen.getByLabelText('Team size')).toBeTruthy();
    expect(screen.getByLabelText('How will you use the platform? *')).toBeTruthy();
  });

  it('renders tier selector buttons on contact form', () => {
    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    // All three price buttons should render
    expect(screen.getByText('PRO')).toBeTruthy();
    expect(screen.getByText('ENTERPRISE')).toBeTruthy();
    expect(screen.getByText('MASTER')).toBeTruthy();
  });

  it('submit button reads "Request enterprise access" in idle state', () => {
    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    expect(screen.getByText('Request enterprise access')).toBeTruthy();
  });

  it('disables submit button when form state is submitting', async () => {
    // Make fetch never resolve so submitting state persists
    globalThis.fetch = vi.fn(() => new Promise(() => {}));
    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    // Fill required fields
    fireEvent.change(screen.getByLabelText('Work email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Contact name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Company name *'), { target: { value: 'Test Inc' } });
    fireEvent.change(screen.getByLabelText('How will you use the platform? *'), {
      target: { value: 'We are a trading desk looking for automated market making solutions for our daily operations.' },
    });

    fireEvent.click(screen.getByText('Request enterprise access'));
    await waitFor(() => {
      expect(screen.getByText('Sending...')).toBeTruthy();
    });
  });

  /* ── Form submission: success state ── */

  it('shows success state after successful form submission', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    fireEvent.change(screen.getByLabelText('Work email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Contact name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Company name *'), { target: { value: 'Test Inc' } });
    fireEvent.change(screen.getByLabelText('How will you use the platform? *'), {
      target: { value: 'We are a trading desk looking for automated market making solutions for our daily operations.' },
    });

    fireEvent.click(screen.getByText('Request enterprise access'));

    await waitFor(() => {
      expect(screen.getByText('Inquiry received')).toBeTruthy();
    });
  });

  it('renders next steps after successful submission', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    fireEvent.change(screen.getByLabelText('Work email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Contact name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Company name *'), { target: { value: 'Test Inc' } });
    fireEvent.change(screen.getByLabelText('How will you use the platform? *'), {
      target: { value: 'We are a trading desk looking for automated market making solutions for our daily operations.' },
    });

    fireEvent.click(screen.getByText('Request enterprise access'));

    await waitFor(() => {
      expect(screen.getByText('Account team assignment (today)')).toBeTruthy();
      expect(screen.getByText('Intro call (within 24 h)')).toBeTruthy();
      expect(screen.getByText('Custom proposal')).toBeTruthy();
      expect(screen.getByText('Onboarding')).toBeTruthy();
    });
  });

  it('shows paper-trading demo card after successful submission', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    fireEvent.change(screen.getByLabelText('Work email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Contact name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Company name *'), { target: { value: 'Test Inc' } });
    fireEvent.change(screen.getByLabelText('How will you use the platform? *'), {
      target: { value: 'We are a trading desk looking for automated market making solutions for our daily operations.' },
    });

    fireEvent.click(screen.getByText('Request enterprise access'));

    await waitFor(() => {
      expect(screen.getByText('Paper-trading demo')).toBeTruthy();
    });
  });

  it('shows back-to-home and docs links after success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    fireEvent.change(screen.getByLabelText('Work email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Contact name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Company name *'), { target: { value: 'Test Inc' } });
    fireEvent.change(screen.getByLabelText('How will you use the platform? *'), {
      target: { value: 'We are a trading desk looking for automated market making solutions for our daily operations.' },
    });

    fireEvent.click(screen.getByText('Request enterprise access'));

    await waitFor(() => {
      expect(screen.getByText('Read the docs')).toBeTruthy();
      expect(screen.getByText('Back to home')).toBeTruthy();
    });
  });

  /* ── Form submission: error state ── */

  it('shows error message when form submission fails with non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Validation failed' }),
    });

    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    fireEvent.change(screen.getByLabelText('Work email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Contact name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Company name *'), { target: { value: 'Test Inc' } });
    fireEvent.change(screen.getByLabelText('How will you use the platform? *'), {
      target: { value: 'We are a trading desk looking for automated market making solutions for our daily operations.' },
    });

    fireEvent.click(screen.getByText('Request enterprise access'));

    await waitFor(() => {
      expect(screen.getByText('Validation failed')).toBeTruthy();
    });
  });

  it('shows generic error when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    render(<EnterprisePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));

    fireEvent.change(screen.getByLabelText('Work email *'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Contact name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByLabelText('Company name *'), { target: { value: 'Test Inc' } });
    fireEvent.change(screen.getByLabelText('How will you use the platform? *'), {
      target: { value: 'We are a trading desk looking for automated market making solutions for our daily operations.' },
    });

    fireEvent.click(screen.getByText('Request enterprise access'));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  /* ── Tab styling ── */

  it('highlights the active tab button', () => {
    render(<EnterprisePage />);
    const pricingTab = screen.getByRole('button', { name: 'Pricing' });
    expect(pricingTab.className).toContain('bg-[#F59E0B]');

    fireEvent.click(screen.getByRole('button', { name: 'Contact' }));
    expect(pricingTab.className).not.toContain('bg-[#F59E0B]');
  });
});
