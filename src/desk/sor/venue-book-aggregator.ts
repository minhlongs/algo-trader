import { VenueBook, VenueId, OrderSide } from './sor-types';
import { FeeGasModel } from './fee-gas-model';
import {
  type UnifiedLiquidityLevel,
  synthesizeCpmmOrderBook,
  synthesizeLmsrOrderBook,
  computeTopDepth,
  mergeUnifiedLadder,
} from './venue-book-aggregator-helpers';

export type { UnifiedLiquidityLevel };
export {
  synthesizeCpmmOrderBook,
  synthesizeLmsrOrderBook,
  computeTopDepth,
  mergeUnifiedLadder,
};

export class VenueBookAggregator {
  private readonly books: Map<VenueId, VenueBook> = new Map();
  private readonly feeGasModel: FeeGasModel;

  constructor(initialBooks: VenueBook[] = [], feeGasModel?: FeeGasModel) {
    this.feeGasModel = feeGasModel ?? new FeeGasModel();
    for (const book of initialBooks) {
      this.registerBook(book);
    }
  }

  public registerBook(book: VenueBook): void {
    const profile = this.feeGasModel.getProfile(book.venueId);
    this.books.set(book.venueId, {
      ...book,
      takerFeeBps: book.takerFeeBps ?? profile.takerFeeBps,
      makerFeeBps: book.makerFeeBps ?? profile.makerFeeBps,
      gasCostUsd: book.gasCostUsd ?? profile.gasCostUsd,
    });
  }

  public registerCpmmCurve(params: {
    venueId?: VenueId;
    symbol: string;
    baseReserve: number;
    quoteReserve: number;
    feeBps?: number;
    gasCostUsd?: number;
    slices?: number;
    maxDepthRatio?: number;
  }): void {
    const venueId = params.venueId ?? 'amm_cpmm';
    const { bids, asks } = synthesizeCpmmOrderBook(params);

    this.registerBook({
      venueId,
      symbol: params.symbol,
      bids,
      asks,
      takerFeeBps: params.feeBps ?? this.feeGasModel.getFeeBps(venueId),
      gasCostUsd: params.gasCostUsd ?? this.feeGasModel.getGasCostUsd(venueId),
    });
  }

  public registerLmsrCurve(params: {
    venueId?: VenueId;
    symbol: string;
    liabilities: number[];
    b: number;
    outcomeIndex: number;
    feeBps?: number;
    gasCostUsd?: number;
    slices?: number;
    maxDepth?: number;
  }): void {
    const venueId = params.venueId ?? 'amm_lmsr';
    const { bids, asks } = synthesizeLmsrOrderBook(params);

    this.registerBook({
      venueId,
      symbol: params.symbol,
      bids,
      asks,
      takerFeeBps: params.feeBps ?? this.feeGasModel.getFeeBps(venueId),
      gasCostUsd: params.gasCostUsd ?? this.feeGasModel.getGasCostUsd(venueId),
    });
  }

  public getBooks(): readonly VenueBook[] {
    return Array.from(this.books.values());
  }

  public getBook(venueId: VenueId): VenueBook | undefined {
    return this.books.get(venueId);
  }

  public getTopDepth(side: OrderSide, levels = 5): number {
    return computeTopDepth(this.books.values(), side, levels);
  }

  public buildUnifiedLadder(side: OrderSide): UnifiedLiquidityLevel[] {
    return mergeUnifiedLadder(this.books.values(), side);
  }
}
