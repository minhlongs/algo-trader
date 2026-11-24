/**
 * Setup guide Phase A: Jurisdiction & venue eligibility verification, wallet, USDC, Polymarket account.
 * Customer-facing step-by-step for eligible international operators (zero VPN/proxy circumvention).
 */
import { CopyBlock, CollapsibleItem, InfoBanner } from './guide-shared-components';
import { COLORS as _COLORS } from '../lib/stitch-design-tokens';

export function SetupVpnCrypto() {
  return (
    <section id="phase-a">
      <h2 className="text-xl font-bold text-white mb-2">Phase A: Accounts & Crypto</h2>
      <p className="text-sm text-onSurfaceVariant mb-6">
        Skip this phase if you already hold an eligible, verified Polymarket account in a permitted jurisdiction.
      </p>

      <div className="space-y-8">
        {/* A1: Jurisdiction & Venue Eligibility */}
        <div id="vpn-setup">
          <p className="text-sm text-white mb-2">
            <span className="text-primary font-bold">A1.</span> Jurisdiction &amp; Venue Eligibility Check (Mandatory — Zero Circumvention)
          </p>
          <p className="text-sm text-onSurfaceVariant mb-3">
            Polymarket restricts trading by persons or entities residing in, located in, incorporated in, or controlled from Restricted Jurisdictions under its Terms of Use. Using VPNs, proxies, location spoofing, or nominee accounts to bypass geographic restrictions is strictly prohibited.
          </p>
          <div className="space-y-3">
            <CollapsibleItem title="Step 1: Verify Official Polymarket Geoblock & Terms Eligibility">
              <div className="space-y-2">
                <p>1. Review <span className="text-primary">polymarket.com/tos</span> and <span className="text-primary">docs.polymarket.com/api-reference/geoblock</span></p>
                <p>2. Confirm your citizenship, residency, physical operating location, and legal entity are all outside Restricted Jurisdictions and compliant with domestic law</p>
                <p>3. Run the official direct geoblock check (without any VPN, proxy, or relay):</p>
                <CopyBlock code={`# Verify direct IP eligibility (must return "blocked": false without VPN/proxy)
curl -s https://polymarket.com/api/geoblock`} />
              </div>
            </CollapsibleItem>
            <CollapsibleItem title="Step 2: Server Location Never Substitutes for Operator Eligibility">
              <div className="space-y-2">
                <p>1. Hosting a cloud server in an unrestricted region (e.g., <span className="text-primary">eu-west-1</span>) never authorizes an ineligible operator or entity</p>
                <p>2. If your jurisdiction or data-usage clearance is unresolved, keep <span className="text-yellow-400">LIVE_TRADING_ENABLED=false</span> and operate only in permitted offline simulation mode</p>
              </div>
            </CollapsibleItem>
          </div>
        </div>

        {/* A2: MetaMask */}
        <div id="metamask-setup">
          <p className="text-sm text-white mb-2">
            <span className="text-primary font-bold">A2.</span> MetaMask Wallet
          </p>
          <div className="text-sm text-onSurfaceVariant space-y-2">
            <p>1. Install MetaMask browser extension from <span className="text-primary">metamask.io/download</span></p>
            <p>2. Create new wallet &rarr; <span className="text-yellow-400">SAVE 12 SEED WORDS ON PAPER</span></p>
            <p>3. Add Polygon network:</p>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <tbody className="divide-y divide-surface">
                <tr><td className="py-1 pr-4 text-onSurfaceVariant">Network</td><td className="py-1 text-white">Polygon Mainnet</td></tr>
                <tr><td className="py-1 pr-4 text-onSurfaceVariant">RPC URL</td><td className="py-1 text-white">https://polygon-rpc.com</td></tr>
                <tr><td className="py-1 pr-4 text-onSurfaceVariant">Chain ID</td><td className="py-1 text-white">137</td></tr>
                <tr><td className="py-1 pr-4 text-onSurfaceVariant">Symbol</td><td className="py-1 text-white">MATIC</td></tr>
                <tr><td className="py-1 pr-4 text-onSurfaceVariant">Explorer</td><td className="py-1 text-white">https://polygonscan.com</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* A3: Buy USDC */}
        <div id="buy-usdc">
          <p className="text-sm text-white mb-2">
            <span className="text-primary font-bold">A3.</span> Buy USDC
          </p>
          <div className="text-sm text-onSurfaceVariant space-y-2">
            <p>1. Register at <span className="text-primary">binance.com</span> (email + ID verification)</p>
            <p>2. Trade &rarr; P2P &rarr; Buy &rarr; USDC &rarr; your currency &rarr; Bank Transfer</p>
            <p>3. Buy $500+ USDC (minimum $100, recommended $500-2000)</p>
          </div>
          <InfoBanner color="yellow" label="Investment Warning">
            <p>Only invest money you can afford to lose. Start small ($100-200) and scale up after gaining experience.</p>
          </InfoBanner>
        </div>

        {/* A4: Transfer */}
        <div id="transfer-usdc">
          <p className="text-sm text-white mb-2">
            <span className="text-primary font-bold">A4.</span> Transfer USDC to MetaMask
          </p>
          <div className="text-sm text-onSurfaceVariant space-y-2">
            <p>1. Binance &rarr; Wallet &rarr; Withdraw &rarr; USDC</p>
            <p>2. Address: your MetaMask address (0x...)</p>
            <p>3. Network: <span className="text-red-400 font-bold">Polygon (NOT Ethereum!)</span></p>
            <p>4. Also withdraw 1 MATIC for gas fees</p>
          </div>
          <div className="mt-2 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 rounded-r-lg">
            <p className="text-sm text-red-400 font-bold">ALWAYS send $1 test transaction first!</p>
          </div>
        </div>

        {/* A5: Polymarket */}
        <div id="polymarket-account">
          <p className="text-sm text-white mb-2">
            <span className="text-primary font-bold">A5.</span> Polymarket Account (Eligible Jurisdictions Only)
          </p>
          <div className="text-sm text-onSurfaceVariant space-y-2">
            <p>1. From a directly eligible jurisdiction (no VPN/proxy), visit <span className="text-primary">polymarket.com</span></p>
            <p>2. Log In &rarr; Connect Wallet &rarr; MetaMask</p>
            <p>3. Complete any required platform onboarding / pUSD funding checks</p>
          </div>
        </div>

        {/* A6: API Keys */}
        <div id="api-keys">
          <p className="text-sm text-white mb-2">
            <span className="text-primary font-bold">A6.</span> Polymarket API Keys
          </p>
          <div className="text-sm text-onSurfaceVariant space-y-2">
            <p>1. Polymarket &rarr; Settings &rarr; API Keys &rarr; Create API Key</p>
            <p>2. Save these 3 values:</p>
          </div>
          <CopyBlock code={`POLYMARKET_API_KEY=your_api_key
POLYMARKET_API_SECRET=your_api_secret    # shown only once!
POLYMARKET_PASSPHRASE=your_passphrase`} />
        </div>

        {/* A7: Private Key */}
        <div id="private-key">
          <p className="text-sm text-white mb-2">
            <span className="text-primary font-bold">A7.</span> Export Wallet Private Key
          </p>
          <div className="text-sm text-onSurfaceVariant space-y-2">
            <p>MetaMask &rarr; &hellip; &rarr; Account Details &rarr; Show Private Key &rarr; Enter password</p>
            <p className="text-yellow-400">Recommended: create a dedicated bot wallet (MetaMask &rarr; Add Account)</p>
          </div>
        </div>
      </div>
    </section>
  );
}
