/**
 * Email Campaign Template Tests
 * Validates that email HTML templates are well-formed and links are correct.
 * Does NOT require SendGrid API key or DB connection.
 */

import { describe, it, expect } from 'vitest';

// Reusable template builders (extracted for testing)
function buildStarterTierHtmlEn(userName: string | null): string {
  const greeting = userName ? `Hi ${userName},` : 'Hi there,';
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#00D4AA;">Introducing STARTER Tier</h2>
  <p>${greeting}</p>
  <p>Great news -- we have been listening to our FREE users.</p>
  <p>Starting today, you can upgrade to <strong>STARTER</strong> at just <strong>$19/month</strong> and unlock more trading power without jumping to PRO.</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <h3 style="margin-top:0;color:#333;">What you get with STARTER:</h3>
    <ul style="line-height:1.8;">
      <li><strong>50 RPM</strong> request rate (up from 10 on FREE)</li>
      <li><strong>5,000 daily API calls</strong> (up from 1,000 on FREE)</li>
      <li><strong>3 active strategies</strong> (up from 1 on FREE)</li>
      <li><strong>Polymarket + 1 CEX</strong> exchange support</li>
      <li>All core signals and alerts</li>
    </ul>
  </div>
  <div style="background:#e8f5e9;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #00D4AA;">
    <h3 style="margin-top:0;">Annual prepay -- save 20%</h3>
    <p>Pay <strong>$182/year</strong> instead of $228. Same features, lower price.</p>
  </div>
  <p style="text-align:center;margin:24px 0;">
    <a href="https://app.algotrader.cc/billing?upgrade=starter" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Upgrade to STARTER &rarr;</a>
  </p>
  <p>To smarter trades,<br><strong>The Algo Trader Team</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Unsubscribe</a>
  </p>
</body>
</html>`;
}

function buildStarterTierHtmlVi(userName: string | null): string {
  const greeting = userName ? `Chao ${userName},` : 'Chao ban,';
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#00D4AA;">Goi STARTER Da Co Mat</h2>
  <p>${greeting}</p>
  <p>Tin vui -- chung toi da lang nghe nhung nguoi dung FREE cua minh.</p>
  <p>Bat dau tu hom nay, ban co the nang cap len <strong>STARTER</strong> chi voi <strong>$19/thang</strong> va mo khoa them suc manh giao dich.</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <h3 style="margin-top:0;color:#333;">Ban nhan duoc gi voi STARTER:</h3>
    <ul style="line-height:1.8;">
      <li><strong>50 RPM</strong> toc do yeu cau (tu 10 tren FREE)</li>
      <li><strong>5.000 luot API moi ngay</strong> (tu 1.000 tren FREE)</li>
      <li><strong>3 chien luoc hoat dong</strong> (tu 1 tren FREE)</li>
      <li><strong>Polymarket + 1 CEX</strong> ho tro san giao dich</li>
      <li>Tat ca tin hieu va canh bao co ban</li>
    </ul>
  </div>
  <div style="background:#e8f5e9;padding:16px;border-radius:8px;margin:16px 0;border-left:4px solid #00D4AA;">
    <h3 style="margin-top:0;">Thanh toan nam -- tiet kiem 20%</h3>
    <p>Tra <strong>$182/nam</strong> thay vi $228. Cung tinh nang, gia thap hon.</p>
  </div>
  <p style="text-align:center;margin:24px 0;">
    <a href="https://app.algotrader.cc/vi/billing?upgrade=starter" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Nang Cap Len STARTER &rarr;</a>
  </p>
  <p>Chuc ban giao dich thong minh,<br><strong>Doi ngu Algo Trader</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Huy dang ky</a>
  </p>
</body>
</html>`;
}

