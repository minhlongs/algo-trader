import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { BetaFeedbackCategory, BetaFeedbackItem } from './poly-beta-api-client';
import { POLY_BETA_COPY, type BetaLang } from './poly-beta-copy';
import { formatIsoTimestamp, localizeBetaError } from './poly-beta-helpers';
import type { PolyBetaSession } from './use-poly-beta-session';

interface Props {
  lang: BetaLang;
  authedRequest: PolyBetaSession['authedRequest'];
}

interface FeedbackListResponse { ok?: boolean; feedback?: BetaFeedbackItem[]; }
interface FeedbackSubmitResponse { ok?: boolean; feedback?: BetaFeedbackItem; }

const MIN_CHARS = 5;
const MAX_CHARS = 1500;
const FIELD = 'w-full min-w-0 min-h-11 px-3 py-2 rounded bg-slate-950 border border-slate-700 text-xs text-slate-100 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300';

const CATEGORIES: ReadonlyArray<{
  value: BetaFeedbackCategory;
  labelKey: 'feedbackCatBug' | 'feedbackCatConfusing' | 'feedbackCatSimulation' | 'feedbackCatFeature' | 'feedbackCatOther';
}> = [
  { value: 'bug', labelKey: 'feedbackCatBug' },
  { value: 'confusing_workflow', labelKey: 'feedbackCatConfusing' },
  { value: 'trading_simulation', labelKey: 'feedbackCatSimulation' },
  { value: 'feature_suggestion', labelKey: 'feedbackCatFeature' },
  { value: 'other', labelKey: 'feedbackCatOther' },
];

export function PolyBetaFeedbackPanel({ lang, authedRequest }: Props) {
  const t = POLY_BETA_COPY[lang];
  const [category, setCategory] = useState<BetaFeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [items, setItems] = useState<BetaFeedbackItem[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    const res = await authedRequest<FeedbackListResponse>('/api/beta/feedback');
    if (res.abortedSession) return;
    if (res.status === 200) {
      setHistoryError(null);
      if (Array.isArray(res.data.feedback)) setItems(res.data.feedback);
      return;
    }
    setHistoryError(localizeBetaError(res, lang, t.feedbackLoadFailed));
  }, [authedRequest, lang, t.feedbackLoadFailed]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const trimmedLength = message.trim().length;
  const isLengthValid = trimmedLength >= MIN_CHARS && trimmedLength <= MAX_CHARS;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || !isLengthValid) return;
    setSubmitting(true);
    setStatus(null);
    const res = await authedRequest<FeedbackSubmitResponse>('/api/beta/feedback', {
      method: 'POST',
      body: { category, message: message.trim(), screenId: 'dashboard' },
    });
    if (res.abortedSession) return;
    setSubmitting(false);
    if (res.status === 201 && res.data.ok === true) {
      setMessage('');
      setStatus({ tone: 'success', text: t.feedbackSavedSuccess });
      if (res.data.feedback) {
        const created = res.data.feedback;
        setItems((prev) => [created, ...prev.filter((row) => row.feedbackId !== created.feedbackId)]);
      }
      void loadHistory();
      return;
    }
    setStatus({ tone: 'error', text: localizeBetaError(res, lang, t.feedbackSaveFailed) });
  };

  const categoryLabel = (cat: BetaFeedbackCategory): string => {
    const match = CATEGORIES.find((c) => c.value === cat);
    return match ? t[match.labelKey] : cat;
  };

  return (
    <section
      data-testid="feedback-panel"
      aria-labelledby="beta-feedback-heading"
      className="min-w-0 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4"
    >
      <div className="space-y-1">
        <h2 id="beta-feedback-heading" className="font-semibold text-sm text-emerald-300">
          {t.feedbackTitle}
        </h2>
        <p className="text-xs text-slate-400">{t.feedbackSubtitle}</p>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3" noValidate>
        <div className="space-y-1">
          <label htmlFor="beta-feedback-category" className="block text-xs text-slate-300">
            {t.feedbackCategoryLabel}
          </label>
          <select
            id="beta-feedback-category"
            data-testid="feedback-category-select"
            value={category}
            disabled={submitting}
            onChange={(e) => setCategory(e.target.value as BetaFeedbackCategory)}
            className={FIELD}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{t[c.labelKey]}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <label htmlFor="beta-feedback-message" className="text-slate-300">
              {t.feedbackMessageLabel}
            </label>
            <span className="font-mono tabular-nums text-slate-400" aria-live="polite">
              {trimmedLength} / {MAX_CHARS}
            </span>
          </div>
          <textarea
            id="beta-feedback-message"
            data-testid="feedback-message-input"
            rows={3}
            maxLength={MAX_CHARS}
            disabled={submitting}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t.feedbackMessagePlaceholder}
            aria-describedby="beta-feedback-secret-warning"
            className={`${FIELD} min-h-24 resize-y`}
          />
          <p id="beta-feedback-secret-warning" className="text-xs text-amber-200">
            {t.feedbackSecretWarning}
          </p>
          {trimmedLength > 0 && trimmedLength < MIN_CHARS && (
            <p className="text-xs text-amber-200">{t.feedbackTooShortHint}</p>
          )}
        </div>

        {status && (
          <div
            data-testid="feedback-status"
            role={status.tone === 'error' ? 'alert' : 'status'}
            aria-live={status.tone === 'error' ? 'assertive' : 'polite'}
            className={
              status.tone === 'error'
                ? 'p-2.5 rounded border bg-rose-950/80 border-rose-500/60 text-rose-200 text-xs break-words'
                : 'p-2.5 rounded border bg-emerald-950/70 border-emerald-500/60 text-emerald-200 text-xs break-words'
            }
          >
            {status.text}
          </div>
        )}

        <button
          type="submit"
          data-testid="feedback-submit-btn"
          disabled={submitting || !isLengthValid}
          className="min-h-11 px-4 py-2 rounded bg-emerald-500 text-slate-950 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed enabled:hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        >
          {submitting ? t.feedbackSubmitting : t.feedbackSubmitBtn}
        </button>
      </form>

      <div className="pt-3 border-t border-slate-800 space-y-2">
        <h3 className="text-xs font-semibold text-slate-300">{t.feedbackHistoryTitle}</h3>
        {historyError && <p role="alert" className="text-xs text-rose-200">{historyError}</p>}
        {items.length === 0 ? (
          <p className="text-xs text-slate-400">{t.feedbackHistoryEmpty}</p>
        ) : (
          <ul data-testid="feedback-history-list" className="space-y-2">
            {items.map((item) => (
              <li
                key={item.feedbackId}
                data-testid="feedback-history-item"
                className="p-2.5 rounded bg-slate-950/70 border border-slate-800 text-xs space-y-1 break-words"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-slate-400">
                  <span className="font-semibold text-slate-200">{categoryLabel(item.category)}</span>
                  <span className="font-mono tabular-nums">{formatIsoTimestamp(item.createdAtMs)}</span>
                </div>
                <p className="text-slate-300 whitespace-pre-wrap">{item.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
