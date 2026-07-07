/**
 * Shared helpers for MCP server unit tests.
 * Avoids duplicating dynamic import + type assertions.
 */

let cachedModule: any;

export async function importCode(modulePath: string): Promise<any> {
  if (cachedModule?.default) return cachedModule;
  const mod = await import(modulePath);
  cachedModule = mod;
  return mod;
}
