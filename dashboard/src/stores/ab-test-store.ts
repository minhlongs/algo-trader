import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { apiClient } from '../lib/api-client';
import { useAuthStore } from './auth-store';

export interface AbConfig {
  theme: 'default' | 'cyberpunk';
  promoBanner: boolean;
  abTestingEnabled: boolean;
}

export interface PersonalizationWidget {
  id: string;
  colSpan: number;
  visible: boolean;
}

export interface PersonalizationFeatures {
  aiInsights: boolean;
  unlimitedStrategies: boolean;
  customAlerts: boolean;
}

export interface AnalyticsEvent {
  tenantId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  timestamp?: string;
}

export interface AbTestStore {
  variant: 'A' | 'B' | null;
  config: AbConfig | null;
  widgets: PersonalizationWidget[];
  features: PersonalizationFeatures;
  eventQueue: AnalyticsEvent[];
  loading: boolean;
  error: string | null;

  // Actions
  fetchAbConfig: (tenantId: string) => Promise<void>;
  fetchPersonalizationConfig: (tier: string) => Promise<void>;
  trackEvent: (eventType: string, eventData?: Record<string, unknown>) => Promise<void>;
  flushEvents: () => Promise<void>;
  reset: () => void;
}

const DEFAULT_FEATURES: PersonalizationFeatures = {
  aiInsights: false,
  unlimitedStrategies: false,
  customAlerts: false,
};

export const useAbTestStore = create<AbTestStore>()(
  persist(
    (set, get) => ({
      // State
      variant: null,
      config: null,
      widgets: [],
      features: DEFAULT_FEATURES,
      eventQueue: [],
      loading: false,
      error: null,

      // Fetch dynamic A/B test variant
      fetchAbConfig: async (tenantId: string) => {
        set({ loading: true, error: null });
        try {
          const res = await apiClient.get<{
            variant: 'A' | 'B';
            config: AbConfig;
          }>(`/ab/config?tenantId=${tenantId}`);
          
          set({
            variant: res.variant,
            config: res.config,
            loading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to fetch A/B configuration',
            loading: false,
          });
        }
      },

      // Fetch feature flag overrides & layouts
      fetchPersonalizationConfig: async (tier: string) => {
        set({ loading: true, error: null });
        try {
          const res = await apiClient.get<{
            widgets: PersonalizationWidget[];
            features: PersonalizationFeatures;
          }>(`/personalization/config?tier=${tier}`);
          
          set({
            widgets: res.widgets,
            features: res.features,
            loading: false,
          });
        } catch (err) {
          set({
            error: err instanceof Error ? err.message : 'Failed to fetch personalization config',
            loading: false,
          });
        }
      },

      // Buffers/sends tracking event
      trackEvent: async (eventType: string, eventData: Record<string, unknown> = {}) => {
        const tenantId = useAuthStore.getState().tenantId || 'anonymous';
        const variant = get().variant || 'UNKNOWN';

        const eventPayload: AnalyticsEvent = {
          tenantId,
          eventType,
          eventData: {
            ...eventData,
            variant,
            theme: get().config?.theme || 'default',
          },
        };

        // Queue event
        set((state) => ({
          eventQueue: [...state.eventQueue, eventPayload],
        }));

        // Flush immediately
        await get().flushEvents();
      },

      // Empty buffered events queue
      flushEvents: async () => {
        const { eventQueue } = get();
        if (eventQueue.length === 0) return;

        const remaining: AnalyticsEvent[] = [];

        for (const event of eventQueue) {
          try {
            await apiClient.post('/personalization/events', event);
          } catch (err) {
            console.warn('[AB Store] Event dispatch failed. Retaining event in queue.', err);
            remaining.push(event);
          }
        }

        set({ eventQueue: remaining });
      },

      reset: () => {
        set({
          variant: null,
          config: null,
          widgets: [],
          features: DEFAULT_FEATURES,
          eventQueue: [],
          error: null,
        });
      },
    }),
    {
      name: 'cashclaw-ab-test',
      storage: createJSONStorage(() => {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage;
          }
        } catch {
          // ignore
        }
        const fallbackStorage: StateStorage = {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        };
        return fallbackStorage;
      }),
      partialize: (state) => ({
        variant: state.variant,
        config: state.config,
        widgets: state.widgets,
        features: state.features,
        eventQueue: state.eventQueue,
      }),
    }
  )
);
