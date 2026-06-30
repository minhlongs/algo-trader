/**
 * Marketplace data hook — strategy browsing, subscriptions, reviews.
 * Follows use-licenses pattern: useState + useApiClient + useCallback + useEffect.
 */
import { useState, useCallback, useEffect } from 'react';
import { useApiClient } from './use-api-client';
import type {
  MarketplaceStrategy,
  MarketplaceListing,
  MarketplaceSubscription,
  PaginatedResult,
} from '../types/api';

export type { MarketplaceStrategy, MarketplaceSubscription, MarketplaceListing };

export interface StrategyFilters {
  category?: string;
  riskLevel?: number;
  minSharpe?: number;
  maxDrawdown?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  page?: number;
  limit?: number;
}

export interface SubscribeResult {
  subscription: MarketplaceSubscription;
  checkoutUrl: string | null;
}

export function useMarketplace() {
  const { fetchApi } = useApiClient();
  const [strategies, setStrategies] = useState<MarketplaceStrategy[]>([]);
  const [listings, setListings] = useState<Map<string, MarketplaceListing>>(new Map());
  const [subscriptions, setSubscriptions] = useState<MarketplaceSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const loadStrategies = useCallback(async (filters: StrategyFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.category) params.set('category', filters.category);
      if (filters.riskLevel) params.set('riskLevel', String(filters.riskLevel));
      if (filters.minSharpe) params.set('minSharpe', String(filters.minSharpe));
      if (filters.maxDrawdown) params.set('maxDrawdown', String(filters.maxDrawdown));
      if (filters.sortBy) params.set('sortBy', filters.sortBy);
      if (filters.sortOrder) params.set('sortOrder', filters.sortOrder);
      if (filters.search) params.set('search', filters.search);
      if (filters.page) params.set('page', String(filters.page));
      if (filters.limit) params.set('limit', String(filters.limit));

      const qs = params.toString();
      const result = await fetchApi<PaginatedResult<MarketplaceStrategy>>(
        `/v1/marketplace/strategies${qs ? `?${qs}` : ''}`,
      );
      if (result) {
        setStrategies(result.data);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      } else {
        setError('Failed to load strategies');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [fetchApi]);

  const loadListing = useCallback(async (listingId: string) => {
    const result = await fetchApi<MarketplaceListing>(`/v1/marketplace/strategies/${listingId}`);
    if (result) {
      setListings((prev) => new Map(prev).set(listingId, result));
    }
    return result;
  }, [fetchApi]);

  const loadSubscriptions = useCallback(async () => {
    const result = await fetchApi<PaginatedResult<MarketplaceSubscription>>('/v1/marketplace/subscriptions');
    if (result) {
      setSubscriptions(result.data);
    }
    return result?.data ?? [];
  }, [fetchApi]);

  const subscribe = useCallback(async (
    listingId: string,
    allocationPercent: number,
  ): Promise<SubscribeResult | null> => {
    const result = await fetchApi<SubscribeResult>('/v1/marketplace/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ listingId, allocationPercent }),
    });
    if (result) {
      setSubscriptions((prev) => [...prev, result.subscription]);
    }
    return result;
  }, [fetchApi]);

  const updateSubscription = useCallback(async (
    subscriptionId: string,
    action: 'pause' | 'resume' | 'cancel',
  ) => {
    const result = await fetchApi<MarketplaceSubscription>(
      `/v1/marketplace/subscriptions/${subscriptionId}`,
      { method: 'PATCH', body: JSON.stringify({ action }) },
    );
    if (result) {
      setSubscriptions((prev) => prev.map((s) => (s.id === subscriptionId ? result : s)));
    }
    return result;
  }, [fetchApi]);

  const executeSubscription = useCallback(async (subscriptionId: string) => {
    return fetchApi(`/v1/marketplace/subscriptions/${subscriptionId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ marketPayload: {} }),
    });
  }, [fetchApi]);

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  return {
    strategies, listings, subscriptions,
    loading, error, total, totalPages,
    loadStrategies, loadListing, loadSubscriptions,
    subscribe, updateSubscription, executeSubscription,
  };
}
