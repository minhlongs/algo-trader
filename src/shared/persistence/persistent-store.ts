/**
 * Persistent Store
 *
 * Generic JSON-file-backed Map storage for billing services.
 * Eliminates duplicated saveToFile/loadFromFile helpers across license,
 * subscription, dunning, and payment services.
 */

import * as fs from 'fs';
import * as path from 'path';

export class PersistentStore<T> {
	private storePath: string;

	constructor(storePath: string) {
		this.storePath = storePath;
	}

	/**
	 * Save a Map to JSON file (mirrors legacy saveToFile semantics).
	 */
	save(data: Map<string, T>): void {
		const dir = path.dirname(this.storePath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		const json = JSON.stringify(Array.from(data.entries()), null, 2);
		fs.writeFileSync(this.storePath, json, { encoding: 'utf-8', mode: 0o600 });
	}

	/**
	 * Load a Map from JSON file (mirrors legacy loadFromFile semantics).
	 * Returns empty Map on miss or parse failure.
	 */
	load(): Map<string, T> {
		try {
			if (!fs.existsSync(this.storePath)) return new Map();
			const raw = fs.readFileSync(this.storePath, 'utf-8');
			const entries: [string, T][] = JSON.parse(raw);
			return new Map(entries);
		} catch {
			return new Map();
		}
	}

	// ── plain-object helpers (for non-Map services) ────────────────────

	/**
	 * Read a JSON file and parse as T. Returns null on miss or parse failure.
	 */
	static readJson<T>(filePath: string): T | null {
		try {
			if (!fs.existsSync(filePath)) return null;
			const raw = fs.readFileSync(filePath, 'utf-8');
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	}

	/**
	 * Write a value as JSON, creating parent dirs with 0o600 mode.
	 */
	static writeJson(filePath: string, data: unknown): void {
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
	}

	/**
	 * Atomic write: write JSON to .tmp then rename — prevents partial writes on crash.
	 */
	static atomicWriteJson(filePath: string, data: unknown): void {
		const dir = path.dirname(filePath);
		if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
		const tmp = `${filePath}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
		fs.renameSync(tmp, filePath);
	}
}

// ── plain-object helpers (named exports for easy imports) ──
export function readJson<T>(filePath: string): T | null {
  return PersistentStore.readJson<T>(filePath);
}

export function writeJson(filePath: string, data: unknown): void {
  PersistentStore.writeJson(filePath, data);
}

export function atomicWriteJson(filePath: string, data: unknown): void {
  PersistentStore.atomicWriteJson(filePath, data);
}
