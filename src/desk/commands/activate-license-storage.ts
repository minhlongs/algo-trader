/**
 * License Activation Helpers
 * Helper functions for interactive key prompt and .env file persistence
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

export const ENV_PATH = join(process.cwd(), '.env');

export async function promptLicenseKey(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter your license key: ', (answer: string) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Save encrypted license key to .env file
 */
export function saveEncryptedLicenseToEnv(encryptedKey: string): void {
  let envContent = '';

  if (existsSync(ENV_PATH)) {
    envContent = readFileSync(ENV_PATH, 'utf-8');

    // Remove existing LICENSE_KEY and LICENSE_KEY_ENCRYPTED if present
    const lines = envContent.split('\n');
    const filteredLines = lines.filter(
      (line) => !line.startsWith('LICENSE_KEY=') && !line.startsWith('LICENSE_KEY_ENCRYPTED=')
    );
    envContent = filteredLines.join('\n');

    // Ensure newline at end
    if (!envContent.endsWith('\n')) {
      envContent += '\n';
    }
  }

  // Add encrypted license key
  envContent += `\n# Encrypted License Key (activated ${new Date().toISOString()})
# Do not modify - this is your encrypted license key
LICENSE_KEY_ENCRYPTED=${encryptedKey}
`;

  writeFileSync(ENV_PATH, envContent);
}
