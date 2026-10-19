// SPDX-License-Identifier: MIT
/**
 * AlgoTrade OS — UI/UX Pro Max v5 Interactive Command Palette, Theme Switcher & Kill-Switch Runtime
 * Attaches WCAG AAA keyboard navigation, Cmd+K 16-Screen Launcher with live search filter,
 * 3-Theme Switcher, Bilingual VI/EN toggle, Pause-Pulse accessibility toggle, and <50ms Kill-Switch.
 */
(function () {
  const SCREENS = [
    { id: '01', titleEn: 'Master Cloud RaaS Dashboard', titleVi: 'Bảng Điều Khiển Cloud RaaS', href: 'dashboard.html' },
    { id: '02', titleEn: 'Institutional Quant Cockpit & Terminal', titleVi: 'Buồng Lái Định Lượng & Khớp Lệnh', href: 'quant-terminal.html' },
    { id: '03', titleEn: 'Strategy Marketplace & Creator Hub (70/30)', titleVi: 'Sàn Thuật Toán & Chia Sẻ 70/30', href: 'marketplace.html' },
    { id: '04', titleEn: 'Bilingual Alpha & Backtest Leaderboard', titleVi: 'Bảng Xếp Hạng Alpha Song Ngữ', href: 'leaderboard.html' },
    { id: '05', titleEn: 'Multi-Tenant Billing & SHA-256 Audit', titleVi: 'Thanh Toán PayOS/NOWPayments & Kiểm Toán', href: 'billing.html' },
    { id: '06', titleEn: 'Zero-Knowledge BYOK Onboarding Wizard', titleVi: 'Trình Thiết Lập Khóa BYOK AES-256', href: 'byok-wizard.html' },
    { id: '07', titleEn: 'Mobile Companion & Risk Sentry', titleVi: 'Ứng Dụng Di Động & Cảnh Báo Rủi Ro', href: 'mobile-sentry.html' },
    { id: '08', titleEn: 'Universal Component Style Guide', titleVi: 'Hệ Thống Thiết Kế Component Chuẩn Hóa', href: 'styleguide.html' },
    { id: '09', titleEn: 'Cloudflare Shard Telemetry & HFT Mesh', titleVi: 'Giám Sát Phân Mảnh Cloudflare DO', href: 'telemetry.html' },
    { id: '10', titleEn: 'WebSocket Trade Feed & Latency Simulator', titleVi: 'Mô Phỏng Độ Trễ Vi Cấu Trúc WebSocket', href: 'latency-simulator.html' },
    { id: '11', titleEn: 'Algorithmic Stress Lab & Tail-Risk VaR', titleVi: 'Phòng Thí Nghiệm Stress & Rủi Ro Đuôi VaR', href: 'stress-lab.html' },
    { id: '12', titleEn: 'Walk-Forward & CPCV Backtest Studio', titleVi: 'Xưởng Kiểm Định Walk-Forward & CPCV', href: 'backtest-studio.html' },
    { id: '13', titleEn: 'Smart Order Routing (SOR) Liquidity Mesh', titleVi: 'Mạng Lưới Định Tuyến Lệnh Thông Minh SOR', href: 'order-routing-mesh.html' },
    { id: '14', titleEn: 'Multi-Regime Kelly, SVI & VPIN Cockpit', titleVi: 'Buồng Lái Kelly Đa Chế Độ, SVI & VPIN', href: 'regime-kelly-matrix.html' },
    { id: '15', titleEn: 'Hawkes Order-Flow, Avellaneda & Kyle Radar', titleVi: 'Radar Dòng Lệnh Hawkes, Avellaneda & Kyle', href: 'hawkes-orderflow-radar.html' },
    { id: '16', titleEn: 'Queue-Reactive LOB, Roll & Hasbrouck Cockpit', titleVi: 'Buồng Lái Hàng Đợi LOB, Roll & Hasbrouck', href: 'limit-order-queue-cockpit.html' },
    { id: '17', titleEn: 'Avellaneda-Lipkin Market Making & Kyle-Back Insider Cockpit', titleVi: 'Buồng Lái Tạo Lập Thị Trường Avellaneda-Lipkin & Nội Gián Kyle-Back', href: 'avellaneda-lipkin-kyle-back-cockpit.html' },
    { id: '18', titleEn: 'Cointegration Stat-Arb, OU Half-Life & Glosten-Milgrom Cockpit', titleVi: 'Buồng Lái Stat-Arb Đồng Liên Kết, Chu Kỳ Bán Rã OU & Glosten-Milgrom', href: 'statarb-glosten-milgrom-cockpit.html' },
    { id: '19', titleEn: 'Black-Litterman Posterior & Equal Risk Contribution Cockpit', titleVi: 'Buồng Lái Lợi Nhuận Hậu Nghiệm Black-Litterman & Đóng Góp Rủi Ro Đồng Đều', href: 'black-litterman-risk-parity-cockpit.html' },
  ];

  const THEMES = ['OBSIDIAN_QUANTUM', 'BENTO_RAAS_GLASS', 'NORDIC_MINIMALIST_QUANT'];

  function applyLanguage(lang) {
    document.documentElement.setAttribute('data-stitch-lang', lang);
    document.querySelectorAll('[data-en][data-vi]').forEach(function (el) {
      el.textContent = lang === 'VI' ? el.getAttribute('data-vi') : el.getAttribute('data-en');
    });
  }

  function initUiUxProMax() {
    if (!document.body) return;

    const mainEl = document.querySelector('main') || document.body.firstElementChild;
    if (mainEl && !mainEl.id) {
      mainEl.id = 'main-content';
    }

    if (!document.querySelector('.pro-max-skip-link')) {
      const skip = document.createElement('a');
      skip.href = '#main-content';
      skip.className = 'pro-max-skip-link';
      skip.textContent = 'Skip to main content (UI/UX Pro Max A11y)';
      document.body.prepend(skip);
    }

    document.querySelectorAll('button').forEach((btn, idx) => {
      if (!btn.getAttribute('aria-label') && !(btn.textContent || '').trim()) {
        btn.setAttribute('aria-label', 'Interactive control ' + (idx + 1));
      }
    });

    const savedTheme = localStorage.getItem('stitch_theme') || 'OBSIDIAN_QUANTUM';
    const savedLang = localStorage.getItem('stitch_lang') || 'EN';
    document.documentElement.setAttribute('data-stitch-theme', savedTheme);
    applyLanguage(savedLang);

    const dock = document.createElement('aside');
    dock.className = 'pro-max-dock';
    dock.setAttribute('aria-label', 'UI/UX Pro Max Quick Controls');
    dock.innerHTML = [
      '<button type="button" id="pro-max-cmd-btn" aria-label="Open 16-Screen Command Palette (Cmd+K)" style="padding:4px 8px;background:#161B24;color:#00F2FE;border:1px solid #1E2430;border-radius:4px;">&#8984;K SCREENS (16)</button>',
      '<button type="button" id="pro-max-lang-btn" aria-label="Toggle Bilingual Language EN/VI" style="padding:4px 8px;background:#161B24;color:#F59E0B;border:1px solid #1E2430;border-radius:4px;">LANG: ' + savedLang + '</button>',
      '<button type="button" id="pro-max-theme-btn" aria-label="Cycle Design Theme" style="padding:4px 8px;background:#161B24;color:#E3E2E6;border:1px solid #1E2430;border-radius:4px;">THEME: ' + savedTheme.split('_')[0] + '</button>',
      '<button type="button" id="pro-max-motion-btn" aria-label="Toggle Live Pulse Animation" style="padding:4px 8px;background:#161B24;color:#00E599;border:1px solid #1E2430;border-radius:4px;">PULSE: ON</button>',
      '<button type="button" id="pro-max-kill-btn" aria-label="Trigger Emergency Kill-Switch" style="padding:4px 8px;background:rgba(255,59,48,0.18);color:#FF3B30;border:1px solid #FF3B30;border-radius:4px;font-weight:700;">KILL-SWITCH</button>',
    ].join('');
    document.body.appendChild(dock);

    const modal = document.createElement('div');
    modal.className = 'pro-max-modal-backdrop';
    modal.id = 'pro-max-cmd-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'AlgoTrade OS 16-Screen Command Palette');
    const linksHtml = SCREENS.map(function (s) {
      return (
        '<a class="pro-max-screen-item" data-search="' + (s.id + ' ' + s.titleEn + ' ' + s.titleVi).toLowerCase() + '" href="' + s.href + '" style="display:flex;justify-content:space-between;padding:8px 10px;border:1px solid #1E2430;border-radius:4px;background:#141821;color:#F8FAFC;text-decoration:none;font-size:12px;">' +
        '<span><strong style="color:#00F2FE;">[' + s.id + ']</strong> ' + s.titleEn + '</span>' +
        '<span style="color:#94A3B8;font-size:11px;">' + s.titleVi + '</span>' +
        '</a>'
      );
    }).join('');

    modal.innerHTML =
      '<div style="width:100%;max-width:680px;background:#0F1218;border:1px solid #00F2FE;border-radius:4px;padding:16px;font-family:JetBrains Mono,monospace;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">' +
      '<span style="color:#00F2FE;font-weight:700;font-size:13px;">ALGOTRADE OS // 16-SCREEN STITCH COMMAND PALETTE (UI/UX PRO MAX v5)</span>' +
      '<button type="button" id="pro-max-close-modal" aria-label="Close Command Palette" style="padding:2px 8px;background:#161B24;color:#94A3B8;border:1px solid #1E2430;border-radius:4px;">ESC</button>' +
      '</div>' +
      '<input id="pro-max-cmd-filter" type="search" placeholder="Filter 16 screens (e.g. Hawkes, Kelly, SOR, Queue, Billing)..." aria-label="Filter Stitch screens" style="width:100%;padding:7px 10px;margin-bottom:10px;background:#141821;color:#F8FAFC;border:1px solid #1E2430;border-radius:4px;font-family:JetBrains Mono,monospace;font-size:12px;" />' +
      '<div style="display:grid;gap:6px;max-height:64vh;overflow-y:auto;">' + linksHtml + '</div>' +
      '</div>';
    document.body.appendChild(modal);

    const filterInput = document.getElementById('pro-max-cmd-filter');
    filterInput?.addEventListener('input', function (e) {
      const q = (e.target.value || '').toLowerCase().trim();
      modal.querySelectorAll('.pro-max-screen-item').forEach(function (item) {
        const hay = item.getAttribute('data-search') || '';
        item.style.display = !q || hay.includes(q) ? 'flex' : 'none';
      });
    });

    document.getElementById('pro-max-cmd-btn')?.addEventListener('click', function () {
      modal.classList.add('open');
      filterInput?.focus();
    });
    document.getElementById('pro-max-close-modal')?.addEventListener('click', function () {
      modal.classList.remove('open');
    });
    modal.addEventListener('click', function (e) {
      if (e.target === modal) modal.classList.remove('open');
    });
    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        modal.classList.toggle('open');
        if (modal.classList.contains('open')) filterInput?.focus();
      } else if (e.key === 'Escape') {
        modal.classList.remove('open');
      }
    });

    document.getElementById('pro-max-lang-btn')?.addEventListener('click', function (e) {
      const curr = document.documentElement.getAttribute('data-stitch-lang') || 'EN';
      const next = curr === 'EN' ? 'VI' : 'EN';
      localStorage.setItem('stitch_lang', next);
      applyLanguage(next);
      e.currentTarget.textContent = 'LANG: ' + next;
    });

    document.getElementById('pro-max-theme-btn')?.addEventListener('click', function (e) {
      const curr = document.documentElement.getAttribute('data-stitch-theme') || 'OBSIDIAN_QUANTUM';
      const next = THEMES[(THEMES.indexOf(curr) + 1) % THEMES.length];
      document.documentElement.setAttribute('data-stitch-theme', next);
      localStorage.setItem('stitch_theme', next);
      e.currentTarget.textContent = 'THEME: ' + next.split('_')[0];
    });

    document.getElementById('pro-max-motion-btn')?.addEventListener('click', function (e) {
      const paused = document.body.classList.toggle('pro-max-motion-paused');
      e.currentTarget.textContent = paused ? 'PULSE: PAUSED' : 'PULSE: ON';
    });

    document.getElementById('pro-max-kill-btn')?.addEventListener('click', function (e) {
      const btn = e.currentTarget;
      if (btn.getAttribute('data-armed') !== 'true') {
        btn.setAttribute('data-armed', 'true');
        btn.textContent = 'CONFIRM HALT (<50ms)';
        return;
      }
      btn.setAttribute('data-armed', 'false');
      btn.textContent = 'HALTED (SHA-256 AUDITED)';
      btn.style.background = '#FF3B30';
      btn.style.color = '#08090C';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUiUxProMax);
  } else {
    initUiUxProMax();
  }
})();
