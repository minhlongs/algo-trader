#!/usr/bin/env node
/**
 * Export all 10 Stitch designs using correct edit_screens schema
 * Usage: npx tsx stitch-export-all-v2.ts
 */
import { spawn } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { execSync } from "child_process";

const PROXY = "/Users/macbook/algo-trader/dashboard/stitch-proxy.sh";
const EXPORTS_DIR = "/Users/macbook/algo-trader/dashboard/stitch-exports";

interface DesignMeta {
  name: string;
  screenId: string;
  projectId: string;
  dir: string;
}

function callTool(projectId: string, screenId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const params = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "edit_screens",
        arguments: {
          projectId,
          selectedScreenIds: [screenId],
          prompt: "Return the complete HTML code for this design as a self-contained file with embedded Tailwind CSS. Wrap the HTML in a markdown code block with language html.",
          deviceType: "DESKTOP",
        },
      },
    });

    const child = spawn(PROXY, [], { stdio: ["pipe", "pipe", "inherit"] });
    let output = "";
    child.stdout.on("data", (d) => { output += d.toString(); });
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Exit ${code}: ${output.slice(0, 300)}`));
      resolve(output);
    });
    setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Timeout 90s")); }, 90000);
  });
}

async function exportDesign(meta: DesignMeta) {
  const { name, screenId, projectId, dir } = meta;
  console.error(`[${name}] Exporting ${screenId}...`);

  try {
    const result = await callTool(projectId, screenId);

    // Extract HTML from markdown code block
    const htmlMatch = result.match(/```html\n([\s\S]*?)\n```/) || result.match(/```html\n([\s\S]*)$/);
    if (htmlMatch) {
      writeFileSync(join(dir, "design.html"), htmlMatch[1].trim());
      console.error(`[${name}] ✓ design.html (${htmlMatch[1].trim().length} chars)`);
    } else {
      // Try raw HTML
      const htmlStart = result.search(/<!DOCTYPE|<html/i);
      if (htmlStart >= 0) {
        writeFileSync(join(dir, "design.html"), result.slice(htmlStart));
        console.error(`[${name}] ✓ design.html (raw, ${result.slice(htmlStart).length} chars)`);
      } else {
        writeFileSync(join(dir, "design-raw.txt"), result.slice(0, 8000));
        console.error(`[${name}] ⚠ No HTML, saved raw (${result.length} chars)`);
      }
    }

    // Extract colors
    const colors = [...new Set((result.match(/#[0-9a-fA-F]{3,8}/g) || []).slice(0, 12))].join("\n");
    writeFileSync(join(dir, "colors.txt"), colors);

    // Generate DESIGN.md
    const designMd = `# Design System: ${name}

## Colors
\`\`\`
${colors}
\`\`\`

## Typography
- **Font family**: Inter, JetBrains Mono
- **Base size**: 16px

## Layout
- **Max width**: 1440px
- **Sidebar**: 240px fixed left
- **Header**: 64px fixed top

## Source
- Screen ID: ${screenId}
- Project ID: ${projectId}
- Export: ${new Date().toISOString()}
`;
    writeFileSync(join(dir, "DESIGN.md"), designMd);
    console.error(`[${name}] ✓ DESIGN.md`);
  } catch (e) {
    console.error(`[${name}] ✗ ${(e as Error).message}`);
  }
}

async function main() {
  const designs: DesignMeta[] = [
    { name: "dashboard-main", screenId: "30a5d143ce0c4939ab4a2b4c71551ae5", projectId: "9841518857639705579", dir: join(EXPORTS_DIR, "cashclaw-logo-30a5d143") },
    { name: "marketplace", screenId: "ff86e44bfd904a36b1f2fb1879c359f0", projectId: "9223280557548943993", dir: join(EXPORTS_DIR, "cashclaw-logo-ff86e44b") },
    { name: "backtests", screenId: "884985d4293e47e98c6e133018b200c2", projectId: "15601339422458933475", dir: join(EXPORTS_DIR, "backtest-results-cashclaw-884985d4") },
    { name: "licenses", screenId: "aa53a21f934f486e8e30f0426edb7bfe", projectId: "18048821789194133274", dir: join(EXPORTS_DIR, "licenses-dashboard-aa53a21f") },
    { name: "reporting", screenId: "382f18ed99754c94b05d719b51b6968a", projectId: "1591913176034048049", dir: join(EXPORTS_DIR, "cashclaw-trade-reporting-382f18ed") },
    { name: "settings", screenId: "b65ae6e231a943e9ad2f82981b99ab60", projectId: "12439834485986853627", dir: join(EXPORTS_DIR, "cashclaw-setup-guide-b65ae6e2") },
    { name: "guide", screenId: "50ada12ef3f34461a95f0c1fc82154c7", projectId: "14684571356404475948", dir: join(EXPORTS_DIR, "cashclaw-operator-guide-running-the-bot-50ada12e") },
    { name: "account", screenId: "f18244311d164f4cb5ca1e3e3880e5a5", projectId: "1981230436523722346", dir: join(EXPORTS_DIR, "account-settings-cashclaw-f1824431") },
    { name: "setup-guide", screenId: "b65ae6e231a943e9ad2f82981b99ab60", projectId: "12439834485986853627", dir: join(EXPORTS_DIR, "cashclaw-setup-guide-b65ae6e2") },
    { name: "landing", screenId: "f70cb62204bb4564a67681ad5707152a", projectId: "9357175465132502359", dir: join(EXPORTS_DIR, "cashclaw-landing-page-f70cb622") },
  ];

  console.error(`[i] Exporting ${designs.length} designs...`);
  for (const design of designs) {
    await exportDesign(design);
  }
  console.error(`\n[✓] Export complete`);
}

main().catch((e) => { console.error(`[X] ${e.message}`); process.exit(1); });
