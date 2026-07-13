/**
 * Public footer for landing, pricing, auth pages.
 * 3-column layout with disclaimer.
 */
import { Link } from 'react-router-dom';
import { COLORS as _COLORS } from '../lib/stitch-design-tokens';

export function Footer() {
  return (
    <footer className="border-t border-[${_COLORS.surface}] bg-[${_COLORS.surface}] mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <p className="text-[${_COLORS.primary}] font-bold text-base mb-2">CashClaw</p>
            <p className="text-[${_COLORS.onSurfaceVariant}] text-xs leading-relaxed">
              Automated market making for Polymarket prediction markets.
            </p>
          </div>

          {/* Product links */}
          <div>
            <p className="text-white text-xs uppercase tracking-widest mb-3">Product</p>
            <ul className="space-y-2">
              <li>
                <Link to="/pricing" className="text-[${_COLORS.onSurfaceVariant}] hover:text-white text-xs transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/docs" className="text-[${_COLORS.onSurfaceVariant}] hover:text-white text-xs transition-colors">
                  Docs
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-[${_COLORS.onSurfaceVariant}] hover:text-white text-xs transition-colors">
                  Login
                </Link>
              </li>
              <li>
                <Link to="/signup" className="text-[${_COLORS.onSurfaceVariant}] hover:text-white text-xs transition-colors">
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
                <Link to="/terms" className="text-[${_COLORS.onSurfaceVariant}] hover:text-white text-xs transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="text-[${_COLORS.onSurfaceVariant}] hover:text-white text-xs transition-colors">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[${_COLORS.surface}] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-[${_COLORS.onSurfaceVariant}] text-xs">
            &copy; 2026 Binh Phap Venture Studio. All rights reserved.
          </p>
          <p className="text-[${_COLORS.onSurfaceVariant}] text-xs">
            Not financial advice. Trade at your own risk.
          </p>
        </div>
      </div>
    </footer>
  );
}
