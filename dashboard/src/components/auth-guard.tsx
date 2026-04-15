/**
 * AuthGuard — redirects unauthenticated users to /login.
 * Uses Better Auth server session as source of truth.
 * Clears stale Zustand state if server session expired.
 */
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useSession } from '../lib/auth-client';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const logout = useAuthStore((s) => s.logout);
  const { data: session, isPending } = useSession();

  // Clear stale Zustand state if server session is gone
  useEffect(() => {
    if (!isPending && !session?.user && loggedIn) {
      logout();
    }
  }, [isPending, session, loggedIn, logout]);

  if (isPending) return null;
  if (session?.user) return <>{children}</>;
  return <Navigate to="/login" replace />;
}
