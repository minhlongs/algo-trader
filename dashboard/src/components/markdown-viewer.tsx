/**
 * Markdown viewer — fetches a static .md file and renders via react-markdown.
 * Security: raw HTML passthrough is DISABLED (no rehype-raw) per phase-02 §Security.
 * Styling: Tailwind typography classes applied manually (dashboard has no
 * @tailwindcss/typography plugin); we hand-style prose for dark background.
 */
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface MarkdownViewerProps {
  /** Absolute path under /public — e.g. "/manifesto.md". */
  src: string;
  /** Visible label while loading. */
  loadingLabel?: string;
}

export function MarkdownViewer({
  src,
  loadingLabel = 'Loading document…',
}: MarkdownViewerProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMarkdown(null);
    setError(null);
    fetch(src, { cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setMarkdown(text);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <p className="text-[#FF3366] font-mono text-sm">
          Failed to load document: {error}
        </p>
      </div>
    );
  }

  if (markdown === null) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <p className="text-[#8892B0] font-mono text-sm animate-pulse">
          {loadingLabel}
        </p>
      </div>
    );
  }

  return (
    <article className="manifesto-prose max-w-3xl mx-auto px-4 sm:px-6 py-12 text-[#C9D1D9]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Intentionally NOT passing rehype-raw — raw HTML is stripped.
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
