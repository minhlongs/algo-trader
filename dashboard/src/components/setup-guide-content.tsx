/**
 * Detailed setup guide content — step-by-step from zero to running bot.
 * Covers VPN, crypto accounts, bot installation, LLM setup, dashboard connection.
 * Based on SETUP.md, rendered as interactive UI.
 */
import { SetupVpnCrypto } from './setup-section-vpn-crypto';
import { COLORS as _COLORS } from '../lib/stitch-design-tokens';
import { SetupBotInstall } from './setup-section-bot-install';
import { InfoBanner } from './guide-shared-components';

export function SetupGuideContent() {
  return (
    <div className="space-y-16 text-[${_COLORS.onSurfaceVariant}]">

      {/* Banner */}
      <InfoBanner color="green" label="Full Setup Guide — From Zero to Live Trading">
        <p>
          This guide walks you through everything: VPN, crypto wallet, USDC,
          Polymarket account, bot installation, AI models, and connecting to dashboard.
        </p>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="bg-[${_COLORS.surface}] rounded p-2">
            <span className="text-[${_COLORS.primary}]">Phase A:</span> Accounts & Crypto (~30 min)
          </div>
          <div className="bg-[${_COLORS.surface}] rounded p-2">
            <span className="text-[${_COLORS.profit}]">Phase B:</span> Bot Installation (~15 min)
          </div>
        </div>
      </InfoBanner>

      {/* Prerequisites */}
      <div className="border border-yellow-500/30 bg-yellow-500/5 rounded-lg p-4">
        <p className="text-sm text-yellow-400 font-bold mb-2">Prerequisites</p>
        <ul className="text-sm text-[${_COLORS.onSurfaceVariant}] space-y-1">
          <li>Apple Silicon Mac (M1/M2/M3/M4) with 32GB+ RAM, <strong className="text-white">OR</strong></li>
          <li>Cloud VPS with NVIDIA GPU (RTX 4090 recommended) + 64GB RAM, <strong className="text-white">OR</strong></li>
          <li>Any Linux VPS with 2GB+ RAM (CPU-only, no local AI)</li>
        </ul>
      </div>

      {/* Table of Contents */}
      <nav aria-label="Setup guide table of contents">
        <p className="text-xs text-[${_COLORS.primary}] uppercase tracking-widest mb-3">Setup Steps</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          {[
            { href: '#vpn-setup', label: 'A1. VPN Setup (1.1.1.1 / ProtonVPN)' },
            { href: '#metamask-setup', label: 'A2. MetaMask Wallet' },
            { href: '#buy-usdc', label: 'A3. Buy USDC' },
            { href: '#transfer-usdc', label: 'A4. Transfer to MetaMask' },
            { href: '#polymarket-account', label: 'A5. Polymarket Account' },
            { href: '#api-keys', label: 'A6. API Keys' },
            { href: '#private-key', label: 'A7. Export Private Key' },
            { href: '#install-deps', label: 'B1. Install Dependencies' },
            { href: '#ai-model', label: 'B2. Download AI Model' },
            { href: '#clone-build', label: 'B3. Clone & Build' },
            { href: '#configure-env', label: 'B4. Configure .env' },
            { href: '#dry-run', label: 'B5. Test Dry Run' },
            { href: '#go-live', label: 'B6. Go Live' },
            { href: '#run-247', label: 'B7. Run 24/7' },
            { href: '#connect-dashboard', label: 'B8. Connect Dashboard' },
          ].map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-[${_COLORS.onSurfaceVariant}] hover:text-[${_COLORS.primary}] transition-colors"
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <SetupVpnCrypto />
      <SetupBotInstall />

      {/* Verification Checklist */}
      <section id="verification">
        <h2 className="text-xl font-bold text-white mb-4">Verification Checklist</h2>
        <div className="bg-[${_COLORS.surface}] border border-[${_COLORS.surface}] rounded-lg p-4 text-sm text-[${_COLORS.onSurfaceVariant}] space-y-2">
          {[
            { cmd: 'node --version', expect: 'v20+' },
            { cmd: 'curl http://localhost:11435/v1/models', expect: 'LLM responding (macOS)' },
            { cmd: 'curl http://localhost:11434/api/tags', expect: 'LLM responding (VPS)' },
            { cmd: 'pm2 status', expect: 'cashclaw = online' },
            { cmd: 'curl http://localhost:3000/api/health', expect: '{"status":"ok"}' },
          ].map(({ cmd, expect }) => (
            <div key={cmd} className="flex gap-4">
              <code className="text-[${_COLORS.profit}] whitespace-nowrap">{cmd}</code>
              <span>&rarr; {expect}</span>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
