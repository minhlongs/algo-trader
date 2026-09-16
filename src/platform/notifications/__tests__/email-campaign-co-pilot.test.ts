import { describe, it, expect } from 'vitest';

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
    <a href="https://api.cashclaw.cc/billing?upgrade=pro" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Upgrade to PRO &rarr;</a>
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
    <a href="https://api.cashclaw.cc/vi/billing?upgrade=pro" style="display:inline-block;padding:14px 28px;background:#00D4AA;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">Nang Cap Len PRO &rarr;</a>
  </p>
  <p>Giao dich thong minh hon,<br><strong>Doi ngu Algo Trader</strong></p>
  <p style="color:#888;font-size:12px;margin-top:24px;">
    <a href="{{unsubscribe_url}}" style="color:#888;">Huy dang ky</a>
  </p>
</body>
</html>`;
}

describe('AI Co-pilot templates', () => {
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
      expect(html).toContain('https://api.cashclaw.cc/billing?upgrade=pro');
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
      const html = buildCoPilotHtmlEn(null);
      expect(html).toContain('Hi there,');
    });

    it('handles null user name with generic greeting (VI)', () => {
      const html = buildCoPilotHtmlVi(null);
      expect(html).toContain('Chao ban,');
    });
  });

  describe('Link Integrity', () => {
    const allTemplates = [
      buildCoPilotHtmlEn('TestUser'),
      buildCoPilotHtmlVi('TestUser'),
    ];

    it.each(allTemplates)('has unsubscribe placeholder in template', (html) => {
      expect(html).toContain('{{unsubscribe_url}}');
    });

    it.each(allTemplates)('has valid CTA href attribute', (html) => {
      const ctaLinks = html.match(/href="(https:\/\/api\.cashclaw\.cc[^"]+)"/g);
      expect(ctaLinks).not.toBeNull();
      expect(ctaLinks!.length).toBeGreaterThanOrEqual(1);
    });
  });
});
