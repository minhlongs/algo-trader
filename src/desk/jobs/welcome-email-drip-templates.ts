/**
 * Welcome Email Drip Sequence — Templates & Schedule Helpers
 */

export interface DripRecipient {
  email: string;
  tier: string;
  activatedAt: string; // ISO timestamp
  emailsSent: number[]; // indices of sent emails (0, 1, 2)
}

export interface DripState {
  recipients: DripRecipient[];
}

export interface DripEmailTemplate {
  delayHours: number;
  subject: string;
  body: (tier: string) => string;
  html: (tier: string) => string;
}

/** Email templates for the 3-step drip */
export const DRIP_EMAILS: DripEmailTemplate[] = [
  {
    delayHours: 0,
    subject: 'Welcome to CashClaw — Your quickstart guide',
    body: (tier: string) => `Welcome to CashClaw!\n\nYour ${tier} plan is now active. Here's how to get started:\n\n1. Link your license key in Telegram: /link <your-key>\n2. Check today's signals: /status\n3. View live P&L: https://cashclaw.cc/trading-performance\n\nOur AI scans 5 prediction markets daily. Signals fire only when edge > 5%.\n\nQuestions? Reply to this email or use /support in Telegram.\n\n— CashClaw Team`,
    html: (tier: string) => `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#00D4AA">Welcome to CashClaw</h2>
        <p>Your <strong>${tier}</strong> plan is now active. Here's how to get started:</p>
        <ol style="line-height:1.8">
          <li>Link your license key in Telegram: <code>/link &lt;your-key&gt;</code></li>
          <li>Check today's signals: <code>/status</code></li>
          <li>View live P&amp;L: <a href="https://cashclaw.cc/trading-performance" style="color:#00D4AA">cashclaw.cc/trading-performance</a></li>
        </ol>
        <p>Our AI scans 5 prediction markets daily. Signals fire only when edge &gt; 5%.</p>
        <p style="color:#888;font-size:14px">Questions? Reply to this email or use /support in Telegram.</p>
      </div>`,
  },
  {
    delayHours: 24,
    subject: 'CashClaw: 3 features you should try today',
    body: (_tier: string) => `Hey there,\n\nHere are 3 CashClaw features worth exploring:\n\n1. Daily Signal Digest — Top opportunities delivered every morning via Telegram\n2. Endgame Strategy — Our highest-edge approach: buying near-certain outcomes at $0.92-0.97\n3. Risk Dashboard — Kelly Criterion sizing with 2% max per position\n\nPro tip: Start with paper trading to validate signals before committing real capital.\n\nRead more on our blog: https://cashclaw.cc/blog\n\n— CashClaw Team`,
    html: (_tier: string) => `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#00D4AA">3 Features Worth Exploring</h2>
        <div style="margin:16px 0;padding:16px;background:#0B0E11;border-radius:8px;border-left:3px solid #00D4AA">
          <strong>1. Daily Signal Digest</strong><br>Top opportunities every morning via Telegram
        </div>
        <div style="margin:16px 0;padding:16px;background:#0B0E11;border-radius:8px;border-left:3px solid #00D4AA">
          <strong>2. Endgame Strategy</strong><br>Buy near-certain outcomes at $0.92-0.97
        </div>
        <div style="margin:16px 0;padding:16px;background:#0B0E11;border-radius:8px;border-left:3px solid #00D4AA">
          <strong>3. Risk Dashboard</strong><br>Kelly Criterion sizing, 2% max per position
        </div>
        <p><strong>Pro tip:</strong> Start with paper trading to validate signals before committing real capital.</p>
        <p><a href="https://cashclaw.cc/blog" style="color:#00D4AA">Read more on our blog →</a></p>
      </div>`,
  },
  {
    delayHours: 72,
    subject: 'CashClaw: Tips from our best traders',
    body: (tier: string) => `Quick tips from CashClaw power users:\n\n• Focus on Endgame strategy — it has the highest win rate\n• Use half-Kelly sizing (not full Kelly) to reduce variance\n• Check signals at 7 AM when the daily digest drops\n• Set a 5% daily stop-loss and stick to it\n\n${tier === 'FREE' || tier === 'STARTER' ? 'Ready for more? Pro subscribers get real-time signal streaming and auto-execution.\n\nUpgrade at: https://cashclaw.cc/#pricing' : 'You have full access to all features. Make the most of auto-execution and the real-time feed.'}\n\n— CashClaw Team`,
    html: (tier: string) => `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
        <h2 style="color:#00D4AA">Tips From Power Users</h2>
        <ul style="line-height:2">
          <li>Focus on <strong>Endgame strategy</strong> — highest win rate</li>
          <li>Use <strong>half-Kelly sizing</strong> to reduce variance</li>
          <li>Check signals at <strong>7 AM</strong> (daily digest)</li>
          <li>Set a <strong>5% daily stop-loss</strong> and stick to it</li>
        </ul>
        ${tier === 'FREE' || tier === 'STARTER' ? '<div style="margin:20px 0;padding:16px;background:#0B0E11;border-radius:8px;text-align:center"><p>Ready for more?</p><a href="https://cashclaw.cc/#pricing" style="display:inline-block;padding:12px 24px;background:#00D4AA;color:#0B0E11;text-decoration:none;border-radius:6px;font-weight:bold">Upgrade to Pro →</a></div>' : '<p>You have full access. Make the most of auto-execution and the real-time feed.</p>'}
      </div>`,
  },
];

export function isDripEmailDue(activatedMs: number, delayHours: number, nowMs: number): boolean {
  return nowMs >= activatedMs + delayHours * 3600_000;
}

export function retainActiveDripRecipients(recipients: DripRecipient[], nowMs: number): DripRecipient[] {
  const sevenDaysAgo = nowMs - 7 * 86400_000;
  return recipients.filter(
    (r) => r.emailsSent.length < DRIP_EMAILS.length || new Date(r.activatedAt).getTime() > sevenDaysAgo,
  );
}
