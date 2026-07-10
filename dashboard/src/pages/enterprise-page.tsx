/**
 * Enterprise Page — consolidated pricing + contact + success in one view.
 * Tab navigation: "Pricing" | "Contact" | "Success"
 * Dark theme with gold (#F59E0B) design tokens.
 */

import { useState, useRef, useCallback } from 'react';
import { motion, useInView } from 'motion/react';
import { PublicNavbar } from '../components/public-navbar';
import { Footer } from '../components/footer';
import { ENTERPRISE_PLANS, type EnterprisePlanKey } from '../lib/enterprise-plans';

type Tab = 'pricing' | 'contact' | 'success';
type FormState = 'idle' | 'submitting' | 'success' | 'error';

interface FormFields {
 email: string;
 companyName: string;
 contactName: string;
 tier: EnterprisePlanKey;
 useCase: string;
 teamSize: string;
}

const TEAM_SIZE_OPTIONS = ['1-10', '11-50', '51-200', '201-500', '500+'];
const TABS: { key: Tab; label: string }[] = [
 { key: 'pricing', label: 'Pricing' },
 { key: 'contact', label: 'Contact' },
 { key: 'success', label: 'Success' },
];

const NEXT_STEPS = [
 { title: 'Account team assignment (today)', desc: 'An Account Manager is notified and will claim your inquiry.' },
 { title: 'Intro call (within 24 h)', desc: 'Your Account Manager schedules a 30-minute discovery call to understand your requirements.' },
 { title: 'Custom proposal', desc: 'We send a tailored contract and invoice — no card required.' },
 { title: 'Onboarding', desc: 'Dedicated onboarding session, API setup, and strategy configuration.' },
];

