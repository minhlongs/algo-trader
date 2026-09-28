import { VenueBook, VenueId, OrderSide, OrderBookLevel } from './sor-types';
import { FeeGasModel } from './fee-gas-model';

export interface UnifiedLiquidityLevel {
  venueId: VenueId;
  price: number;
  quantity: number;
  takerFeeBps: number;
  gasCostUsd: number;
}

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
    const slices = params.slices ?? 10;
    const maxDepth = params.baseReserve * (params.maxDepthRatio ?? 0.20);
    const sliceQty = maxDepth / slices;
    const k = params.baseReserve * params.quoteReserve;

    const asks: OrderBookLevel[] = [];
    const bids: OrderBookLevel[] = [];

    // Synthesize asks (buying base token)
    let currentBase = params.baseReserve;
    let currentQuote = params.quoteReserve;
    for (let i = 0; i < slices; i++) {
      const nextBase = currentBase - sliceQty;
      if (nextBase <= 0) break;
      const nextQuote = k / nextBase;
      const quoteDelta = nextQuote - currentQuote;
      const marginalPrice = quoteDelta / sliceQty;
      asks.push([marginalPrice, sliceQty]);
      currentBase = nextBase;
      currentQuote = nextQuote;
    }

    // Synthesize bids (selling base token)
    currentBase = params.baseReserve;
    currentQuote = params.quoteReserve;
    for (let i = 0; i < slices; i++) {
      const nextBase = currentBase + sliceQty;
      const nextQuote = k / nextBase;
      const quoteDelta = currentQuote - nextQuote;
      const marginalPrice = quoteDelta / sliceQty;
      bids.push([marginalPrice, sliceQty]);
      currentBase = nextBase;
      currentQuote = nextQuote;
    }

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
    const slices = params.slices ?? 10;
    const maxDepth = params.maxDepth ?? params.b * 0.5;
    const sliceQty = maxDepth / slices;
    const { liabilities, b, outcomeIndex } = params;

    const costFn = (q: number[]): number => {
      const maxScaled = Math.max(...q.map(v => v / b));
      const sumExp = q.reduce((acc, v) => acc + Math.exp(v / b - maxScaled), 0);
      return b * (maxScaled + Math.log(sumExp));
    };

    const asks: OrderBookLevel[] = [];
    const bids: OrderBookLevel[] = [];
    const currentQ = [...liabilities];

    // Asks: buy outcome token
    for (let i = 0; i < slices; i++) {
      const costBefore = costFn(currentQ);
      currentQ[outcomeIndex] += sliceQty;
      const costAfter = costFn(currentQ);
      const marginalPrice = (costAfter - costBefore) / sliceQty;
      asks.push([marginalPrice, sliceQty]);
    }

    // Bids: sell outcome token
    const sellQ = [...liabilities];
    for (let i = 0; i < slices; i++) {
      const costBefore = costFn(sellQ);
      sellQ[outcomeIndex] -= sliceQty;
      const costAfter = costFn(sellQ);
      const marginalPrice = (costBefore - costAfter) / sliceQty;
      bids.push([marginalPrice, sliceQty]);
    }

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
    let total = 0;
    for (const book of this.books.values()) {
      const ladder = side === 'BUY' ? book.asks : book.bids;
      for (let i = 0; i < Math.min(levels, ladder.length); i++) {
        total += ladder[i][1];
      }
    }
    return total;
  }

  public buildUnifiedLadder(side: OrderSide): UnifiedLiquidityLevel[] {
    const ladder: UnifiedLiquidityLevel[] = [];
    for (const book of this.books.values()) {
      const levels = side === 'BUY' ? book.asks : book.bids;
      for (const [price, quantity] of levels) {
        if (quantity > 0) {
          ladder.push({
            venueId: book.venueId,
            price,
            quantity,
            takerFeeBps: book.takerFeeBps,
            gasCostUsd: book.gasCostUsd ?? 0,
          });
        }
      }
    }
    return ladder;
  }
}
