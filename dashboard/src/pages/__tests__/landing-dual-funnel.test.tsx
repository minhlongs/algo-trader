import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { HeroSoloQuant } from '../../components/hero-solo-quant';
import { LandingSoloQuant } from '../landing';
import { PricingPage } from '../pricing-page';

vi.mock('../../components/public-navbar', () => ({
  PublicNavbar: ({ rightSlot }: { rightSlot?: React.ReactNode }) => (
    <div data-testid="public-navbar">{rightSlot}</div>
  ),
}));

vi.mock('../../components/footer', () => ({
  Footer: () => <div data-testid="footer">Footer</div>,
}));

vi.mock('../../components/paper-stats-card', () => ({
  PaperStatsCard: () => <div data-testid="paper-stats-card">PaperStatsCard</div>,
}));

vi.mock('../../hooks/use-coupons', () => ({
  useCoupons: () => ({
    redeemCoupon: vi.fn(),
  }),
}));

describe('Dual-Funnel and Bilingual UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('HeroSoloQuant', () => {
    it('renders English copy and Dual-Funnel buttons by default', () => {
      render(
        <MemoryRouter>
          <HeroSoloQuant />
        </MemoryRouter>,
      );

      expect(screen.getByText(/Live on Polymarket/i)).toBeTruthy();
      expect(screen.getByText('Read Methodology')).toBeTruthy();
      expect(screen.getByText('Start CashClaw Free ($0)')).toBeTruthy();
      expect(screen.getByText('Read Manifesto')).toBeTruthy();
    });

    it('renders Vietnamese copy when lang="vi" is passed', () => {
      render(
        <MemoryRouter>
          <HeroSoloQuant lang="vi" />
        </MemoryRouter>,
      );

      expect(screen.getByText(/Trực tiếp trên Polymarket/i)).toBeTruthy();
      expect(screen.getByText('Đọc Phương Pháp Luận')).toBeTruthy();
      expect(screen.getByText('Bắt Đầu Gói Miễn Phí ($0)')).toBeTruthy();
      expect(screen.getByText('Đọc Tuyên Ngôn')).toBeTruthy();
    });
  });

  describe('LandingSoloQuant', () => {
    it('renders Dual-Funnel closing CTA section linking to /pricing, /signup, and /methodology', () => {
      render(
        <MemoryRouter>
          <LandingSoloQuant />
        </MemoryRouter>,
      );

      expect(screen.getByText(/Dual-Funnel · Proof-of-Work to Production RaaS/i)).toBeTruthy();
      expect(screen.getByText('Explore Methodology & Data')).toBeTruthy();
      expect(screen.getByText('View Plans ($0 / $49 / $199)')).toBeTruthy();
      expect(screen.getByText('Create Free Account')).toBeTruthy();
    });

    it('toggles full landing page copy between English and Vietnamese', () => {
      render(
        <MemoryRouter>
          <LandingSoloQuant />
        </MemoryRouter>,
      );

      const toggleBtn = screen.getByRole('button', { name: /toggle language/i });
      expect(screen.getByText('Tiếng Việt')).toBeTruthy();

      fireEvent.click(toggleBtn);

      expect(screen.getByText('English')).toBeTruthy();
      expect(screen.getByText(/Phễu Kép · Từ Kiểm Chứng Thực Thực Tế/i)).toBeTruthy();
      expect(screen.getByText('Xem Bảng Giá ($0 / $49 / $199)')).toBeTruthy();
      expect(screen.getByText('Đăng Ký Miễn Phí Ngay')).toBeTruthy();
    });
  });

  describe('PricingPage', () => {
    it('renders English FAQ answers without Vietnamese sentences in COPY.en', () => {
      render(
        <MemoryRouter>
          <PricingPage />
        </MemoryRouter>,
      );

      expect(screen.getByText('What markets does CashClaw trade?')).toBeTruthy();
      expect(screen.getByText('Can I cancel anytime?')).toBeTruthy();

      // Expand FAQ 3 and FAQ 4
      fireEvent.click(screen.getByText('What markets does CashClaw trade?'));
      fireEvent.click(screen.getByText('Can I cancel anytime?'));

      expect(
        screen.getByText(/CashClaw targets high-liquidity Polymarket prediction markets/i),
      ).toBeTruthy();
      expect(
        screen.getByText(/Pro and Enterprise plans are billed on a flexible monthly basis/i),
      ).toBeTruthy();

      // Ensure no leftover Vietnamese in English FAQ mode
      expect(screen.queryByText(/Bot nhắm đến các thị trường/i)).toBeNull();
      expect(screen.queryByText(/Gói Pro và Enterprise tính theo tháng/i)).toBeNull();
    });
  });
});
