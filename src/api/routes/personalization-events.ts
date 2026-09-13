/**
 * Personalization & A/B Testing Analytics Event Storage Helpers
 */

import type { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { z } from 'zod';
import { logger } from '../../shared/utils/logger';

export type ExpressRouterType = Router;

export const DATA_DIR = path.resolve(process.cwd(), 'data', 'personalization');

export const eventBodySchema = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  eventType: z.string().min(1, 'eventType is required'),
  eventData: z.record(z.string(), z.unknown()).optional(),
});

export interface PersonalizationEventRecord {
  tenantId: string;
  eventType: string;
  eventData?: Record<string, unknown>;
  timestamp: string;
}

/** Ensure data directory exists */
export async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

/** Get events file path for a tenant */
export function getEventsFilePath(tenantId: string): string {
  const safeTenantId = tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `events_${safeTenantId}.json`);
}

/** Record a personalization analytics event to tenant-isolated storage */
export async function recordPersonalizationEvent(
  tenantId: string,
  eventType: string,
  eventData?: Record<string, unknown>
): Promise<{ status: string; eventId: string }> {
  await ensureDataDir();

  const filePath = getEventsFilePath(tenantId);
  const timestamp = new Date().toISOString();

  const eventRecord: PersonalizationEventRecord = {
    tenantId,
    eventType,
    eventData,
    timestamp,
  };

  // Read existing events
  let events: PersonalizationEventRecord[] = [];
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    events = JSON.parse(content);
    if (!Array.isArray(events)) events = [];
  } catch {
    // File doesn't exist or invalid JSON - start fresh
    events = [];
  }

  // Append new event
  events.push(eventRecord);

  // Keep only last 1000 events per tenant to prevent unbounded growth
  if (events.length > 1000) {
    events = events.slice(-1000);
  }

  // Write back
  await fs.writeFile(filePath, JSON.stringify(events, null, 2), 'utf-8');

  logger.info('[Personalization] Event recorded', { tenantId, eventType });
  return { status: 'created', eventId: `${tenantId}_${Date.now()}` };
}
