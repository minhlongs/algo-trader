/**
 * /methodology — redirects to the Binh Pháp Trading doc on GitHub.
 * v1 simple external redirect; Phase 03 may replace with in-app rendered doc.
 */
import { useEffect } from 'react';

const METHODOLOGY_URL =
  'https://github.com/longtho638-jpg/algo-trader/blob/main/docs/BINH_PHAP_TRADING.md';

export function MethodologyPage() {
  useEffect(() => {
    window.location.replace(METHODOLOGY_URL);
  }, []);

  return (
    <div className="min-h-screen bg-[#080B14] text-[#C9D1D9] flex items-center justify-center px-4">
      <div className="text-center">
        <p className="text-[#F59E0B] text-xs uppercase tracking-[0.2em] mb-3">
          Redirecting
        </p>
        <p className="text-[#8892B0] text-sm mb-4">
          Opening the methodology on GitHub…
        </p>
        <a
          href={METHODOLOGY_URL}
          className="text-[#F59E0B] underline text-sm"
          rel="noopener noreferrer"
        >
          Click here if nothing happens
        </a>
      </div>
    </div>
  );
}
