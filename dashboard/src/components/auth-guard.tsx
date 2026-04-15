/**
 * AuthGuard — redirects unauthenticated users to /login.
 * Checks both Zustand store (local) and Better Auth session (server).
 */
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { useSession } from '../lib/auth-client';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const loggedIn = useAuthStore((s) => s.loggedIn);
  const { data: session, isPending } = useSession();

  // Show nothing while checking session
  if (isPending) return null;

  // Allow if either local store or Better Auth session is valid
  if (loggedIn || session?.user) return <>{children}</>;

  return <Navigate to="/login" replace />;
}
