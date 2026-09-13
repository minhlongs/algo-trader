/**
 * In-memory rate counter cache for usage metering.
 */

import { currentPeriod } from './usage-metering-types';

/** In-memory counter cache — reset at period boundary or server restart. */
export class InMemoryCounter {
	private counts = new Map<string, number>();

	increment(key: string): number {
		const next = (this.counts.get(key) ?? 0) + 1;
		this.counts.set(key, next);
		return next;
	}

	get(key: string): number {
		return this.counts.get(key) ?? 0;
	}

	check(key: string, limit: number): { allowed: boolean; count: number } {
		const count = this.increment(key);
		return { allowed: count <= limit, count };
	}

	isNewPeriod(lastPeriod: string | undefined): boolean {
		return lastPeriod !== currentPeriod();
	}

	reset(keys: string[]): void {
		for (const k of keys) this.counts.delete(k);
	}
}
