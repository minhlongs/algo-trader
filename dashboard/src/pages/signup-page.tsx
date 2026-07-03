/**
 * Signup page — email, password, tier radio cards.
 * Pre-selects tier from ?tier= query param.
 * Calls auth-store signup(), shows API key on success, redirects to /app.
 */
import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/auth-store';
import { PublicNavbar } from '../components/public-navbar';

type Tier = 'free' | 'pro' | 'enterprise';

const TIERS: { value: Tier; label: string; price: string }[] = [
  { value: 'free', label: 'Free', price: '$0' },
  { value: 'pro', label: 'Pro', price: '$49/mo' },
  { value: 'enterprise', label: 'Enterprise', price: '$199/mo' },
];

export function SignupPage() {
  const { t } = useTranslation();
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
      setLocalError(t('signup.errorRequired'));
      return;
    }
    if (password.length < 8) {
      setLocalError(t('signup.errorPasswordMin'));
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
      <div className="min-h-screen bg-[#060912] flex flex-col">
        <PublicNavbar />
        <div className="flex-1 flex items-center justify-center px-4 pt-16 py-10">
          <div className="w-full max-w-md">
            <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg overflow-hidden p-8 space-y-5">
              <div>
                <p className="text-[#00E676] text-xs uppercase tracking-widest mb-2">{t('signup.accountCreated')}</p>
                <h1 className="text-white text-xl font-bold">{t('signup.apiKeyTitle')}</h1>
              </div>

              <div className="bg-[#FF4466]/10 border border-[#FF4466]/40 rounded px-4 py-3">
                <p className="text-[#FF4466] text-xs font-bold uppercase tracking-wide mb-1">{t('signup.apiKeyWarning')}</p>
                <p className="text-[#FF4466] text-xs">
                  {t('signup.apiKeyWarningText')}
                </p>
              </div>

              <div className="bg-[#060912] border border-accent/30 rounded px-4 py-3">
                <p className="text-[#8892B0] text-[10px] uppercase tracking-widest mb-2">API Key</p>
                <div className="flex items-center gap-2">
                  <code className="text-accent text-xs break-all flex-1 select-all">{shownApiKey}</code>
                  <button
                    onClick={handleCopy}
                    className="flex-shrink-0 text-xs px-3 py-1.5 border border-accent/40 rounded text-accent hover:bg-accent/10 transition-colors min-h-touch"
                  >
                    {copied ? t('signup.apiKeyCopied') : t('signup.apiKeyCopy')}
                  </button>
                </div>
              </div>

              <button
                onClick={() => navigate('/app')}
                className="w-full bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-[#060912] font-bold text-sm py-2.5 rounded hover:brightness-110 transition-all duration-200 min-h-touch"
              >
                {t('signup.apiKeyContinue')}
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
          <div className="bg-bg-surface/80 backdrop-blur-sm border border-bg-border rounded-lg overflow-hidden p-8">
            {/* Header */}
            <div className="mb-6">
              <p className="text-accent text-xs font-mono font-bold uppercase tracking-widest mb-2">{t('signup.subtitle')}</p>
              <h1 className="text-white text-xl font-bold">{t('signup.title')}</h1>
            </div>

            {displayError && (
              <div className="mb-4 px-3 py-2 bg-[#FF4466]/10 border border-[#FF4466]/30 rounded text-[#FF4466] text-xs">
                {displayError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-1.5">{t('signup.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('signup.emailPlaceholder')}
                  autoComplete="email"
                  disabled={loading}
                  className="w-full bg-[#060912] border border-bg-border rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent placeholder:text-[#8892B0]/50 transition-colors disabled:opacity-50"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-1.5">{t('signup.password')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('signup.passwordPlaceholder')}
                  autoComplete="new-password"
                  disabled={loading}
                  className="w-full bg-[#060912] border border-bg-border rounded px-3 py-2.5 text-white text-sm focus:outline-none focus:border-accent placeholder:text-[#8892B0]/50 transition-colors disabled:opacity-50"
                />
              </div>

              {/* Tier selector */}
              <div>
                <label className="block text-[#8892B0] text-xs mb-2">{t('signup.plan')}</label>
                <div className="grid grid-cols-3 gap-2">
                  {TIERS.map(({ value, label, price }) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setTier(value)}
                      disabled={loading}
                      className={`flex flex-col items-center py-3 px-2 rounded border text-xs transition-colors disabled:opacity-50 min-h-touch ${
                        tier === value
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-bg-border text-[#8892B0] hover:border-accent/40 hover:text-white'
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
                className="w-full bg-gradient-to-r from-[#F59E0B] to-[#D97706] text-[#060912] font-bold text-sm py-2.5 rounded hover:brightness-110 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed min-h-touch"
              >
                {loading ? t('signup.creatingAccount') : t('signup.createAccount')}
              </button>
            </form>

            <p className="text-[#8892B0] text-xs text-center mt-6">
              {t('signup.alreadyHaveAccount')}{' '}
              <Link to="/login" className="text-accent hover:underline">
                {t('signup.signIn')}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
