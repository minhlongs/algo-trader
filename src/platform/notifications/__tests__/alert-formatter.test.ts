/**
 * Tests for alert-formatter — shared threshold-alert formatting helpers.
 *
 * Pure functions: no I/O, no mocks. Covers the three threshold branches
 * (CRITICAL >=100, URGENT >=90, WARNING <90) for every urgency/color/emoji/
 * action-message variant, plus progress-bar rounding, short-key slicing,
 * and the composite formatAlert/formatSmsBody/formatTelegramMessage formatters.
 */

import { describe, it, expect } from 'vitest';
import {
  getUrgency,
  getUrgencyColor,
  getEmoji,
  getActionMessage,
  getShortActionMessage,
  getTelegramActionMessage,
  generateProgressBar,
  generateTelegramProgressBar,
  getShortKey,
  formatAlert,
  formatEmailSubject,
  formatSmsBody,
  formatTelegramMessage,
  type AlertData,
} from '../alert-formatter';

function makeData(overrides: Partial<AlertData> = {}): AlertData {
  return {
    licenseKey: 'ABCDEFGH-12345678',
    threshold: 90,
    currentUsage: 900,
    dailyLimit: 1000,
    percentUsed: 90,
    ...overrides,
  };
}

describe('alert-formatter', () => {
  describe('getUrgency', () => {
    it('returns CRITICAL at/above 100', () => {
      expect(getUrgency(100)).toBe('CRITICAL');
      expect(getUrgency(150)).toBe('CRITICAL');
    });
    it('returns URGENT at/above 90', () => {
      expect(getUrgency(90)).toBe('URGENT');
      expect(getUrgency(99)).toBe('URGENT');
    });
    it('returns WARNING below 90', () => {
      expect(getUrgency(0)).toBe('WARNING');
      expect(getUrgency(50)).toBe('WARNING');
    });
  });

  describe('getUrgencyColor', () => {
    it('returns danger red at/above 100', () => {
      expect(getUrgencyColor(100)).toBe('#dc3545');
      expect(getUrgencyColor(120)).toBe('#dc3545');
    });
    it('returns orange at/above 90', () => {
      expect(getUrgencyColor(90)).toBe('#fd7e14');
      expect(getUrgencyColor(95)).toBe('#fd7e14');
    });
    it('returns warning yellow below 90', () => {
      expect(getUrgencyColor(50)).toBe('#ffc107');
    });
  });

  describe('getEmoji', () => {
    it('returns siren at/above 100', () => {
      expect(getEmoji(100)).toBe('🚨');
      expect(getEmoji(110)).toBe('🚨');
    });
    it('returns red circle at/above 90', () => {
      expect(getEmoji(90)).toBe('🔴');
      expect(getEmoji(95)).toBe('🔴');
    });
    it('returns warning below 90', () => {
      expect(getEmoji(50)).toBe('⚠️');
    });
  });

  describe('getActionMessage', () => {
    it('returns critical message at/above 100', () => {
      expect(getActionMessage(100)).toContain('reached or exceeded');
    });
    it('returns urgent message at/above 90', () => {
      expect(getActionMessage(90)).toContain('critically close');
    });
    it('returns warning message below 90', () => {
      expect(getActionMessage(50)).toContain('approaching');
    });
  });

  describe('getShortActionMessage', () => {
    it('returns LIMIT REACHED at/above 100', () => {
      expect(getShortActionMessage(100)).toBe(
        'LIMIT REACHED. Overage charges applying. Upgrade now.',
      );
    });
    it('returns LIMIT NEAR at/above 90', () => {
      expect(getShortActionMessage(90)).toBe(
        'LIMIT NEAR. Upgrade recommended to avoid overage.',
      );
    });
    it('returns monitor message below 90', () => {
      expect(getShortActionMessage(50)).toBe(
        'Monitor usage to avoid overage charges.',
      );
    });
  });

  describe('getTelegramActionMessage', () => {
    it('returns siren-prefixed message at/above 100', () => {
      expect(getTelegramActionMessage(100)).toContain('🚨 LIMIT REACHED!');
    });
    it('returns red-circle message at/above 90', () => {
      expect(getTelegramActionMessage(90)).toContain('🔴 CRITICAL!');
    });
    it('returns warning message below 90', () => {
      expect(getTelegramActionMessage(50)).toContain('⚠️ Warning');
    });
  });

  describe('generateProgressBar', () => {
    it('rounds filled segments and pads with empty blocks', () => {
      const bar = generateProgressBar(50, 10);
      expect(bar).toBe('[█████░░░░░]');
    });
    it('rounds half up at 55% of 10 segments', () => {
      expect(generateProgressBar(55, 10)).toBe('[██████░░░░]');
    });
    it('rounds half up at 65% of 10 segments', () => {
      expect(generateProgressBar(65, 10)).toBe('[███████░░░]');
    });
    it('defaults to 20 segments', () => {
      const bar = generateProgressBar(0);
      expect(bar).toBe('[' + '░'.repeat(20) + ']');
    });
  });

  describe('generateTelegramProgressBar', () => {
    it('divides percent by 10 with 10 segments', () => {
      expect(generateTelegramProgressBar(50)).toBe('[█████░░░░░]');
    });
    it('rounds half up at 65%', () => {
      expect(generateTelegramProgressBar(65)).toBe('[███████░░░]');
    });
  });

  describe('getShortKey', () => {
    it('returns the last 8 characters', () => {
      expect(getShortKey('ABCDEFGH-12345678')).toBe('12345678');
    });
    it('returns the full key when shorter than 8', () => {
      expect(getShortKey('ABC')).toBe('ABC');
    });
  });

  describe('formatAlert', () => {
    it('derives all fields from the threshold', () => {
      const alert = formatAlert(makeData({ threshold: 95, licenseKey: 'XXXXXXXX-12345678' }));
      expect(alert).toEqual({
        urgency: 'URGENT',
        urgencyColor: '#fd7e14',
        emoji: '🔴',
        shortKey: '12345678',
        actionMessage: 'Your usage is critically close to the daily limit. Overage charges may apply. Upgrade recommended.',
      });
    });
  });

  describe('formatEmailSubject', () => {
    it('wraps urgency in brackets with the threshold', () => {
      expect(formatEmailSubject(100)).toBe('[CRITICAL] Usage Alert: 100% threshold reached');
      expect(formatEmailSubject(50)).toBe('[WARNING] Usage Alert: 50% threshold reached');
    });
  });

  describe('formatSmsBody', () => {
    it('includes urgency, short key, usage ratio, action, and STOP opt-out', () => {
      const body = formatSmsBody(makeData({ threshold: 90, currentUsage: 900, dailyLimit: 1000, percentUsed: 90 }));
      expect(body).toContain('ALGO TRADER [URGENT]');
      expect(body).toContain('Key: *12345678');
      expect(body).toContain('Usage: 900/1000 (90%)');
      expect(body).toContain('LIMIT NEAR');
      expect(body).toContain('Reply STOP to opt out');
    });
  });

  describe('formatTelegramMessage', () => {
    it('renders Markdown with emoji, urgency, code key, progress bar, and action', () => {
      const body = formatTelegramMessage(makeData({ threshold: 100, currentUsage: 1000, dailyLimit: 1000, percentUsed: 100 }));
      expect(body).toContain('🚨 *CRITICAL - Usage Alert*');
      expect(body).toContain('Key: `12345678`');
      expect(body).toContain('Threshold: 100%');
      expect(body).toContain('Usage: 1,000 / 1,000');
      expect(body).toContain('🚨 LIMIT REACHED!');
    });
  });
});