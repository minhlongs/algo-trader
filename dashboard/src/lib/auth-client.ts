/**
 * Better Auth Client
 * Connects to Express API server auth endpoints at /api/auth/*
 */

import { createAuthClient } from 'better-auth/react';

const API_BASE = (import.meta as any).env?.VITE_API_URL ?? 'https://api.cashclaw.cc';

export const authClient = createAuthClient({
  baseURL: API_BASE,
  basePath: '/api/auth',
});

// Export typed hooks for React components
export const {
  useSession,
  signIn,
  signUp,
  signOut,
} = authClient;
