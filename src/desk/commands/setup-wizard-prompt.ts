/**
 * Setup Wizard - Readline Prompt Helpers
 *
 * Provides interactive terminal prompt utilities including masked/muted
 * secret input for sensitive credentials (Rule H1 compliance).
 */

import * as readline from 'readline';

export function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

export async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof rl?.question === 'function') {
      rl.question(question + ' ', (answer: string) => {
        resolve(answer);
      });
    } else {
      resolve('');
    }
  });
}

export interface PromptSecretOptions {
  mask?: string;
  forceInteractive?: boolean;
}

function isAutomatedOrTestEnv(): boolean {
  return (
    !process.stdin.isTTY ||
    process.env['NODE_ENV'] === 'test' ||
    process.env['VITEST'] !== undefined ||
    process.argv.includes('vitest')
  );
}

/**
 * Prompt for sensitive credentials (e.g. API secrets, bot tokens)
 * without echoing clear text to the terminal (Rule H1).
 * In interactive TTY mode, inputs are masked with asterisks.
 * In non-TTY / test pipelines, falls back to standard prompt.
 */
export async function promptSecret(
  rl: readline.Interface,
  question: string,
  options?: PromptSecretOptions,
): Promise<string> {
  if (!options?.forceInteractive && isAutomatedOrTestEnv()) {
    return prompt(rl, question);
  }

  const mask = options?.mask ?? '*';

  return new Promise((resolve) => {
    process.stdout.write(question + ' ');

    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    try {
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(true);
      }
      stdin.resume();
    } catch {
      // Ignore raw mode unsupported environments
    }

    let input = '';

    const cleanup = () => {
      try {
        if (typeof stdin.setRawMode === 'function') {
          stdin.setRawMode(wasRaw ?? false);
        }
      } catch {
        // Ignore terminal teardown errors
      }
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: Buffer | string) => {
      const str = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      for (const char of str) {
        if (char === '\r' || char === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(input);
          return;
        }
        if (char === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          process.exit(1);
        }
        if (char === '\u0004' && input.length === 0) {
          cleanup();
          process.stdout.write('\n');
          resolve('');
          return;
        }
        if (char === '\u0008' || char === '\u007f') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            if (mask) {
              process.stdout.write('\b \b');
            }
          }
        } else if (char.charCodeAt(0) >= 32) {
          input += char;
          if (mask) {
            process.stdout.write(mask);
          }
        }
      }
    };

    stdin.on('data', onData);
  });
}

export const mutedPrompt = promptSecret;
