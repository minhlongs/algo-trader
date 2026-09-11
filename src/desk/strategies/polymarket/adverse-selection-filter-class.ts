import type { RawOrderBook } from '../../polymarket/clob-client';
import {
  DEFAULT_CONFIG,
  type AdverseSelectionConfig,
  type AdverseSelectionScore,
} from './adverse-selection-types';
import { computeCompositeScore } from './adverse-selection-scoring';

export class AdverseSelectionFilter {
  private readonly config: AdverseSelectionConfig;
  /** Per-market spread history keyed by tokenId */
  private readonly spreadHistories = new Map<string, number[]>();

  constructor(config: Partial<AdverseSelectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze a single order book snapshot for adverse selection risk.
   * Records spread data internally for trend detection.
   */
  analyze(book: RawOrderBook): AdverseSelectionScore {
    // Update spread history
    const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
    const spread = bestAsk - bestBid;

    // Use a shared history key (empty string = single-market mode)
    let history = this.spreadHistories.get('default');
    if (!history) {
      history = [];
      this.spreadHistories.set('default', history);
    }
    history.push(spread);
    if (history.length > this.config.spreadHistorySize) {
      history.splice(0, history.length - this.config.spreadHistorySize);
    }

    return computeCompositeScore(book, history, this.config);
  }

  /**
   * Analyze a specific market's order book by token ID.
   * Maintains per-market spread history for better trend detection.
   */
  async analyzeMarket(
    tokenId: string,
    getBook: (tokenId: string) => Promise<RawOrderBook>,
  ): Promise<AdverseSelectionScore> {
    const book = await getBook(tokenId);

    // Update per-market spread history
    const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : 0;
    const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : 1;
    const spread = bestAsk - bestBid;

    let history = this.spreadHistories.get(tokenId);
    if (!history) {
      history = [];
      this.spreadHistories.set(tokenId, history);
    }
    history.push(spread);
    if (history.length > this.config.spreadHistorySize) {
      history.splice(0, history.length - this.config.spreadHistorySize);
    }

    return computeCompositeScore(book, history, this.config);
  }
}