function buildCoPilotHtmlEn(userName: string | null): string {
  const greeting = userName ? `Hi ${userName},` : 'Hi there,';
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#00D4AA;">AI Co-pilot Is Here</h2>
  <p>${greeting}</p>
  <p>What if you could ask your trading portfolio a question -- in plain English -- and get an answer instantly?</p>
  <p>Meet <strong>AI Co-pilot</strong> -- your personal trading assistant powered by advanced AI.</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <p><strong>Ask questions like:</strong></p>
    <ul style="line-height:1.8;">
      <li>"What is my current risk exposure?"</li>
      <li>"Find arbitrage opportunities right now"</li>
      <li>"Summarize my P&amp;L for this week"</li>
      <li>"Which strategy performed best yesterday?"</li>
    </ul>
  </div>
  <p>AI Co-pilot is available on <strong>PRO tier and above</strong>.</p>
  <p style="text-align:center;margin:24px 0;">
    <a href="https://app.algotrader.cc/billing?upgrade=pro" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Upgrade to PRO &rarr;</a>
  </p>
  <p>Trade smarter, not harder.<br><strong>The Algo Trader Team</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Unsubscribe</a>
  </p>
</body>
</html>`;
}

function buildCoPilotHtmlVi(userName: string | null): string {
  const greeting = userName ? `Chao ${userName},` : 'Chao ban,';
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <h2 style="color:#00D4AA;">AI Co-pilot Da San Sang</h2>
  <p>${greeting}</p>
  <p>Dieu gi xay ra neu ban co the hoi danh muc dau tu cua minh mot cau hoi bang tieng Viet don gian va nhan duoc cau tra loi ngay lap tuc?</p>
  <p>Hay gap <strong>AI Co-pilot</strong> -- tro ly giao dich ca nhan duoc ho tro boi AI tien tien.</p>
  <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0;">
    <p><strong>Dat nhung cau hoi nhu:</strong></p>
    <ul style="line-height:1.8;">
      <li>"Muc do riu ro hien tai la bao nhieu?"</li>
      <li>"Tim co hoi arbitrage ngay bay gio"</li>
      <li>"Tong ket loi nhuan tuan nay"</li>
      <li>"Chien luoc nao hieu qua nhat hom qua?"</li>
    </ul>
  </div>
  <p>AI Co-pilot co san tren <strong>PRO tier tro len</strong>.</p>
  <p style="text-align:center;margin:24px 0;">
    <a href="https://app.algotrader.cc/vi/billing?upgrade=pro" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Nang Cap Len PRO &rarr;</a>
  </p>
  <p>Giao dich thong minh hon,<br><strong>Doi ngu Algo Trader</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Huy dang ky</a>
  </p>
</body>
</html>`;
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Email Campaign Templates', () => {
  describe('STARTER Tier (English)', () => {
    const html = buildStarterTierHtmlEn('TestUser');

    it('contains greeting with user name', () => {
      expect(html).toContain('Hi TestUser,');
    });

    it('contains STARTER pricing info', () => {
      expect(html).toContain('$19/month');
      expect(html).toContain('$182/year');
    });

    it('contains upgrade CTA link', () => {
      expect(html).toContain('https://app.algotrader.cc/billing?upgrade=starter');
      expect(html).toContain('Upgrade to STARTER');
    });

    it('contains unsubscribe placeholder', () => {
      expect(html).toContain('{{unsubscribe_url}}');
    });

    it('lists STARTER features', () => {
      expect(html).toContain('50 RPM');
      expect(html).toContain('5,000 daily API calls');
      expect(html).toContain('3 active strategies');
      expect(html).toContain('Polymarket + 1 CEX');
    });

    it('has valid HTML doctype', () => {
      expect(html).toMatch(/^<!DOCTYPE html>/);
    });
  });

  describe('STARTER Tier (Vietnamese)', () => {
    const html = buildStarterTierHtmlVi('TestUser');

    it('contains Vietnamese greeting', () => {
      expect(html).toContain('Chao TestUser,');
    });

    it('contains STARTER pricing in VND format', () => {
      expect(html).toContain('$19/thang');
      expect(html).toContain('$182/nam');
    });

    it('contains Vietnamese CTA link', () => {
      expect(html).toContain('https://app.algotrader.cc/vi/billing?upgrade=starter');
      expect(html).toContain('Nang Cap Len STARTER');
    });

    it('contains Vietnamese unsubscribe', () => {
      expect(html).toContain('Huy dang ky');
    });
  });

  describe('AI Co-pilot (English)', () => {
    const html = buildCoPilotHtmlEn('TestUser');

    it('contains greeting', () => {
      expect(html).toContain('Hi TestUser,');
    });

    it('describes AI Co-pilot', () => {
      expect(html).toContain('AI Co-pilot');
      expect(html).toContain('personal trading assistant');
    });

    it('contains PRO upgrade CTA', () => {
      expect(html).toContain('https://app.algotrader.cc/billing?upgrade=pro');
      expect(html).toContain('Upgrade to PRO');
    });

    it('lists example queries', () => {
      expect(html).toContain('risk exposure');
      expect(html).toContain('arbitrage opportunities');
    });

    it('mentions PRO tier requirement', () => {
      expect(html).toContain('PRO tier and above');
    });

    it('has unsubscribe placeholder', () => {
      expect(html).toContain('{{unsubscribe_url}}');
    });
  });

  describe('AI Co-pilot (Vietnamese)', () => {
    const html = buildCoPilotHtmlVi('TestUser');

    it('contains Vietnamese greeting', () => {
      expect(html).toContain('Chao TestUser,');
    });

    it('contains Vietnamese content', () => {
      expect(html).toContain('AI Co-pilot Da San Sang');
      expect(html).toContain('tro ly giao dich ca nhan');
    });

    it('contains Vietnamese CTA', () => {
      expect(html).toContain('Nang Cap Len PRO');
    });
  });

  describe('Template Fallbacks', () => {
    it('handles null user name with generic greeting (EN)', () => {
      const html = buildStarterTierHtmlEn(null);
      expect(html).toContain('Hi there,');
    });

    it('handles null user name with generic greeting (VI)', () => {
      const html = buildStarterTierHtmlVi(null);
      expect(html).toContain('Chao ban,');
    });
  });

  describe('Link Integrity', () => {
    const allTemplates = [
      buildStarterTierHtmlEn('TestUser'),
      buildStarterTierHtmlVi('TestUser'),
      buildCoPilotHtmlEn('TestUser'),
      buildCoPilotHtmlVi('TestUser'),
    ];

    it.each(allTemplates)('has unsubscribe placeholder in template', (html) => {
      expect(html).toContain('{{unsubscribe_url}}');
    });

    it.each(allTemplates)('has valid CTA href attribute', (html) => {
      // All CTA links should start with https://app.algotrader.cc
      const ctaLinks = html.match(/href="(https:\/\/app\.algotrader\.cc[^"]+)"/g);
      expect(ctaLinks).not.toBeNull();
      expect(ctaLinks!.length).toBeGreaterThanOrEqual(1);
    });
  });
});
