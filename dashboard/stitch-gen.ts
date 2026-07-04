/**
 * stitch-gen.ts — Generate Stitch designs via stdio proxy.
 * Usage: npx tsx stitch-gen.ts "<prompt>" [projectName] [device]
 */
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PROXY = "/Users/macbook/.claude/skills/stitch/scripts/stitch-proxy.sh";
const OUT = "/Users/macbook/algo-trader/dashboard/stitch-exports";

function callMcp(method: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(PROXY, [], { stdio: ["pipe", "pipe", "inherit"] });
    let buf = "";
    const reqId = Date.now();

    child.stdout.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === reqId) {
            if (msg.result) resolve(msg.result);
            else if (msg.error) reject(new Error(`MCP ${msg.error.message}`));
          }
        } catch {}
      }
    });

    child.on("close", () => {
      if (!buf.trim()) return reject(new Error("No response"));
      try {
        const msg = JSON.parse(buf);
        if (msg.result) resolve(msg.result);
        else if (msg.error) reject(new Error(`MCP ${msg.error.message}`));
        else resolve(msg);
      } catch { reject(new Error("Invalid response")); }
    });

    const req = { jsonrpc: "2.0", id: reqId, method: `tools/call`, params: { name: method, arguments: params } };
    child.stdin.write(JSON.stringify(req) + "\n");
    child.stdin.end();
    setTimeout(() => { child.kill(); reject(new Error("Timeout 60s")); }, 60000);
  });
}

async function getOrCreateProject(title: string): Promise<string> {
  const projects = await callMcp("list_projects", {}) as Array<{ name: string; title?: string }>;
  const existing = projects.find(p => p.title === title);
  if (existing) {
    const m = existing.name.match(/projects\/(\d+)/);
    if (m) return m[1];
  }
  const result = await callMcp("create_project", { title }) as { name: string };
  const m = result.name.match(/projects\/(\d+)/);
  if (!m) throw new Error(`Bad project name: ${result.name}`);
  return m[1];
}

async function main() {
  const prompt = process.argv[2];
  const projectName = process.argv[3] || "algo-trader-dashboard";
  const device = (process.argv[4] || "DESKTOP").toUpperCase();

  if (!prompt) { console.error("Usage: npx tsx stitch-gen.ts <prompt> [projectName] [device]"); process.exit(1); }

  console.error(`[i] Project: ${projectName}`);
  const projectId = await getOrCreateProject(projectName);
  console.error(`[i] Project ID: ${projectId}`);

  const result = await callMcp("generate_screen_from_text", { prompt, projectId, deviceType: device });
  const content = (result as { content?: Array<{ text?: string }> }).content?.[0]?.text;
  if (!content) { console.error("[X] No content in response"); process.exit(1); }

  const obj = JSON.parse(content);
  const screen = obj.outputComponents?.[1]?.design?.screens?.[0];
  if (!screen) { console.error("[X] No screen in response"); process.exit(1); }

  const screenId = screen.id;
  const title = screen.title || "untitled";
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const dir = join(OUT, `${slug}-${screenId.slice(0, 8)}`);
  mkdirSync(dir, { recursive: true });

  // Parse nested dicts
  const parseField = (f: unknown): Record<string, unknown> | undefined => {
    if (!f) return undefined;
    if (typeof f === "string") {
      try { return JSON.parse(f.replace(/'/g, '"')); } catch { return undefined; }
    }
    return f as Record<string, unknown>;
  };

  const screenshot = parseField(screen.screenshot);
  const htmlCode = parseField(screen.htmlCode);
  const theme = parseField(screen.theme);
  const designSystem = parseField(screen.designSystem);

  // Download assets
  if (screenshot?.downloadUrl) {
    const url = screenshot.downloadUrl as string;
    const ext = url.includes("png") ? "png" : url.includes("jpg") ? "jpg" : "webp";
    writeFileSync(join(dir, `design.${ext}`), Buffer.from(url.split(",")[1] || "", "base64"));
    // Actually use fetch for binary
    console.error(`[i] Screenshot: ${url.slice(0, 60)}...`);
  }

  // Save metadata
  const meta = { screenId, title, projectId, theme, designSystem };
  writeFileSync(join(dir, "metadata.json"), JSON.stringify(meta, null, 2));

  console.error(`[OK] Screen: ${title} (${screenId})`);
  console.error(`[OK] Output: ${dir}`);
  console.log(JSON.stringify({ screenId, title, projectId, dir }, null, 2));
}

main().catch(e => { console.error(`[X] ${e.message}`); process.exit(1); });
