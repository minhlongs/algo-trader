/**
 * DID Binder
 * Generates and resolves did:key DIDs from Ed25519 key pairs.
 * did:key spec: https://w3c-ccg.github.io/did-method-key/
 * Simplified: did:key:z<base58-encoded-multicodec-pubkey>
 * No external registry needed — self-contained.
 */

import crypto from 'crypto';

// Multicodec prefix for Ed25519 public key: 0xed01
const ED25519_MULTICODEC_PREFIX = Buffer.from([0xed, 0x01]);

export interface DidKeyPair {
  did: string;
  publicKeyHex: string;
  privateKeyHex: string;
}

export interface DidDocument {
  did: string;
  publicKeyHex: string;
}

/** Base58 encoding (Bitcoin alphabet) */
function toBase58(buf: Buffer): string {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = BigInt('0x' + buf.toString('hex'));
  const base = BigInt(58);
  const chars: string[] = [];
  while (num > 0n) {
    chars.unshift(ALPHABET[Number(num % base)]!);
    num = num / base;
  }
  // Leading zero bytes → '1'
  for (const byte of buf) {
    if (byte !== 0) break;
    chars.unshift('1');
  }
  return chars.join('');
}

/** Base58 decoding */
function fromBase58(s: string): Buffer {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let num = 0n;
  for (const ch of s) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base58 char: ${ch}`);
    num = num * 58n + BigInt(idx);
  }
  const hex = num.toString(16).padStart(2, '0');
  const bytes = Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
  const leading = s.match(/^1*/)?.[0]?.length ?? 0;
  return Buffer.concat([Buffer.alloc(leading), bytes]);
}

/**
 * Generate a new Ed25519 key pair and derive a did:key DID.
 */
export function generateDid(): DidKeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  // Ed25519 SPKI DER has 12-byte prefix before the 32-byte raw key
  const pubRaw = Buffer.from(pubDer).slice(-32);

  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  // Ed25519 PKCS8 DER: last 32 bytes are raw private key
  const privRaw = Buffer.from(privDer).slice(-32);

  const multicodec = Buffer.concat([ED25519_MULTICODEC_PREFIX, pubRaw]);
  const did = `did:key:z${toBase58(multicodec)}`;

  return {
    did,
    publicKeyHex: pubRaw.toString('hex'),
    privateKeyHex: privRaw.toString('hex'),
  };
}

/**
 * Resolve a did:key DID back to its public key hex.
 * Throws if DID format is invalid.
 */
export function resolveDid(did: string): DidDocument {
  if (!did.startsWith('did:key:z')) {
    throw new Error(`Unsupported DID format: ${did}`);
  }
  const encoded = did.slice('did:key:z'.length);
  const decoded = fromBase58(encoded);
  // Strip the 2-byte multicodec prefix
  const pubRaw = decoded.slice(2);
  return { did, publicKeyHex: pubRaw.toString('hex') };
}
