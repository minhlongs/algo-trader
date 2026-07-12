/**
 * Login page — centered card, calls auth-store login(), redirects to /app.
 * Stitch redesign: dark fintech, bilingual VN+EN.
 */
import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth-store';
import { StitchButton } from '../components/ui/stitch-components';

const COPY = {
en: {
langToggle: 'Tiếng Việt',
title: 'Sign in to CashClaw',
eyebrow: 'Welcome back',
labelEmail: 'Email',
labelPassword: 'Password',
placeholderEmail: 'you@example.com',
placeholderPassword: '••••••••',
btnSignIn: 'Sign In',
btnSigningIn: 'Signing in…',
linkNoAccount: "Don't have an account?",
linkCreate: 'Create one free',
errorRequired: 'Email and password are required.',
},
vi: {
langToggle: 'English',
title: 'Đăng Nhập CashClaw',
eyebrow: 'Chào mừng trở lại',
labelEmail: 'Email',
labelPassword: 'Mật Khẩu',
placeholderEmail: 'ban@example.com',
placeholderPassword: '••••••••',
btnSignIn: 'Đăng Nhập',
btnSigningIn: 'Đang đăng nhập…',
linkNoAccount: 'Chưa có tài khoản?',
linkCreate: 'Tạo tài khoản miễn phí',
errorRequired: 'Email và mật khẩu là bắt buộc.',
},
};

type Lang = 'en' | 'vi';

export function LoginPage() {
const [lang, setLang] = useState<Lang>('en');
const t = COPY[lang];
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
setLocalError(t.errorRequired);
return;
}
await login(email.trim(), password);
const { error, loggedIn } = useAuthStore.getState();
if (loggedIn && !error) { navigate('/app'); }
}

return (
<div className="min-h-screen bg-[${COLORS.bg}] text-[${COLORS.onSurface}] font-sans flex flex-col">
{/* Lang toggle */}
<div className="flex justify-end px-4 sm:px-8 pt-6">
<button
onClick={() => setLang((l: Lang) => (l === 'en' ? 'vi' : 'en'))}
className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[${COLORS.outline}] bg-[${COLORS.surface}]/80 text-[${COLORS.onSurfaceVariant}] text-xs hover:border-[${COLORS.primary}] hover:text-[${COLORS.primary}] transition-colors"
aria-label="Toggle language"
>
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
<circle cx="12" cy="12" r="10" />
<path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10" />
</svg>
{t.langToggle}
</button>
</div>

<div className="flex-1 flex items-center justify-center px-4 pt-16">
<div className="w-full max-w-sm">
<div className="bg-[${COLORS.surface}]/80 backdrop-blur-xl border border-[${COLORS.outline}] rounded-2xl p-8">
{/* Header */}
<div className="mb-6">
<p className="text-[${COLORS.primary}] text-xs uppercase tracking-widest mb-2">{t.eyebrow}</p>
<h1 className="text-white text-xl font-bold">{t.title}</h1>
</div>

{displayError && (
<div className="mb-4 px-3 py-2 bg-[${COLORS.loss}]/10 border border-[${COLORS.loss}]/30 rounded text-[${COLORS.loss}] text-xs">
{displayError}
</div>
)}

<form onSubmit={handleSubmit} className="space-y-4">
<div>
<label className="block text-[${COLORS.onSurfaceVariant}] text-xs mb-1.5">{t.labelEmail}</label>
<input
type="email"
value={email}
onChange={(e) => setEmail(e.target.value)}
placeholder={t.placeholderEmail}
autoComplete="email"
data-testid="email-input"
disabled={loading}
className="w-full bg-[${COLORS.bg}] border border-[${COLORS.outline}] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[${COLORS.primary}] placeholder:text-[${COLORS.onSurfaceVariant}]/50 transition-colors disabled:opacity-50"
/>
</div>

<div>
<label className="block text-[${COLORS.onSurfaceVariant}] text-xs mb-1.5">{t.labelPassword}</label>
<input
type="password"
value={password}
onChange={(e) => setPassword(e.target.value)}
placeholder={t.placeholderPassword}
autoComplete="current-password"
data-testid="password-input"
disabled={loading}
className="w-full bg-[${COLORS.bg}] border border-[${COLORS.outline}] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[${COLORS.primary}] placeholder:text-[${COLORS.onSurfaceVariant}]/50 transition-colors disabled:opacity-50"
/>
</div>

<StitchButton
type="submit"
data-testid="login-button"
disabled={loading}
variant="primary"
className="w-full mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
>
{loading ? t.btnSigningIn : t.btnSignIn}
</StitchButton>
</form>

<p className="text-[${COLORS.onSurfaceVariant}] text-xs text-center mt-6">
{t.linkNoAccount}{' '}
<Link to="/signup" className="text-[${COLORS.primary}] hover:underline">
{t.linkCreate}
</Link>
</p>
</div>
</div>
</div>
</div>
);
}

export default LoginPage;
