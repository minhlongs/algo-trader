import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as readline from 'readline';
import { EventEmitter } from 'events';
import {
  createPrompt,
  prompt,
  promptSecret,
  mutedPrompt,
} from '../../../../src/desk/commands/setup-wizard-prompt';

describe('setup-wizard-prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createPrompt creates a readline Interface', () => {
    const rl = createPrompt();
    expect(rl).toBeDefined();
    rl.close();
  });

  it('prompt resolves answer from rl.question', async () => {
    const mockRl = {
      question: vi.fn((_q: string, cb: (ans: string) => void) => {
        cb('test-input');
      }),
      close: vi.fn(),
    } as unknown as readline.Interface;

    const result = await prompt(mockRl, 'Enter value:');
    expect(result).toBe('test-input');
    expect(mockRl.question).toHaveBeenCalledWith('Enter value: ', expect.any(Function));
  });

  it('prompt gracefully handles missing question function', async () => {
    const mockRl = {} as unknown as readline.Interface;
    const result = await prompt(mockRl, 'Enter value:');
    expect(result).toBe('');
  });

  it('promptSecret delegates to prompt in automated/test environment', async () => {
    const mockRl = {
      question: vi.fn((_q: string, cb: (ans: string) => void) => {
        cb('secret123');
      }),
      close: vi.fn(),
    } as unknown as readline.Interface;

    const result = await promptSecret(mockRl, 'API Secret:');
    expect(result).toBe('secret123');
  });

  it('mutedPrompt is an alias of promptSecret', () => {
    expect(mutedPrompt).toBe(promptSecret);
  });

  it('promptSecret with forceInteractive masks typing with asterisks (Rule H1)', async () => {
    const fakeStdin = new EventEmitter() as EventEmitter & {
      isRaw?: boolean;
      setRawMode?: (mode: boolean) => void;
      resume?: () => void;
    };
    fakeStdin.setRawMode = vi.fn();
    fakeStdin.resume = vi.fn();

    const origStdin = process.stdin;
    const origStdoutWrite = process.stdout.write;
    const stdoutWrites: string[] = [];

    // Replace stdout.write and stdin
    process.stdout.write = vi.fn((chunk: string | Uint8Array) => {
      stdoutWrites.push(String(chunk));
      return true;
    }) as unknown as typeof process.stdout.write;

    Object.defineProperty(process, 'stdin', {
      value: fakeStdin,
      configurable: true,
      writable: true,
    });

    try {
      const mockRl = {} as readline.Interface;
      const secretPromise = promptSecret(mockRl, 'Secret:', { forceInteractive: true });

      // Emit typed characters: 'a', 'b', 'c', backspace, 'd', '\n'
      fakeStdin.emit('data', Buffer.from('a'));
      fakeStdin.emit('data', Buffer.from('b'));
      fakeStdin.emit('data', Buffer.from('c'));
      fakeStdin.emit('data', Buffer.from('\u007f')); // backspace
      fakeStdin.emit('data', Buffer.from('d'));
      fakeStdin.emit('data', Buffer.from('\r')); // enter

      const result = await secretPromise;
      expect(result).toBe('abd');

      // Verify cleartext 'abd' was NEVER written to stdout
      const allStdout = stdoutWrites.join('');
      expect(allStdout).not.toContain('abd');
      expect(allStdout).not.toContain('a');
      expect(allStdout).toContain('*');
      expect(allStdout).toContain('\b \b');
    } finally {
      process.stdout.write = origStdoutWrite;
      Object.defineProperty(process, 'stdin', {
        value: origStdin,
        configurable: true,
        writable: true,
      });
    }
  });
});
