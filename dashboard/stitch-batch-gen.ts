/**
 * stitch-batch-gen.ts — Generate multiple Stitch designs using SDK directly.
 * Usage: npx tsx stitch-batch-gen.ts
 */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

// Use stitch-sdk directly
const { StitchProxy } = require("/opt/homebrew/lib/node_modules/@_davideast/stitch-mcp/node_modules/@google/stitch-sdk/dist/src/index.js");
const { StdioServerTransport } = require("/opt/homebrew/lib/node_modules/@_davideast/stitch-mcp/node_modules/@modelcontextprotocol/sdk/server/stdio.js");

const OUT = "/Users/macbook/algo-trader/dashboard/stitch-exports";
mkdirSync(OUT, { recursive: true });

const TOKEN = execSync("gcloud auth print-access-token 2>/dev/null").toString().trim();
if (!TOKEN) { console.error("[X] No gcloud token"); process.exit(1); }

interface DesignJob { name: string; prompt: string; projectName: string; }

const JOBS: DesignJob[] = [
  { name: "dashboard-main", projectName: "algo-trader/dashboard-main", prompt: "Main trading dashboard for CashClaw. Dark theme (#051424 background), cyan (#06b6d4) accents. Top header with CashClaw logo. 12-column Bento Grid: candlestick chart, PnL analytics, positions table, system logs, spreads, signals, trade feed. Professional fintech. Inter + JetBrains Mono." },
  { name: "marketplace", projectName: "algo-trader/marketplace", prompt: "Strategy marketplace for CashClaw. Dark theme, cyan accents. Header with logo. Strategy cards: Market Making (active), Listing Arb (coming soon), Cross-Platform Arb (coming soon). Status badges, descriptions, activate buttons. Grid layout." },
  { name: "backtests", projectName: "algo-trader/backtests", prompt: "Backtest results page for CashClaw. Dark theme, cyan accents. Form: pair selector, timeframe, strategy, days. Results table with Sharpe, Sortino, Max DD, Return. Paginated. Professional trading UI." },
  { name: "licenses", projectName: "algo-trader/licenses", prompt: "License management for CashClaw. Dark theme, cyan accents. Tabs: Licenses, Audit Logs, Analytics. License table with keys, status, dates. Create button. Audit logs with timestamps." },
  { name: "reporting", projectName: "algo-trader/reporting", prompt: "Trade reporting for CashClaw. Dark theme, cyan accents. Summary stats: Total PnL, Win Rate, Avg Size, Total Trades. Paginated trade table (date, pair, side, size, PnL). CSV export. Date filters." },
  { name: "settings", projectName: "algo-trader/settings", prompt: "Settings page for CashClaw trading platform. Dark theme, cyan accents. Sections: Tenant config, Exchange API keys management, Alert rules, Market Making parameters form. Tabbed layout. Professional fintech." },
  { name: "guide", projectName: "algo-trader/guide", prompt: "Operator guide page for CashClaw. Dark theme, cyan accents. Step-by-step SOPs for running market-making bot. Sidebar with chapter navigation. Code blocks for configuration. Clean documentation layout." },
  { name: "account", projectName: "algo-trader/account", prompt: "Account page for CashClaw. Dark theme, cyan accents. User profile section (email, tenant ID, member since). Current plan limits. API key display with copy button. Billing info. Delete account option." },
  { name: "setup-guide", projectName: "algo-trader/setup-guide", prompt: "Setup guide page for CashClaw. Dark theme, cyan accents. Step-by-step setup from VPN to live trading. Progress indicator. Checklist items. Code snippets for configuration. Clean onboarding flow." },
  { name: "landing", projectName: "algo-trader/landing", prompt: "Landing page for CashClaw trading platform. Dark theme, cyan accents. Hero section with tagline. How-it-works section. Stats bar. Pricing preview. CTA buttons. Modern fintech marketing page." },
];

async function callMcp(method: string, params: Record<string, unknown>): Promise<unknown> {
  // Use stitch-mcp tool CLI directly with env vars
  const { spawn } = require("child_process");
  return new Promise((resolve, reject) => {
    const env = { ...process.env, STITCH_ACCESS_TOKEN: TOKEN, GOOGLE_CLOUD_PROJECT: "openclaw-raas-hub-1770348928" };
    const child = spawn("/opt/homebrew/bin/stitch-mcp", ["tool", method, "--data", JSON.stringify(params), "--output", "json"], {
      stdio: ["pipe", "pipe", "inherit"], env,
    });
    let output = "";
    child.stdout.on("data", (d) => { output += d.toString(); });
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Exit ${code}: ${output.slice(0, 200)}`));
      try { resolve(JSON.parse(output)); } catch { reject(new Error(`Parse error: ${output.slice(0, 200)}`)); }
    });
    setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Timeout 60s")); }, 60000);
  });
}

async function getOrCreateProject(title: string): Promise<string> {
  const result = await callMcp("list_projects", {}) as { projects?: Array<{ name: string; title?: string }> };
  const list = result.projects || [];
  const existing = list.find((p) => p.title === title);
  if (existing) { const m = existing.name.match(/projects\/(\d+)/); if (m) return m[1]; }
  const created = await callMcp("create_project", { title }) as { name: string };
  const m = created.name.match(/projects\/(\d+)/);
  if (!m) throw new Error(`Bad project: ${created.name}`);
  return m[1];
}

async function generateDesign(job: DesignJob): Promise<{ name: string; screenId: string; dir: string } | null> {
  try {
    console.error(`[${job.name}] Creating project...`);
    const projectId = await getOrCreateProject(job.projectName);
    console.error(`[${job.name}] Project: ${projectId}`);

    console.error(`[${job.name}] Generating design...`);
    const result = await callMcp("generate_screen_from_text", {
      prompt: job.prompt, projectId, deviceType: "DESKTOP",
    }) as { outputComponents?: Array<{ design?: { screens?: Array<{ id: string; title?: string }> } }> };

    const screen = result.outputComponents?.[1]?.design?.screens?.[0];
    if (!screen) { console.error(`[${job.name}] No screen: ${JSON.stringify(result).slice(0, 200)}`); return null; }

    const screenId = screen.id;
    const title = screen.title || job.name;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    const dir = join(OUT, `${slug}-${screenId.slice(0, 8)}`);
    mkdirSync(dir, { recursive: true });

    writeFileSync(join(dir, "metadata.json"), JSON.stringify({ screenId, title, projectId, name: job.name, prompt: job.prompt }, null, 2));
    console.error(`[${job.name}] ✓ ${title} (${screenId})`);
    return { name: job.name, screenId, dir };
  } catch (e) { console.error(`[${job.name}] ✗ ${(e as Error).message}`); return null; }
}

async function main() {
  console.error(`[i] Generating ${JOBS.length} designs...`);
  const results = await Promise.all(JOBS.map((j) => generateDesign(j)));
  const ok = results.filter(Boolean);
  console.error(`\n[✓] ${ok.length}/${JOBS.length} designs generated`);
  console.log(JSON.stringify(ok, null, 2));
}
main().catch((e) => { console.error(`[X] ${e.message}`); process.exit(1); });
