import { describe, it, expect } from 'vitest';
import { registerDripRecipient } from '../welcome-email-drip';

describe('Welcome Email Drip', () => {
  it('should register a drip recipient without throwing', () => {
    // Should not throw even when data dir doesn't exist yet
    expect(() => registerDripRecipient('test@example.com', 'PRO')).not.toThrow();
  });

  it('should handle duplicate registration gracefully', () => {
    expect(() => registerDripRecipient('test@example.com', 'PRO')).not.toThrow();
    expect(() => registerDripRecipient('test@example.com', 'PRO')).not.toThrow();
  });
});
