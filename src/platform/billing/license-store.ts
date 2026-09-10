/**
 * License Store
 * File-based JSON persistence for licenses
 */

import * as fs from 'fs';
import * as path from 'path';
import { License } from '../../shared/types/license';

/** Path to the JSON file storing licenses. Configurable via env var. */
export const STORE_PATH = process.env.LICENSE_STORE_PATH || path.join(process.cwd(), 'data', 'licenses.json');

/** Persist in-memory map to JSON file */
export function saveToFile(licenses: Map<string, License>, storePath: string = STORE_PATH): void {
	const dir = path.dirname(storePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	const data = JSON.stringify(Array.from(licenses.entries()), null, 2);
	fs.writeFileSync(storePath, data, 'utf-8');
}

/** Load licenses from JSON file into a Map */
export function loadFromFile(storePath: string = STORE_PATH): Map<string, License> {
	try {
		if (!fs.existsSync(storePath)) return new Map();
		const raw = fs.readFileSync(storePath, 'utf-8');
		const entries: [string, License][] = JSON.parse(raw);
		return new Map(entries);
	} catch {
		// Corrupted file — start fresh
		return new Map();
	}
}