function FadeIn({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
 const ref = useRef(null);
 const inView = useInView(ref, { once: true, margin: '-80px' });
 return (
 <motion.div
 ref={ref}
 className={className}
 initial={{ opacity: 0, y: 20 }}
 animate={inView ? { opacity: 1, y: 0 } : {}}
 transition={{ duration: 0.6, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
 >
 {children}
 </motion.div>
 );
}

function CheckIcon() {
 return (
 <svg width="13" height="13" fill="none" stroke="#F59E0B" strokeWidth="2.5" viewBox="0 0 24 24">
 <polyline points="20 6 9 17 4 12" />
 </svg>
 );
}

function PlanCard({
 planKey,
 plan,
 highlight,
 onSelect,
}: {
 planKey: EnterprisePlanKey;
 plan: (typeof ENTERPRISE_PLANS)[EnterprisePlanKey];
 highlight: boolean;
 onSelect: (key: EnterprisePlanKey) => void;
}) {
 return (
 <div
 className={`relative rounded-lg p-6 flex flex-col gap-5 ${
 highlight
 ? 'border-2 border-[#F59E0B] bg-bg-surface/80 backdrop-blur-sm'
 : 'border border-bg-border bg-bg-surface/80 backdrop-blur-sm'
 }`}
 >
 {highlight && (
 <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#F59E0B] text-black text-xs font-bold px-3 py-0.5 rounded-full">
 MOST POPULAR
 </span>
 )}

 <div>
 <p className="text-muted text-xs uppercase tracking-widest mb-2">{plan.name}</p>
 <p className="text-white text-3xl font-bold mb-1">{plan.price}</p>
 <p className="text-muted text-xs">{plan.tagline}</p>
 </div>

 <ul className="space-y-2.5 flex-1">
 {plan.features.map((feat) => (
 <li key={feat} className="flex items-start gap-2 text-xs text-muted">
 <span className="flex-shrink-0 mt-0.5"><CheckIcon /></span>
 <span>{feat}</span>
 </li>
 ))}
 </ul>

 <button
 onClick={() => onSelect(planKey)}
 className={`text-center text-sm font-bold px-4 py-2.5 rounded transition-colors ${
 highlight
 ? 'bg-[#F59E0B] text-black hover:bg-[#F59E0B]/80'
 : 'border border-bg-border text-muted hover:text-white hover:border-[#F59E0B]/50'
 }`}
 >
 Request enterprise access
 </button>
 </div>
 );
}

const FAQS = [
 { q: 'How does billing work?', a: 'Enterprise plans are billed monthly via invoice. No credit card or self-serve checkout — our team sends a custom proposal after the discovery call.' },
 { q: 'Can I try before committing?', a: 'Yes. A 30-day paper-trading demo is provisioned automatically when you submit a contact form. No payment required.' },
 { q: 'What SLA is included?', a: 'PRO: next-business-day response. ENTERPRISE: 4-hour response. MASTER: 1-hour response with 99.9% uptime commitment.' },
 { q: 'Is a custom contract available?', a: 'Yes. All enterprise plans include a custom MSA. BAA and DPA available on MASTER tier.' },
];

function PricingTab({ onSelectTier }: { onSelectTier: (key: EnterprisePlanKey) => void }) {
 return (
 <>
 {/* Header */}
 <FadeIn>
 <div className="text-center mb-12">
 <div className="flex items-center justify-center gap-2 mb-3">
 <span className="w-1 h-4 bg-[#F59E0B] rounded-full" />
 <p className="text-[#F59E0B] text-xs uppercase tracking-widest font-mono font-bold">Enterprise</p>
 </div>
 <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
 Built for traders ready to scale
 </h1>
 <p className="text-muted text-sm max-w-lg mx-auto">
 Monthly contracts, dedicated support, and custom integrations.
 Pricing is invoice-based — our team works with you on terms.
 </p>
 </div>
 </FadeIn>

 {/* Plan cards */}
 <FadeIn delay={0.1}>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
 {(Object.entries(ENTERPRISE_PLANS) as [EnterprisePlanKey, (typeof ENTERPRISE_PLANS)[EnterprisePlanKey]][]).map(
 ([key, plan]) => (
 <PlanCard key={key} planKey={key} plan={plan} highlight={key === 'enterprise'} onSelect={onSelectTier} />
 )
 )}
 </div>
 </FadeIn>

 {/* Compared to self-serve */}
 <FadeIn delay={0.2}>
 <div className="border border-bg-border bg-bg-surface/80 backdrop-blur-sm rounded-lg p-6 mb-16 max-w-2xl mx-auto text-center">
 <p className="text-xs text-muted uppercase tracking-widest mb-3">Looking for self-serve?</p>
 <p className="text-sm text-muted mb-4">
 Individual and small-team plans start free. Upgrade to Pro for $99/month via our standard checkout.
 </p>
 <a
 href="/pricing"
 className="inline-block text-sm border border-bg-border text-muted px-5 py-2 rounded hover:text-white hover:border-[#F59E0B]/40 transition-colors"
 >
 View standard pricing
 </a>
 </div>
 </FadeIn>

 {/* FAQ */}
 <FadeIn delay={0.3}>
 <div className="max-w-2xl mx-auto">
 <div className="flex items-center justify-center gap-2 mb-6">
 <span className="w-1 h-5 bg-[#F59E0B] rounded-full" />
 <h2 className="text-xl font-bold text-white">Enterprise FAQ</h2>
 </div>
 <div className="space-y-4">
 {FAQS.map(({ q, a }) => (
 <div key={q} className="border border-bg-border bg-bg-surface/80 backdrop-blur-sm rounded-lg p-5">
 <p className="text-sm font-semibold text-white mb-2">{q}</p>
 <p className="text-xs text-muted leading-relaxed">{a}</p>
 </div>
 ))}
 </div>
 </div>
 </FadeIn>
 </>
 );
}

const inputCls =
 'w-full bg-bg-surface/80 backdrop-blur-sm border border-bg-border text-white text-sm rounded px-3 py-2.5 outline-none focus:border-[#F59E0B]/60 transition-colors placeholder-muted/50';

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
 return (
 <div>
 <label htmlFor={htmlFor} className="block text-xs text-muted mb-1.5">{label}</label>
 {children}
 </div>
 );
}

function ContactTab({ defaultTier, onSuccess }: { defaultTier: EnterprisePlanKey; onSuccess: () => void }) {
 const [fields, setFields] = useState<FormFields>({
 email: '',
 companyName: '',
 contactName: '',
 tier: defaultTier,
 useCase: '',
 teamSize: '',
 });
 const [formState, setFormState] = useState<FormState>('idle');
 const [errorMsg, setErrorMsg] = useState('');

 function set(key: keyof FormFields, value: string) {
 setFields((f) => ({ ...f, [key]: value }));
 }

 const handleSubmit = useCallback(async (e: React.FormEvent) => {
 e.preventDefault();
 setFormState('submitting');
 setErrorMsg('');

 try {
 const res = await fetch('/api/v1/enterprise/inquiries', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 email: fields.email.trim(),
 companyName: fields.companyName.trim(),
 contactName: fields.contactName.trim(),
 tier: fields.tier,
 useCase: fields.useCase.trim(),
 teamSize: fields.teamSize || undefined,
 }),
 });

 if (!res.ok) {
 const body = (await res.json()) as { error?: string };
 throw new Error(body.error ?? `Request failed (${res.status})`);
 }

 setFormState('success');
 onSuccess();
 } catch (err) {
 setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
 setFormState('error');
 }
 }, [fields, onSuccess]);

 return (
 <div className="max-w-xl mx-auto">
 <FadeIn>
 <div className="mb-10">
 <div className="flex items-center gap-2 mb-3">
 <span className="w-1 h-4 bg-[#F59E0B] rounded-full" />
 <p className="text-[#F59E0B] text-xs uppercase tracking-widest font-mono font-bold">Enterprise</p>
 </div>
 <h1 className="text-3xl font-bold text-white mb-3">Talk to our team</h1>
 <p className="text-muted text-sm">
 Enterprise plans are invoice-based with dedicated onboarding. Fill in the form and we will
 reach out within 24 hours.
 </p>
 </div>
 </FadeIn>

 <FadeIn delay={0.1}>
 <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-5">
 {/* Tier selector */}
 <div>
 <label className="block text-xs text-muted mb-1.5">Plan interest</label>
 <div className="grid grid-cols-3 gap-2">
 {(Object.entries(ENTERPRISE_PLANS) as [EnterprisePlanKey, (typeof ENTERPRISE_PLANS)[EnterprisePlanKey]][]).map(([key, plan]) => (
 <button
 key={key}
 type="button"
 onClick={() => set('tier', key)}
 className={`p-3 rounded border text-xs text-left transition-colors min-h-touch ${
 fields.tier === key
 ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-white'
 : 'border-bg-border text-muted hover:border-[#F59E0B]/40'
 }`}
 >
 <p className="font-bold text-sm mb-0.5">{plan.price}</p>
 <p className="text-[10px] opacity-70">{plan.name}</p>
 </button>
 ))}
 </div>
 </div>

 {/* Contact fields */}
 <Field label="Work email *" htmlFor="email">
 <input
 id="email"
 type="email"
 required
 value={fields.email}
 onChange={(e) => set('email', e.target.value)}
 className={inputCls}
 placeholder="you@company.com"
 />
 </Field>

 <Field label="Contact name *" htmlFor="contactName">
 <input
 id="contactName"
 type="text"
 required
 value={fields.contactName}
 onChange={(e) => set('contactName', e.target.value)}
 className={inputCls}
 placeholder="Your full name"
 />
 </Field>

 <Field label="Company name *" htmlFor="companyName">
 <input
 id="companyName"
 type="text"
 required
 value={fields.companyName}
 onChange={(e) => set('companyName', e.target.value)}
 className={inputCls}
 placeholder="Acme Capital"
 />
 </Field>

 <Field label="Team size" htmlFor="teamSize">
 <select
 id="teamSize"
 value={fields.teamSize}
 onChange={(e) => set('teamSize', e.target.value)}
 className={inputCls}
 >
 <option value="">Select...</option>
 {TEAM_SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
 </select>
 </Field>

 <Field label="How will you use the platform? *" htmlFor="useCase">
 <textarea
 id="useCase"
 required
 minLength={20}
 value={fields.useCase}
 onChange={(e) => set('useCase', e.target.value)}
 rows={4}
 className={`${inputCls} resize-none`}
 placeholder="Describe your workflow, volume expectations, and key requirements..."
 />
 </Field>

 {formState === 'error' && (
 <p className="text-loss text-xs border border-loss/30 bg-loss/10 rounded px-3 py-2">
 {errorMsg}
 </p>
 )}

 <button
 type="submit"
 disabled={formState === 'submitting'}
 className="w-full bg-[#F59E0B] text-black font-bold py-3 rounded hover:bg-[#F59E0B]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-touch"
 >
 {formState === 'submitting' ? 'Sending...' : 'Request enterprise access'}
 </button>

 <p className="text-muted/50 text-xs text-center">
 No payment required. Invoice-based close only.
 </p>
 </form>
 </FadeIn>
 </div>
 );
}

