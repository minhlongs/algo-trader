#!/usr/bin/env node
/**
 * Export all generated Stitch designs to HTML + DESIGN.md
 * Usage: npx tsx stitch-export-all.ts
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { execSync, spawn } from "child_process";

const STITCH_MCP = "/opt/homebrew/bin/stitch-mcp";
const EXPORTS_DIR = "/Users/macbook/algo-trader/dashboard/stitch-exports";
const TOKEN = execSync("gcloud auth print-access-token 2>/dev/null").toString().trim();

function callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      STITCH_ACCESS_TOKEN: TOKEN,
      GOOGLE_CLOUD_PROJECT: "openclaw-raas-hub-1770348928",
    };
    const child = spawn(STITCH_MCP, ["tool", toolName, "--data", JSON.stringify(args), "--output", "json"], {
      stdio: ["pipe", "pipe", "inherit"], env,
    });
    let output = "";
    child.stdout.on("data", (d) => { output += d.toString(); });
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Exit ${code}: ${output.slice(0, 300)}`));
      try { resolve(JSON.parse(output)); } catch { reject(new Error(`Parse: ${output.slice(0, 300)}`)); }
    });
    setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Timeout 90s")); }, 90000);
  });
}

async function exportDesign(dir: string, name: string, projectId: string, screenId: string) {
  try {
    console.error(`[${name}] Exporting ${screenId}...`);
    const result = await callTool("edit_screens", {
      projectId,
      selectedScreenIds: [screenId],
      prompt: "Return the complete HTML code for this design as a self-contained file with embedded Tailwind CSS. Wrap the HTML in a markdown code block with language html.",
      deviceType: "DESKTOP",
    });

    const text =
      (result as { outputComponents?: Array<{ text?: string }> }).outputComponents?.[0]?.text ||
      (result as { content?: Array<{ text?: string }> }).content?.[0]?.text || "";
    const htmlMatch = text.match(/```html\n([\s\S]*?)\n```/) || text.match(/```html\n([\s\S]*)$/);
    if (htmlMatch) {
      writeFileSync(join(dir, "design.html"), htmlMatch[1].trim());
      console.error(`[${name}] ✓ design.html (${htmlMatch[1].trim().length} chars)`);
    } else {
      writeFileSync(join(dir, "design-raw.txt"), text.slice(0, 8000));
      console.error(`[${name}] ⚠ No HTML, saved raw (${text.length} chars)`);
    }

    // Extract design tokens
    const colors: Record<string, string> = {};
    const colorRegex = /(?:background|text|border|fill)-color[^"'>]*["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = colorRegex.exec(text)) !== null) {
      const v = m[1];
      if (/^#[0-9a-fA-F]{3,8}$/.test(v) && !colors[v]) colors[v] = v;
    }
    const fontMatch = text.match(/font-family:\s*([^;]+);/);
    const fonts = fontMatch ? fontMatch[1].split(",").map((f) => f.trim().replace(/['"]/g, "")) : ["Inter"];

    const designMd = `# Design System: ${name}\n\n## Colors\n| Role | Value |\n|------|-------|\n${Object.entries(colors).slice(0, 12).map(([k, v]) => `| ${k} | \`${v}\` |`).join("\n")}\n\n## Typography\n- **Font family**: ${fonts.join(", ")}\n- **Base size**: 16px\n\n## Layout\n- **Max width**: 1200px\n- **Sidebar**: 240px fixed left\n- **Header**: 64px fixed top\n\n## Source\n- Screen ID: ${screenId}\n- Export: ${new Date().toISOString()}\n`;
    writeFileSync(join(dir, "DESIGN.md"), designMd);
    console.error(`[${name}] ✓ DESIGN.md`);
  } catch (e) {
    console.error(`[${name}] ✗ ${(e as Error).message}`);
  }
}

async function main() {
  const dirs = readdirSync(EXPORTS_DIR)
    .filter((f) => {
      const full = join(EXPORTS_DIR, f);
      try { return statSync(full).isDirectory() && existsSync(join(full, "metadata.json")); } catch { return false; }
    })
    .map((f) => join(EXPORTS_DIR, f));

  console.error(`[i] Exporting ${dirs.length} designs...`);
  for (const dir of dirs) {
    const meta = JSON.parse(readFileSync(join(dir, "metadata.json"), "utf-8"));
    if (meta.screenId && meta.name && meta.projectId) await exportDesign(dir, meta.name, meta.projectId, meta.screenId);
  }
  console.error(`\n[✓] Export complete`);
}
main().catch((e) => { console.error(`[X] ${e.message}`); process.exit(1); });
