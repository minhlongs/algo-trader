/**
 * CashClaw Analytics & Referral Tracking
 * Privacy-friendly: no cookies, GDPR-compliant, self-hosted compatible
 *
 * Features:
 * - Plausible Analytics integration (when PLAUSIBLE_DOMAIN configured)
 * - Referral parameter tracking (?ref=xxx)
 * - Conversion event tracking (signup, checkout, activation)
 * - UTM parameter capture
 */

(function() {
  'use strict';

  // ── Referral tracking ──────────────────────────────────────────────────────
  var REF_KEY = 'cashclaw_ref';
  var UTM_KEY = 'cashclaw_utm';

  function captureReferral() {
    var params = new URLSearchParams(window.location.search);
    var ref = params.get('ref');
    if (ref) {
      try { sessionStorage.setItem(REF_KEY, ref); } catch(e) { /* private browsing */ }
    }
    // Capture UTM params
    var utmSource = params.get('utm_source');
    var utmMedium = params.get('utm_medium');
    var utmCampaign = params.get('utm_campaign');
    if (utmSource) {
      try {
        sessionStorage.setItem(UTM_KEY, JSON.stringify({
          source: utmSource,
          medium: utmMedium || '',
          campaign: utmCampaign || ''
        }));
      } catch(e) { /* private browsing */ }
    }
  }

  function getRef() {
    try { return sessionStorage.getItem(REF_KEY) || ''; } catch(e) { return ''; }
  }

  function getUtm() {
    try {
      var raw = sessionStorage.getItem(UTM_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
  }

  // ── Conversion tracking ────────────────────────────────────────────────────
  function trackEvent(name, props) {
    // Plausible custom event
    if (window.plausible) {
      window.plausible(name, { props: props || {} });
    }
    // Send to our API for referral attribution
    var ref = getRef();
    var utm = getUtm();
    if (ref || utm) {
      var payload = { event: name, ref: ref, utm: utm, url: window.location.pathname, ts: Date.now() };
      navigator.sendBeacon('/api/analytics/event', new Blob([JSON.stringify(payload)], { type: 'application/json' }));
    }
  }

  // ── Auto-track key interactions ────────────────────────────────────────────
  function setupAutoTracking() {
    // Track pricing button clicks
    var pricingBtns = document.querySelectorAll('[id^="btn-"]');
    pricingBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tier = btn.id.replace('btn-', '').toUpperCase();
        trackEvent('Checkout Click', { tier: tier, ref: getRef() });
      });
    });

    // Track CTA clicks
    var ctaBtns = document.querySelectorAll('.cc-button--primary');
    ctaBtns.forEach(function(btn) {
      if (!btn.id.startsWith('btn-')) {
        btn.addEventListener('click', function() {
          trackEvent('CTA Click', { text: btn.textContent.trim().slice(0, 50) });
        });
      }
    });
  }

  // ── Append ref to checkout URLs ────────────────────────────────────────────
  function appendRefToCheckouts() {
    var ref = getRef();
    if (!ref) return;
    // Intercept checkout button clicks to append ref param
    document.addEventListener('click', function(e) {
      var link = e.target.closest('a[href*="nowpayments.io"]');
      if (link) {
        var url = new URL(link.href);
        url.searchParams.set('order_description', 'ref:' + ref);
        link.href = url.toString();
      }
    });
  }

  // ── Initialize ─────────────────────────────────────────────────────────────
  captureReferral();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setupAutoTracking();
      appendRefToCheckouts();
    });
  } else {
    setupAutoTracking();
    appendRefToCheckouts();
  }

  // Expose for manual tracking
  window.cashclawTrack = trackEvent;
})();
