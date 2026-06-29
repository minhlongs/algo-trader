/**
 * Citadel Attest CLI — ops command: bun citadel:attest --subscriber=<id>
 * Issues a signed attestation JWT for a subscriber and prints it.
 * Entry point registered in package.json scripts as "citadel:attest".
 */

import { generateDid, computeMeasurement, issueAttestationQuote, currentCitadelMode } from './index';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const subArg = args.find((a) => a.startsWith('--subscriber='));
  const agentArg = args.find((a) => a.startsWith('--agent='));

  if (!subArg) {
    console.error('Usage: bun citadel:attest --subscriber=<id> [--agent=<identifier>]');
    process.exit(1);
  }

  const subscriberId = subArg.split('=')[1]!.trim();
  const agentIdentifier = agentArg ? agentArg.split('=')[1]!.trim() : `agent-${subscriberId}`;

  console.log(`[Citadel] Mode: ${currentCitadelMode()}`);
  console.log(`[Citadel] Attesting subscriber: ${subscriberId}`);

  // Generate DID for this subscriber (fresh key pair each invocation — in prod, load from DB)
  const { did, publicKeyHex } = generateDid();
  console.log(`[Citadel] DID: ${did}`);
  console.log(`[Citadel] PublicKey: ${publicKeyHex}`);

  // Compute measurement
  const { hash: measurementHash } = computeMeasurement({ agentIdentifier });
  console.log(`[Citadel] Measurement: ${measurementHash}`);

  // Issue attestation quote
  const quote = await issueAttestationQuote({ subscriberId, did, measurementHash });

  console.log('\n[Citadel] Attestation JWT:');
  console.log(quote.jwt);
  console.log(`\n[Citadel] Issued at: ${new Date(quote.issuedAt * 1000).toISOString()}`);
  console.log(`[Citadel] Expires at: ${new Date(quote.expiresAt * 1000).toISOString()}`);
}

main().catch((err) => {
  console.error('[Citadel] Fatal:', err);
  process.exit(1);
});