function SuccessTab() {
 return (
 <div className="max-w-xl mx-auto">
 <FadeIn>
 <div className="text-center mb-10">
 <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-profit/10 border border-profit/30 mb-6">
 <svg width="28" height="28" fill="none" stroke="#34D399" strokeWidth="2" viewBox="0 0 24 24">
 <polyline points="20 6 9 17 4 12" />
 </svg>
 </div>
 <h1 className="text-3xl font-bold text-white mb-3">Inquiry received</h1>
 <p className="text-muted text-sm max-w-sm mx-auto">
 Our team will reach out within 24 hours to schedule a walkthrough and discuss contract terms.
 </p>
 </div>

 <div className="border border-bg-border bg-bg-surface/80 backdrop-blur-sm rounded-lg p-6 mb-6">
 <div className="flex items-center gap-2 mb-4">
 <span className="w-1 h-4 bg-[#F59E0B] rounded-full" />
 <h2 className="text-[#F59E0B] text-xs font-mono font-bold uppercase tracking-widest">What happens next</h2>
 </div>
 <ol className="space-y-4">
 {NEXT_STEPS.map((step, i) => (
 <li key={i} className="flex gap-3">
 <span className="flex-shrink-0 w-5 h-5 rounded-full bg-profit/15 border border-profit/40 text-profit text-xs flex items-center justify-center font-bold">
 {i + 1}
 </span>
 <div>
 <p className="text-sm text-white font-semibold mb-0.5">{step.title}</p>
 <p className="text-xs text-muted">{step.desc}</p>
 </div>
 </li>
 ))}
 </ol>
 </div>

 <div className="border border-[#F59E0B]/20 bg-[#F59E0B]/5 rounded-lg p-5 mb-8">
 <div className="flex items-center gap-2 mb-2">
 <span className="w-1 h-4 bg-[#F59E0B] rounded-full" />
 <p className="text-xs text-[#F59E0B] uppercase tracking-widest font-mono font-bold">Paper-trading demo</p>
 </div>
 <p className="text-sm text-muted">
 A 30-day paper-trading demo environment has been provisioned for your team.
 Check your inbox for credentials — no payment or setup required.
 </p>
 </div>

 <div className="flex flex-col sm:flex-row gap-3 justify-center">
 <a
 href="/docs"
 className="text-center text-sm border border-bg-border text-muted px-5 py-2.5 rounded hover:text-white hover:border-[#F59E0B]/40 transition-colors"
 >
 Read the docs
 </a>
 <a
 href="/"
 className="text-center text-sm bg-[#F59E0B] text-black font-bold px-5 py-2.5 rounded hover:bg-[#F59E0B]/80 transition-colors"
 >
 Back to home
 </a>
 </div>
 </FadeIn>
 </div>
 );
}

