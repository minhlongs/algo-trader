/**
 * Login page — centered card, calls auth-store login(), redirects to /app.
 */
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { PublicNavbar } from '../components/public-navbar';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading, error: storeError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const displayError = localError || storeError;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError('');
    if (!email.trim() || !password.trim()) {
      setLocalError('Email and password are required.');
      return;
    }
    await login(email.trim(), password);
    // If no error in store after login, navigate
    const { error, loggedIn } = useAuthStore.getState();
    if (loggedIn && !error) {
      navigate('/app');
    }
  }

  return (
    <div className="min-h-screen bg-[#060912] flex flex-col">
      <PublicNavbar />

      <div className="flex-1 flex items-center justify-center px-4 pt-16">
        <div className="w-full max-w-sm">
          <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg overflow-hidden p-8">
            {/* Header */}
            <div className="mb-6">
              <p className="text-accent text-xs font-mono font-bold uppercase tracking-widest mb-2">Welcome back</p>
              <h1 className="text-white text-xl font-bold">Sign in to CashClaw</h1>
            </div>

            {displayError && (
              <div className="mb-4 px-3 py-2 bg-[#FF4466]/10 border border-[#FF4466]/30 rounded text-[#FF4466] text-xs">
                {displayError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[#8892B0] text-xs mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={loading}
                  className="w-full bg-[#060912] border border-bg-border rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent placeholder:text-[#8892B0]/50 transition-colors disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-[#8892B0] text-xs mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full bg-[#060912] border border-bg-border rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent placeholder:text-[#8892B0]/50 transition-colors disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-[#060912] font-bold text-sm py-2.5 rounded hover:brightness-110 transition-all duration-200 mt-2 disabled:opacity-60 disabled:cursor-not-allowed min-h-touch"
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <p className="text-[#8892B0] text-xs text-center mt-6">
              No account?{' '}
              <Link to="/signup" className="text-accent hover:underline">
                Create one free
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
