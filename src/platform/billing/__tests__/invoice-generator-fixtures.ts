/**
 * Shared constants and helpers for Invoice Generator tests
 */

import { join } from 'node:path';

export const invoiceDir = join(process.cwd(), 'data', 'invoices');

export function makeSeedVfs(vfs: Map<string, string>) {
  return (filename: string, content: string) => {
    vfs.set(join(invoiceDir, filename), content);
  };
}

export function makeDefaultReadFileSync(vfs: Map<string, string>) {
  return (p: unknown): string => {
    const pathStr = String(p);
    if (vfs.has(pathStr)) return vfs.get(pathStr)!;
    throw new Error(`ENOENT: ${pathStr}`);
  };
}
