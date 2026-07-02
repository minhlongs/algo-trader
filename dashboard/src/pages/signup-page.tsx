/**
 * Signup page — email, password, tier radio cards.
 * Pre-selects tier from ?tier= query param.
 * Calls auth-store signup(), shows API key on success, redirects to /app.
 */
import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { PublicNavbar } from '../components/public-navbar';

type Tier = 'free' | 'pro' | 'enterprise';

const TIERS: { value: Tier; label: string; price: string }[] = [
  { value: 'free', label: 'Free', price: '$0' },
  { value: 'pro', label: 'Pro', price: '$49/mo' },
  { value: 'enterprise', label: 'Enterprise', price: '$199/mo' },
];

export function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signup, loading, error: storeError } = useAuthStore();

  const initialTier = (searchParams.get('tier') as Tier) ?? 'free';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tier, setTier] = useState<Tier>(
    TIERS.some((t) => t.value === initialTier) ? initialTier : 'free'
  );
  const [localError, setLocalError] = useState('');
  const [shownApiKey, setShownApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const displayError = localError || storeError;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError('');
    if (!email.trim() || !password.trim()) {
      setLocalError('Email and password are required.');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters.');
      return;
    }
    await signup(email.trim(), password, tier);
    const state = useAuthStore.getState();
    if (state.loggedIn && !state.error) {
      if (state.apiKey) {
        setShownApiKey(state.apiKey);
      } else {
        navigate('/app');
      }
    }
  }

  async function handleCopy() {
    if (!shownApiKey) return;
    await navigator.clipboard.writeText(shownApiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (shownApiKey) {
    return (
      <div className="min-h-screen bg-[#080B14] flex flex-col">
        <PublicNavbar />
        <div className="flex-1 flex items-center justify-center px-4 pt-16 py-10">
          <div className="w-full max-w-md">
            <div className="bg-[#111627] border border-[#1E2640] rounded-lg p-8 space-y-5">
              <div>
                <p className="text-[#00E676] text-xs uppercase tracking-widest mb-2">Account created</p>
                <h1 className="text-white text-xl font-bold">Save your API Key</h1>
              </div>

              <div className="bg-[#FF4466]/10 border border-[#FF4466]/40 rounded px-4 py-3">
                <p className="text-[#FF4466] text-xs font-bold uppercase tracking-wide mb-1">Warning</p>
                <p className="text-[#FF4466] text-xs">
                  This key will only be shown once. Copy and store it securely before continuing.
                </p>
              </div>

              <div className="bg-[#080B14] border border-[#F59E0B]/30 rounded px-4 py-3">
                <p className="text-[#8892B0] text-[10px] uppercase tracking-widest mb-2">API Key</p>
                <div className="flex items-center gap-2">
                  <code className="text-[#F59E0B] text-xs break-all flex-1 select-all">{shownApiKey}</code>
                  <button
                    onClick={handleCopy}
                    className="flex-shrink-0 text-xs px-3 py-1.5 border border-[#F59E0B]/40 rounded text-[#F59E0B] hover:bg-[#F59E0B]/10 transition-colors"
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              <button
                onClick={() => navigate('/app')}
                className="w-full bg-[#F59E0B] text-[#080B14] font-bold text-sm py-2.5 rounded hover:bg-[#F59E0B]/80 transition-colors"
              >
                I've saved my key — Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080B14] flex flex-col">
      <PublicNavbar />

      <div className="flex-1 flex items-center justify-center px-4 pt-16 py-10">
        <div className="w-full max-w-md">
          <div className="bg-[#111627] border border-[#1E2640] rounded-lg p-8">
            {/* Header */}
            <div className="mb-6">
              <p className="text-[#F59E0B] text-xs uppercase tracking-widest mb-2">Get started</p>
              <h1 className="text-white text-xl font-bold">Create your account</h1>
            </div>

            {displayError && (
              <div className="mb-4 px-3 py-2 bg-[#FF4466]/10 border border-[#FF4466]/30 rounded text-[#FF4466] text-xs">
                {displayError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={loading}
                  className="w-full bg-[#080B14] border border-[#1E2640] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#F59E0B] placeholder:text-[#8892B0]/50 transition-colors disabled:opacity-50"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min 8 characters"
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full bg-[#080B14] border border-[#1E2640] rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#F59E0B] placeholder:text-[#8892B0]/50 transition-colors disabled:opacity-50"
                />
              </div>

              {/* Tier selector */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-2">Plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIERS.map(({ value, label, price }) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setTier(value)}
                      disabled={loading}
                      className={`flex flex-col items-center py-3 px-2 rounded border text-xs transition-colors disabled:opacity-50 ${
                        tier === value
                          ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]'
                          : 'border-[#1E2640] text-[#8892B0] hover:border-[#F59E0B]/40 hover:text-white'
                      }`}
                    >
                      <span className="font-bold mb-0.5">{label}</span>
                      <span className="text-[10px] opacity-70">{price}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#F59E0B] text-[#080B14] font-bold text-sm py-2.5 rounded hover:bg-[#F59E0B]/80 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>

            <p className="text-[#8892B0] text-xs text-center mt-6">
              Already have an account?{' '}
              <Link to="/login" className="text-[#F59E0B] hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
