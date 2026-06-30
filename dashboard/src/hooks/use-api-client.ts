/**
 * Simple API client hook for fetching data from Fastify backend.
 * Auto-attaches JWT Bearer token from auth-store if available.
 */
import { useState, useCallback } from 'react';
import { useAuthStore } from '../stores/auth-store';
import { API_BASE_PATH } from '../lib/api-client';

const BASE = (import.meta.env.VITE_API_URL ?? '') + API_BASE_PATH;

export function useApiClient() {
  const [loading, setLoading] = useState(false);
  const token = useAuthStore((s) => s.token);

  const fetchApi = useCallback(async <T>(path: string, options?: RequestInit): Promise<T | null> => {
    setLoading(true);
    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      };

      const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers,
      });
      if (!res.ok) return null;
      return await res.json() as T;
    } catch (error) {
      console.error('[API Client] Request failed:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { fetchApi, loading };
}
