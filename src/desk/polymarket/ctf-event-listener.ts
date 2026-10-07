/**
 * CTF Resolution Events Listener
 */
import { ethers } from 'ethers';
import { logger } from '../../shared/utils/logger';

export class CtfEventListener {
  private readonly provider: ethers.Provider;
  private readonly contract: ethers.Contract;

  constructor(provider: ethers.Provider, contractAddress: string) {
    this.provider = provider;
    this.contract = new ethers.Contract(
      contractAddress,
      ['event Resolution(bytes32 indexed questionId, uint256 indexed nonce, uint256 indexed timestamp)'],
      this.provider
    );
  }

  public listen(onResolution: (questionId: string, nonce: string) => void): void {
    this.contract.on('Resolution', (questionId: string, nonce: bigint, timestamp: bigint) => {
      logger.info('[CTFEventListener] Resolution detected', { questionId, nonce: nonce.toString() });
      onResolution(questionId, nonce.toString());
    });
  }
}
