/**
 * Setup Wizard - Readline Prompt Helpers
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
    rl.question(question + ' ', (answer: string) => {
      resolve(answer);
    });
  });
}