export function EnterprisePage() {
 const [activeTab, setActiveTab] = useState<Tab>('pricing');
 const [selectedTier, setSelectedTier] = useState<EnterprisePlanKey>('pro');

 const handleSelectTier = useCallback((key: EnterprisePlanKey) => {
 setSelectedTier(key);
 setActiveTab('contact');
 }, []);

 const handleSuccess = useCallback(() => {
 setActiveTab('success');
 }, []);

 return (
 <div className="min-h-screen bg-bg text-white flex flex-col">
 <PublicNavbar />

 <main className="flex-1 pt-24 pb-16 px-4 sm:px-6 max-w-6xl mx-auto w-full">
 {/* Tab navigation */}
 <div className="flex justify-center mb-10">
 <div className="inline-flex rounded-lg border border-bg-border bg-bg-surface/60 backdrop-blur-sm p-1">
 {TABS.map(({ key, label }) => (
 <button
 key={key}
 onClick={() => setActiveTab(key)}
 className={`px-6 py-2 text-sm font-semibold rounded-md transition-colors ${
 activeTab === key
 ? 'bg-[#F59E0B] text-black'
 : 'text-muted hover:text-white'
 }`}
 >
 {label}
 </button>
 ))}
 </div>
 </div>

 {/* Tab content */}
 {activeTab === 'pricing' ? (
 <PricingTab onSelectTier={handleSelectTier} />
 ) : activeTab === 'contact' ? (
 <ContactTab defaultTier={selectedTier} onSuccess={handleSuccess} />
 ) : (
 <SuccessTab />
 )}
 </main>

 <Footer />
 </div>
 );
}
