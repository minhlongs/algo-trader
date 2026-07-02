/**
 * Setup guide Phase B: Bot installation, LLM, .env config, dashboard connect.
 * Customer-facing with macOS + VPS options.
 */
import { CopyBlock, CollapsibleItem, InfoBanner } from './guide-shared-components';

export function SetupBotInstall() {
  return (
    <section id="phase-b">
      <h2 className="text-xl font-bold text-white mb-2">Phase B: Bot Installation</h2>
      <p className="text-sm text-[#8892B0] mb-6">
        Install CashClaw, download AI model, configure and run.
      </p>

      <div className="space-y-8">
        {/* B1: Dependencies */}
        <div id="install-deps">
          <p className="text-sm text-white mb-2">
            <span className="text-[#F59E0B] font-bold">B1.</span> Install Dependencies
          </p>
          <CollapsibleItem title="macOS (Apple Silicon M1/M2/M3/M4)">
            <CopyBlock code={`# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js and Python
brew install node python@3.11

# Install MLX LM server (for local AI)
pip3 install mlx-lm

# Verify
node --version    # v20+
python3 --version # 3.11+`} />
          </CollapsibleItem>
          <div className="mt-2">
            <CollapsibleItem title="Ubuntu VPS (with NVIDIA GPU)">
              <CopyBlock code={`apt update && apt upgrade -y
apt install -y nvidia-driver-535 nvidia-cuda-toolkit

# Install Ollama (for AI models)
curl -fsSL https://ollama.com/install.sh | sh

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm pm2

# Verify
node --version  # v20+
nvidia-smi      # Should show GPU`} />
            </CollapsibleItem>
          </div>
          <div className="mt-2">
            <CollapsibleItem title="Ubuntu VPS (CPU only, no GPU)">
              <CopyBlock code={`apt update && apt upgrade -y

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pnpm pm2

# No local LLM — bot runs with API-based estimation
# Or use Ollama with CPU-only small models (slower)
curl -fsSL https://ollama.com/install.sh | sh

# Verify
node --version  # v20+`} />
            </CollapsibleItem>
          </div>
        </div>

        {/* B2: AI Model */}
        <div id="ai-model">
          <p className="text-sm text-white mb-2">
            <span className="text-[#F59E0B] font-bold">B2.</span> Download AI Model
          </p>
          <p className="text-sm text-[#8892B0] mb-3">
            CashClaw uses a dual-model AI pipeline for market scanning and deep analysis.
          </p>
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#1E2640]">
                  <th className="text-left py-2 pr-4 text-[#F59E0B]">Model</th>
                  <th className="text-left py-2 pr-4 text-[#F59E0B]">Size</th>
                  <th className="text-left py-2 pr-4 text-[#F59E0B]">RAM</th>
                  <th className="text-left py-2 pr-4 text-[#F59E0B]">Speed</th>
                  <th className="text-left py-2 text-[#F59E0B]">Purpose</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E2640]">
                <tr>
                  <td className="py-2 pr-4 text-white">DeepSeek R1 32B</td>
                  <td className="py-2 pr-4">~18GB (4-bit)</td>
                  <td className="py-2 pr-4">20GB</td>
                  <td className="py-2 pr-4">8-15 t/s</td>
                  <td className="py-2">Deep reasoning, estimation</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 text-white">Nemotron-3 Nano</td>
                  <td className="py-2 pr-4">~18GB (4-bit)</td>
                  <td className="py-2 pr-4">20GB</td>
                  <td className="py-2 pr-4">35-50 t/s</td>
                  <td className="py-2">Fast scanner, 1M context</td>
                </tr>
              </tbody>
            </table>
          </div>
          <CollapsibleItem title="macOS: MLX Server (Apple Silicon)">
            <CopyBlock code={`# DeepSeek R1 — deep reasoning (port 11435)
python3 -m mlx_lm.server \\
  --model mlx-community/DeepSeek-R1-Distill-Qwen-32B-4bit \\
  --port 11435 &

# Nemotron-3 Nano — fast scanner (port 11436)
# Requires 64GB RAM to run both simultaneously
python3 -m mlx_lm.server \\
  --model mlx-community/nvidia-Llama-3_1-Nemotron-Nano-8B-v1-4bit \\
  --port 11436 &

# Verify (wait 2-5 min for first load)
curl http://localhost:11435/v1/models
curl http://localhost:11436/v1/models`} />
            <p className="mt-2 text-yellow-400">
              32GB RAM: run 1 model at a time. 64GB RAM: run both simultaneously.
            </p>
          </CollapsibleItem>
          <div className="mt-2">
            <CollapsibleItem title="VPS: Ollama (GPU)">
              <CopyBlock code={`# Pull DeepSeek R1 model
ollama pull deepseek-r1:32b

# Verify
curl http://localhost:11434/api/tags

# Ollama runs on port 11434 by default
# Set LLM_URL=http://localhost:11434/v1 in .env`} />
            </CollapsibleItem>
          </div>
          <div className="mt-2">
            <CollapsibleItem title="No GPU? Skip local AI">
              <p>Without a GPU or Apple Silicon, the bot still works — it uses simpler heuristic-based estimation instead of AI deep analysis. Edge is lower but still profitable with proper parameters.</p>
            </CollapsibleItem>
          </div>
        </div>

        {/* B3: Clone & Build */}
        <div id="clone-build">
          <p className="text-sm text-white mb-2">
            <span className="text-[#F59E0B] font-bold">B3.</span> Clone & Build CashClaw
          </p>
          <CopyBlock code={`git clone https://github.com/longtho638-jpg/algo-trader.git
cd algo-trader
pnpm install --ignore-scripts
npx tsc

# Verify: should complete with 0 errors`} />
        </div>

        {/* B4: Configure */}
        <div id="configure-env">
          <p className="text-sm text-white mb-2">
            <span className="text-[#F59E0B] font-bold">B4.</span> Configure Environment
          </p>
          <CopyBlock code={`cp .env.example .env

# Edit .env with your credentials:
nano .env`} />
          <div className="mt-3">
            <p className="text-xs text-[#8892B0] mb-2">Required .env variables:</p>
            <CopyBlock code={`# License (from CashClaw purchase)
LICENSE_KEY=your-license-key
LICENSE_SECRET=your-license-secret

# Polymarket CLOB API (from Step A6)
POLYMARKET_API_KEY=your-api-key
POLYMARKET_PASSPHRASE=your-passphrase

# Wallet (from Step A7)
POLY_PRIVATE_KEY=0xyour-private-key

# Trading capital
CAPITAL_USDC=500

# LLM (macOS MLX = 11435, VPS Ollama = 11434)
LLM_URL=http://localhost:11435/v1

# Trading parameters (safe defaults)
DRY_RUN=true
MM_SPREAD=0.10
MM_SIZE=20
MM_MAX_MARKETS=5`} />
          </div>
        </div>

        {/* B5: Dry Run */}
        <div id="dry-run">
          <p className="text-sm text-white mb-2">
            <span className="text-[#F59E0B] font-bold">B5.</span> Test with Dry Run
          </p>
          <CopyBlock code={`# Start in DRY RUN mode (no real money)
pm2 start "npx tsx src/app.ts" --name cashclaw

# Check status
pm2 status

# Watch logs
pm2 logs cashclaw --lines 30

# Wait ~2 min for first cycle
# SUCCESS = signals appearing with edge percentages`} />
          <InfoBanner color="green" label="Always dry run first">
            <p>Run for 2-3 days in DRY_RUN mode. Verify signals are appearing and parameters are reasonable before going live.</p>
          </InfoBanner>
        </div>

        {/* B6: Go Live */}
        <div id="go-live">
          <p className="text-sm text-white mb-2">
            <span className="text-[#F59E0B] font-bold">B6.</span> Go Live
          </p>
          <CopyBlock code={`# Edit .env: change DRY_RUN=false
nano .env

# Restart with live trading
pm2 restart cashclaw`} />
          <div className="mt-2 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 rounded-r-lg">
            <p className="text-sm text-red-400 font-bold">Start with $100-200. Watch for 48 hours. Scale up slowly.</p>
          </div>
        </div>

        {/* B7: Run 24/7 */}
        <div id="run-247">
          <p className="text-sm text-white mb-2">
            <span className="text-[#F59E0B] font-bold">B7.</span> Run 24/7
          </p>
          <CopyBlock code={`# PM2 auto-restart on server reboot
pm2 save
pm2 startup

# Check it's running
pm2 status`} />
          <div className="mt-2">
            <CollapsibleItem title="macOS: launchd service (alternative to PM2)">
              <p className="mb-2">Create a launchd service for auto-start on Mac boot:</p>
              <CopyBlock code={`# Create plist
cat > ~/Library/LaunchAgents/com.cashclaw.bot.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.cashclaw.bot</string>
  <key>WorkingDirectory</key><string>/path/to/algo-trader</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>scripts/start-trading-bot.mjs</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
PLIST

# Start
launchctl load ~/Library/LaunchAgents/com.cashclaw.bot.plist`} />
            </CollapsibleItem>
          </div>
        </div>

        {/* B8: Connect Dashboard */}
        <div id="connect-dashboard">
          <p className="text-sm text-white mb-2">
            <span className="text-[#F59E0B] font-bold">B8.</span> Connect to Dashboard (Order Book)
          </p>
          <p className="text-sm text-[#8892B0] mb-3">
            Connect your local bot to the CashClaw dashboard to see real-time order book data, P&L, and trade history.
          </p>
          <CopyBlock code={`# The API server exposes your bot's data (port 3000)
# It's already running if you started with pm2

# Verify API is working
curl http://localhost:3000/api/health

# Create a public HTTPS tunnel (dashboard needs HTTPS)
brew install cloudflared   # macOS
# apt install cloudflared  # Ubuntu

# Quick tunnel (temporary, changes URL on restart)
cloudflared tunnel --url http://localhost:3000

# Copy the https://xxx.trycloudflare.com URL`} />
          <div className="mt-3 bg-[#111627] border border-[#1E2640] rounded-lg p-4 text-sm text-[#8892B0] space-y-2">
            <p className="text-white font-bold">Connect to dashboard:</p>
            <p>1. Go to this dashboard &rarr; <span className="text-[#F59E0B]">Settings</span> tab</p>
            <p>2. Paste your tunnel URL in <span className="text-white">Bot API URL</span></p>
            <p>3. Click <span className="text-white">Save</span></p>
            <p>4. Dashboard now shows your live order book, trades, and P&L</p>
          </div>
          <div className="mt-3">
            <CollapsibleItem title="Permanent tunnel (recommended for 24/7)">
              <CopyBlock code={`# Create a named tunnel (URL stays the same)
cloudflared tunnel login
cloudflared tunnel create cashclaw-bot
cloudflared tunnel route dns cashclaw-bot bot.yourdomain.com

# Run permanently
cloudflared tunnel run cashclaw-bot

# Or run via PM2
pm2 start "cloudflared tunnel run cashclaw-bot" --name cf-tunnel`} />
            </CollapsibleItem>
          </div>
          <InfoBanner color="cyan" label="Order Book Data">
            <p>
              The bot stores order book snapshots in Redis and trade history in SQLite.
              When connected via tunnel, the dashboard reads this data in real-time
              showing bid/ask spreads, fill rates, P&L, and active positions.
            </p>
          </InfoBanner>
        </div>
      </div>
    </section>
  );
}
