/**
 * MurmurHash3_x86_32 implementation for strong avalanche effect.
 * Returns unsigned 32-bit integer.
 */

export function murmurhash3_32(key: string, seed = 0): number {
  let h1 = seed | 0;
  const c1 = 0xcc9e2d51 | 0;
  const c2 = 0x1b873593 | 0;
  const nblocks = Math.floor(key.length / 4);

  // body
  for (let i = 0; i < nblocks; i++) {
    let k1 = 0;
    const offset = i * 4;
    k1 |= key.charCodeAt(offset) & 0xff;
    k1 |= (key.charCodeAt(offset + 1) & 0xff) << 8;
    k1 |= (key.charCodeAt(offset + 2) & 0xff) << 16;
    k1 |= (key.charCodeAt(offset + 3) & 0xff) << 24;

    k1 = (k1 * c1) >>> 0;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = (k1 * c2) >>> 0;

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1 = (h1 * 5 + 0xe6546b64) >>> 0;
  }

  // tail
  let k1_tail = 0;
  const tail = key.length & 3;
  if (tail === 3) k1_tail ^= (key.charCodeAt(nblocks * 4 + 2) & 0xff) << 16;
  if (tail >= 2) k1_tail ^= (key.charCodeAt(nblocks * 4 + 1) & 0xff) << 8;
  if (tail >= 1) k1_tail ^= (key.charCodeAt(nblocks * 4) & 0xff);

  k1_tail = (k1_tail * c1) >>> 0;
  k1_tail = (k1_tail << 15) | (k1_tail >>> 17);
  k1_tail = (k1_tail * c2) >>> 0;
  h1 ^= k1_tail;

  // finalization
  h1 ^= key.length;
  h1 ^= h1 >>> 16;
  h1 = (h1 * 0x85ebca6b) >>> 0;
  h1 ^= h1 >>> 13;
  h1 = (h1 * 0xc2b2ae35) >>> 0;
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

/**
 * Hash function using MurmurHash3 for strong avalanche.
 * Works in Cloudflare Workers without external dependencies.
 * Returns 32-bit unsigned integer.
 */
export function hashString(key: string): number {
  return murmurhash3_32(key, 0);
}
