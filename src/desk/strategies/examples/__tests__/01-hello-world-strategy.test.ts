import { describe, it, expect } from 'vitest';
import { HelloWorldStrategy } from '../01-hello-world-strategy';

describe('examples::01-hello-world-strategy', () => {
  it('loads HelloWorldStrategy', () => {
    expect(typeof HelloWorldStrategy).toBe('function');
  });
});

