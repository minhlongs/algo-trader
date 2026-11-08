/**
 * Fail-closed validation of the CLOB V2/V3 `positionId` field.
 *
 * The V2/V3 exchange signs an escrowed per-outcome ERC-1155 position, so `positionId`
 * must be that id itself. Deriving one (e.g. keccak-hashing `tokenId`) yields a
 * signature the exchange can never match, and an empty or non-hex string hashes into
 * a valid-looking value that silently targets the wrong position. Reject instead.
 */

import { ethers } from 'ethers';

import type { PolymarketOrder } from './polymarket-signer';

export function assertPositionIdUsable(order: PolymarketOrder): void {
  const positionId = order.positionId;
  if (typeof positionId !== 'string' || !ethers.isHexString(positionId, 32)) {
    throw new Error(
      'CLOB V2/V3 requires positionId as a 32-byte hex string (the ERC-1155 position id). ' +
      'Refusing to derive one by hashing a non-hex or empty tokenId.',
    );
  }
}
