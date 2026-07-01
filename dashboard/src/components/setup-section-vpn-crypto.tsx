/**
 * Setup guide Phase A: VPN, wallet, USDC, Polymarket account.
 * Customer-facing step-by-step from zero to funded Polymarket wallet.
 */
import { CopyBlock, CollapsibleItem, InfoBanner } from './guide-shared-components';

export function SetupVpnCrypto() {
  return (
    <section id="phase-a">
      <h2 className="text-xl font-bold text-white mb-2">Phase A: Accounts & Crypto</h2>
      <p className="text-sm text-[#8892B0] mb-6">
        Skip this phase if you already have a funded Polymarket account.
      </p>

      <div className="space-y-8">
        {/* A1: VPN */}
        <div id="vpn-setup">
          <p className="text-sm text-white mb-2">
            <span className="text-[#00C8E8] font-bold">A1.</span> VPN Setup (required for restricted regions)
          </p>
          <p className="text-sm text-[#8892B0] mb-3">
            Polymarket is restricted in some countries. Use a VPN to access it.
          </p>
          <div className="space-y-3">
            <CollapsibleItem title="Option 1: Cloudflare WARP (free, recommended)">
              <div className="space-y-2">
                <p>1. Download from <span className="text-[#00C8E8]">1.1.1.1</span> (iOS, Android, macOS, Windows)</p>
                <p>2. Install and open the app</p>
                <p>3. Toggle WARP ON</p>
                <p>4. Verify: visit <span className="text-[#00C8E8]">polymarket.com</span> — should load without error</p>
                <CopyBlock code={`# macOS: install via Homebrew
brew install --cask cloudflare-warp

# Or download from https://1.1.1.1`} />
              </div>
            </CollapsibleItem>
            <CollapsibleItem title="Option 2: ProtonVPN (free)">
              <div className="space-y-2">
                <p>1. Download from <span className="text-[#00C8E8]">protonvpn.com</span></p>
                <p>2. Create free account</p>
                <p>3. Connect to a US server</p>
                <p>4. Verify: visit <span className="text-[#00C8E8]">polymarket.com</span></p>
              </div>
            </CollapsibleItem>
          </div>
        </div>

        {/* A2: MetaMask */}
        <div id="metamask-setup">
          <p className="text-sm text-white mb-2">
            <span className="text-[#00C8E8] font-bold">A2.</span> MetaMask Wallet
          </p>
          <div className="text-sm text-[#8892B0] space-y-2">
            <p>1. Install MetaMask browser extension from <span className="text-[#00C8E8]">metamask.io/download</span></p>
            <p>2. Create new wallet &rarr; <span className="text-yellow-400">SAVE 12 SEED WORDS ON PAPER</span></p>
            <p>3. Add Polygon network:</p>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <tbody className="divide-y divide-[#1E2640]">
                <tr><td className="py-1 pr-4 text-[#8892B0]">Network</td><td className="py-1 text-white">Polygon Mainnet</td></tr>
                <tr><td className="py-1 pr-4 text-[#8892B0]">RPC URL</td><td className="py-1 text-white">https://polygon-rpc.com</td></tr>
                <tr><td className="py-1 pr-4 text-[#8892B0]">Chain ID</td><td className="py-1 text-white">137</td></tr>
                <tr><td className="py-1 pr-4 text-[#8892B0]">Symbol</td><td className="py-1 text-white">MATIC</td></tr>
                <tr><td className="py-1 pr-4 text-[#8892B0]">Explorer</td><td className="py-1 text-white">https://polygonscan.com</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* A3: Buy USDC */}
        <div id="buy-usdc">
          <p className="text-sm text-white mb-2">
            <span className="text-[#00C8E8] font-bold">A3.</span> Buy USDC
          </p>
          <div className="text-sm text-[#8892B0] space-y-2">
            <p>1. Register at <span className="text-[#00C8E8]">binance.com</span> (email + ID verification)</p>
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
            <span className="text-[#00C8E8] font-bold">A4.</span> Transfer USDC to MetaMask
          </p>
          <div className="text-sm text-[#8892B0] space-y-2">
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
            <span className="text-[#00C8E8] font-bold">A5.</span> Polymarket Account
          </p>
          <div className="text-sm text-[#8892B0] space-y-2">
            <p>1. Enable VPN &rarr; visit <span className="text-[#00C8E8]">polymarket.com</span></p>
            <p>2. Log In &rarr; Connect Wallet &rarr; MetaMask</p>
            <p>3. Deposit USDC into Polymarket</p>
          </div>
        </div>

        {/* A6: API Keys */}
        <div id="api-keys">
          <p className="text-sm text-white mb-2">
            <span className="text-[#00C8E8] font-bold">A6.</span> Polymarket API Keys
          </p>
          <div className="text-sm text-[#8892B0] space-y-2">
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
            <span className="text-[#00C8E8] font-bold">A7.</span> Export Wallet Private Key
          </p>
          <div className="text-sm text-[#8892B0] space-y-2">
            <p>MetaMask &rarr; &hellip; &rarr; Account Details &rarr; Show Private Key &rarr; Enter password</p>
            <p className="text-yellow-400">Recommended: create a dedicated bot wallet (MetaMask &rarr; Add Account)</p>
          </div>
        </div>
      </div>
    </section>
  );
}
