import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SetupGuideContent } from '../setup-guide-content';
import { SetupVpnCrypto } from '../setup-section-vpn-crypto';

describe('SetupVpnCrypto & SetupGuideContent (#POLY-G10.5 anti-circumvention remediation)', () => {
  it('renders official Polymarket jurisdiction/geoblock verification and zero VPN circumvention instructions', () => {
    const { container } = render(<SetupVpnCrypto />);
    expect(container.querySelector('#vpn-setup')).not.toBeNull();
    expect(screen.getByText(/Jurisdiction & Venue Eligibility Check/i)).toBeInTheDocument();
    expect(screen.getByText(/using vpns, proxies, location spoofing, or nominee accounts/i)).toBeInTheDocument();

    const fullText = container.textContent ?? '';
    expect(fullText).not.toMatch(/Cloudflare WARP/i);
    expect(fullText).not.toMatch(/ProtonVPN/i);
    expect(fullText).not.toMatch(/1\.1\.1\.1/);
    expect(fullText).not.toMatch(/Use a VPN to access/i);
    expect(fullText).not.toMatch(/Enable VPN/i);
    expect(fullText).not.toMatch(/Connect to a US server/i);
  });

  it('lists Jurisdiction & Venue Eligibility Check in SetupGuideContent table of contents', () => {
    const { container } = render(<SetupGuideContent />);
    expect(screen.getByRole('link', { name: /A1\. Jurisdiction & Venue Eligibility Check/i })).toHaveAttribute(
      'href',
      '#vpn-setup',
    );
    expect(container.textContent ?? '').not.toMatch(/ProtonVPN|Cloudflare WARP/i);
  });
});
