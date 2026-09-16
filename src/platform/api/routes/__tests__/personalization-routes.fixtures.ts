/**
 * Personalization Routes Test Fixtures
 *
 * Pure helper functions — no vi.mock (Vitest cannot export hoisted variables).
 */

import express, { type Express } from 'express';
import { join } from 'node:path';
import type { Mock } from 'vitest';
import { personalizationRouter } from '../personalization-routes';

export interface VfsState {
  vfs: Map<string, string>;
  mockExistsSync: Mock;
  mockMkdirSync: Mock;
  mockWriteFileSync: Mock;
  mockReadFileSync: Mock;
  mockReaddirSync: Mock;
}

export function dataDirPath(): string {
  return join(process.cwd(), 'data', 'personalization');
}

export function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/personalization', personalizationRouter);
  return app;
}

export function seedVfs(state: VfsState, filename: string, content: string) {
  state.vfs.set(join(dataDirPath(), filename), content);
}

function defaultExistsSync(state: VfsState) {
  return (p: unknown): boolean => {
    const s = String(p);
    return s.endsWith('personalization') || state.vfs.has(s);
  };
}

function defaultReadFileSync(state: VfsState) {
  return (p: unknown): string => {
    const pathStr = String(p);
    if (state.vfs.has(pathStr)) return state.vfs.get(pathStr)!;
    throw new Error(`ENOENT: ${pathStr}`);
  };
}

function defaultReaddirSync(state: VfsState) {
  return (p: unknown): string[] => {
    const pathStr = String(p);
    if (pathStr.endsWith('personalization')) {
      return [...state.vfs.keys()]
        .filter((k) => k.startsWith(dataDirPath()))
        .map((k) => k.split('/').pop()!)
        .filter(Boolean);
    }
    return [];
  };
}

export function setupVfsDefaults(state: VfsState): void {
  state.mockExistsSync.mockImplementation(defaultExistsSync(state));
  state.mockMkdirSync.mockImplementation(() => {});
  state.mockWriteFileSync.mockImplementation((p: unknown, data: string) => {
    state.vfs.set(String(p), String(data));
  });
  state.mockReadFileSync.mockImplementation(defaultReadFileSync(state));
  state.mockReaddirSync.mockImplementation(defaultReaddirSync(state));
}
