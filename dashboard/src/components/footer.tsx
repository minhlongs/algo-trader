/**
 * Public footer for landing, pricing, auth pages.
 * 3-column layout with disclaimer.
 */
import { Link } from 'react-router-dom';
import { COLORS as _COLORS } from '../lib/stitch-design-tokens';

export function Footer() {
  return (
    <footer
      className="border-t mt-auto"
      style={{
        backgroundColor: _COLORS.surface,
        borderColor: _COLORS.outline,
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <p className="font-bold text-base mb-2" style={{ color: _COLORS.primary }}>
              CashClaw
            </p>
            <p className="text-xs leading-relaxed" style={{ color: _COLORS.onSurfaceVariant }}>
              Automated market making for Polymarket prediction markets.
            </p>
          </div>

          {/* Product links */}
          <div>
            <p className="text-white text-xs uppercase tracking-widest mb-3">Product</p>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/pricing"
                  className="hover:text-white text-xs transition-colors"
                  style={{ color: _COLORS.onSurfaceVariant }}
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  to="/docs"
                  className="hover:text-white text-xs transition-colors"
                  style={{ color: _COLORS.onSurfaceVariant }}
                >
                  Docs
                </Link>
              </li>
              <li>
                <Link
                  to="/login"
                  className="hover:text-white text-xs transition-colors"
                  style={{ color: _COLORS.onSurfaceVariant }}
                >
                  Login
                </Link>
              </li>
              <li>
                <Link
                  to="/signup"
                  className="hover:text-white text-xs transition-colors"
                  style={{ color: _COLORS.onSurfaceVariant }}
                >
                  Sign Up
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-white text-xs uppercase tracking-widest mb-3">Legal</p>
            <ul className="space-y-2">
              <li>
                <Link
                  to="/terms"
                  className="hover:text-white text-xs transition-colors"
                  style={{ color: _COLORS.onSurfaceVariant }}
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="hover:text-white text-xs transition-colors"
                  style={{ color: _COLORS.onSurfaceVariant }}
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div
          className="mt-8 pt-6 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
          style={{ borderColor: _COLORS.outline }}
        >
          <p className="text-xs" style={{ color: _COLORS.onSurfaceVariant }}>
            &copy; 2026 Binh Phap Venture Studio. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: _COLORS.onSurfaceVariant }}>
            Not financial advice. Trade at your own risk.
          </p>
        </div>
      </div>
    </footer>
  );
}
