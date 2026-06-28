# Phase 5: Enhanced Fraud Detection

**Priority**: P1 - Security & Data Quality  
**Status**: Not Started  
**Effort**: 2 days  
**Dependencies**: Phase 4 (affiliate auth) complete

---

## Context Links

- **Plan**: `plans/260621-1618-affiliate-api-enhancements/plan.md`
- **Existing detector**: `src/referral/fraud-detector.ts`
- **Fraud table**: `referral_tracking.is_fraudulent`, `fraud_score`, `metadata.fraud_details`
- **Batch job**: `ReferralService.runFraudDetection()`

---

## Overview

Upgrade the fraud detection system from basic IP/User-Agent rate limiting to multi-signal behavioral analysis. Current detector checks: suspicious user agents, high click rates, private IPs, rapid clicks. Missing: device fingerprinting, proxy/VPN detection, click-to-signup timing, email domain analysis, geolocation mismatch, self-referral patterns.

---

## Key Insights

- **Fraud impact**: Fake clicks/ conversions drain payout budget, damage program credibility
- **Multi-layer**: No single signal is definitive; weighted scoring improves accuracy
- **Real-time vs batch**: Some signals (IP rate) real-time; others (proxy detection) batch for performance
- **False positives**: Legitimate partners may have high traffic (viral posts); need manual review queue before auto-block
- **Attribution fraud**: Partners may use bots to click their own links (self-referral) or click farms
- **Data sources**: IP geolocation (MaxMind DB), disposable email domains (public list), proxy services (IPQualityScore API or local DB)

---

## Requirements

### New Fraud Signals

1. **Device fingerprinting**:
   - Combine: User-Agent + Accept-Language + Screen resolution (from JS on landing page)
   - Hash to device_id
   - Track clicks per device_id per day
   - Flag: >5 distinct IPs per device per day (VPN hopping)
   - Flag: >20 clicks per device per day (bot-like)

2. **Proxy/VPN detection**:
   - Use ipqualityscore.com API (paid) or local IP2Location DB (free)
   - Flag: datacenter IP (AWS, GCP, Azure ranges)
   - Flag: residential proxy (Luminati, BrightData)
   - Score: +30 for datacenter, +20 for residential proxy

3. **Click-to-signup timing**:
   - Measure: timestamp of click → timestamp of signup (from cookie)
   - Legitimate: 2-10 minutes (user considers)
   - Suspicious: < 5 seconds (auto-fill bot) or > 7 days (forgetfulness, less likely to convert)
   - Score: +25 for < 5s, +10 for > 7d

4. **Email domain analysis**:
   - Disposable domains: `mailinator.com`, `temp-mail.org`, `10minutemail.com` (maintain blocklist)
   - Typo-squatting: `gmial.com`, `yaho0.com` (Levenshtein distance 1 to major providers)
   - Score: +40 for disposable, +20 for typo

5. **Geolocation mismatch**:
   - Store: IP country, browser language (Accept-Language), timezone offset (JS)
   - Flag: IP country ≠ browser language primary (e.g., IP Germany, browser fr-FR)
   - Flag: Impossible travel: clicks from NY (IP 123km) and London (IP 345km) within 1 hour (impossible physically)
   - Score: +25 per mismatch

6. **Aggressive self-referral**:
   - Track: IP address of click vs IP of referring tenant's API calls
   - If click IP matches tenant's API IPs within 24h → self-referral attempt
   - Score: +50 (highest)

### Scoring Model

```typescript
interface FraudScoreComponents {
  userAgent: number;           // 0-40 (suspicious bot UA)
  ipRate: number;              // 0-30 (high volume)
  deviceFingerprint: number;   // 0-30 (multiple IPs, high clicks)
  proxyVpn: number;            // 0-30 (datacenter/proxy)
  timing: number;              // 0-25 (instant or too slow)
  emailDomain: number;         // 0-40 (disposable/typo)
  geolocation: number;         // 0-25 (mismatch)
  selfReferral: number;        // 0-50 (IP match with tenant)
  // Total max: 270, scaled to 0-100
}

// Thresholds:
// 0-30: Low risk (pass automatically)
// 31-60: Medium (allow but flag for review)
// 61-80: High (block conversion, notify partner)
// 81-100: Critical (auto-block, investigate)
```

### Auto-Actions

- Score ≥ 80: Mark `is_fraudulent = true`, block conversion (do not create commission)
- Score 61-79: Allow but flag; send admin alert; partner can dispute within 30 days
- Score ≤ 60: Allow automatically

---

## Architecture

### Device Fingerprint

**Client-side** (landing page JS):
```javascript
// Collect fingerprint
const fingerprint = {
  userAgent: navigator.userAgent,
  language: navigator.language,
  screenRes: `${screen.width}x${screen.height}`,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  // Optional: canvas hash, WebGL hash (advanced)
};
// Send with track-click
fetch('/api/v1/referral/track-click?code=XXXX', {
  method: 'POST',
  body: JSON.stringify({
    ip: '', // server fills
    userAgent: navigator.userAgent,
    metadata: {
      ...fingerprint,
    },
  }),
});
```

**Server-side**:
```typescript
function generateDeviceId(metadata: ReferralClickMetadata): string {
  const components = [
    metadata.deviceUserAgent || '',
    metadata.deviceLanguage || '',
    metadata.deviceScreenRes || '',
    metadata.deviceTimezone || '',
  ];
  return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
}
```

Store in `referral_tracking.metadata.device_id`. Track device stats in new table `affiliate_device_fingerprints` (optional, can aggregate on-the-fly).

### Proxy Detection

**Option A: IPQualityScore API** (paid, more accurate):
```typescript
async checkProxy(ip: string): Promise<{ isProxy: boolean; type: string }> {
  const resp = await fetch(`https://ipqualityscore.com/api/json/ip/${IQS_KEY}/${ip}`);
  const data = await resp.json();
  return { isProxy: data.proxy || data.datacenter, type: data.proxy_type };
}
```

**Option B: Local DB** (free, less accurate):
- Download IP2Location LITE DB (free)
- Query local DB for `is_proxy`, `proxy_type`
- Batch process offline (cron every 6h)

For MVP, use local DB to avoid external dependency.

### Batch Analysis Job

Enhance `runFraudDetection(limit)` to:
1. Fetch recent clicks (last 24h) with `fraud_score = 0`
2. For each click, run ALL new signals (device, proxy, timing, email, geo)
3. Calculate composite score (weighted sum)
4. Update `referral_tracking.fraud_score`, `metadata.fraud_details`
5. If score ≥ 80, set `is_fraudulent = true`
6. Publish `fraud.flag` event (for admin dashboard)
7. Repeat nightly for past 30 days (retroactive analysis)

### Admin Fraud Review Dashboard

New page: `dashboard/src/pages/admin/fraud-review-page.tsx` (admin role required):
- Table: flagged clicks (score ≥ 61)
- Columns: tracking ID, code, IP, user agent, score breakdown, fraud reasons
- Actions: Mark as "legitimate" (override), "fraudulent" (confirm), "investigate"
- Override updates `fraud_score` to 0 or keeps score but `is_fraudulent = false`
- Bulk actions: approve/deny 100 at a time

---

## Related Code Files

**To Modify**:
- `src/referral/fraud-detector.ts` - extend with new signals
- `src/referral/referral-service.ts` - call enhanced detector in `trackReferralClick()`
- `src/referral/referral-repository.ts` - store `device_id`, `fraud_details` in metadata
- `src/billing/onboarding-service.ts` - capture email domain signal during signup

**To Create**:
- `src/referral/device-fingerprint.ts` - device ID generation, storage
- `src/referral/proxy-detector.ts` - local IP2Location integration
- `src/referral/email-domain-analyzer.ts` - disposable/typo detection
- `src/referral/geolocation-mismatch.ts` - IP vs browser language check
- `src/referral/self-referral-detector.ts` - IP match with referring tenant's API calls
- `dashboard/src/pages/admin/fraud-review-page.tsx`
- `dashboard/src/components/referral/fraud-score-badge.tsx` (show in click list)
- Migration: `027_fraud_enhancements.sql` (new tables if needed, or just use metadata)

**Tests**:
- `src/referral/__tests__/device-fingerprint.test.ts`
- `src/referral/__tests__/proxy-detector.test.ts`
- `src/referral/__tests__/email-analyzer.test.ts`
- `src/referral/__tests__/fraud-detector-v2.test.ts` (integration all signals)
- `dashboard/src/pages/admin/__tests__/fraud-review-page.test.ts`

---

## Implementation Steps

1. **Add dependencies**:
   - `pnpm add geoip-lite` (or `ip2location-nodejs` if using IP2Location)
   - Download IP2Location LITE DB to `data/ip2location/` (gitignore)

2. **Create device fingerprint module** (`device-fingerprint.ts`):
   - `generateDeviceId(metadata): string` - hash components
   - Normalize: lowercase user agent, trim whitespace
   - Store in `metadata.device_id`

3. **Create proxy detector** (`proxy-detector.ts`):
   - Load IP2Location DB on startup
   - `isDatacenter(ip): boolean` - check `is_proxy == 1` or `proxy_type == 'D'`
   - `isResidentialProxy(ip): boolean` - check `proxy_type == 'R'`
   - Cache results in Redis (24h TTL) to avoid repeated DB lookups

4. **Create email analyzer** (`email-analyzer.ts`):
   - Load disposable domain list (from `disposable-email-domains` npm package or custom list)
   - `isDisposable(domain): boolean`
   - `isTypoSquatting(domain): boolean` - compare to `['gmail.com','yahoo.com','hotmail.com','outlook.com','aol.com','icloud.com']` using Levenshtein distance ≤ 1

5. **Create self-referral detector** (`self-referral-detector.ts`):
   - Track recent API calls from each tenant (cache in Redis: `tenant_api_ips:{tenantId}` - set of IPs, TTL 24h)
   - `isSelfReferral(clickIp, tenantId): Promise<boolean>` - check if clickIp in tenant's API IP set
   - Update set on each API call (middleware)

6. **Enhance `FraudDetector`** (`fraud-detector.ts`):
   - Add new private methods: `assessDeviceFingerprint()`, `assessProxy()`, `assessTiming()`, `assessEmail()`, `assessGeoMismatch()`, `assessSelfReferral()`
   - Update `detectFraud()` to call all signals, sum weighted scores
   - Normalize to 0-100 scale: `score = Math.min(270, total) / 270 * 100`
   - Return detailed breakdown in `reasons`: `[{signal: 'proxy', score: 30, detail: 'Datacenter IP'}]`

7. **Update `ReferralService.trackReferralClick()`**:
   - Capture email domain (if passed in metadata, or from signup flow later)
   - Capture click timestamp (store in tracking record)
   - Call enhanced `fraudDetector.detectFraud()`
   - Store breakdown in `referral_tracking.metadata.fraud_details`
   - Update `fraud_score`, `is_fraudulent`

8. **Update `OnboardingService`** to pass email domain to fraud analysis:
   - In `activate()`, after conversion recorded, update tracking with email domain if not already captured
   - Re-run fraud check with email signal

9. **Create batch job enhancements** (`runFraudDetection()`):
   - Process last 24h clicks (already)
   - For each, call new detector (includes all signals)
   - Update `fraud_score`, `is_fraudulent`, `metadata.fraud_details`
   - Publish event: `fraud.flag` with `{ trackingId, score, reasons }`
   - Log summary: `{ analyzed, flagged, avgScore }`

10. **Admin dashboard** (`fraud-review-page.tsx`):
    - Fetch flagged clicks: `GET /api/v1/admin/fraud/flags?min_score=61`
    - Show table with expandable details (score breakdown)
    - Actions: override legitimate, confirm fraudulent, investigate
    - POST endpoints: `POST /api/v1/admin/fraud/override/:id` with `{ isFraudulent: false }`
    - Add to admin router

11. **Alerting**:
    - If >10% of daily clicks flagged as fraud, send Telegram alert to admin
    - Grafana panel: fraud score distribution histogram

12. **Write tests**:
    - Unit: each signal detector with known inputs (datacenter IP, disposable email, etc.)
    - Unit: composite scoring (weighted sum)
    - Integration: end-to-end click → fraud score → admin review → override
    - Load: batch analyze 10k clicks < 5 minutes

13. **Documentation**:
    - Update `docs/fraud-detection.md` with all signals and thresholds
    - Partner FAQ: "Why was my commission flagged?" (explain review process)

14. **Deploy**:
    - Run migration (if new tables)
    - Deploy to staging; run batch job on historical data
    - Review flagged list manually; tune thresholds if false positives
    - Enable in production with batch mode first (score only, don't block) for 7 days
    - Monitor false positive rate via admin dashboard
    - After 7 days, enable auto-block for score ≥ 80

---

## Todo List

- [ ] Add geoip-lite dependency
- [ ] Download IP2Location DB to data/
- [ ] Implement device-fingerprint.ts
- [ ] Implement proxy-detector.ts (with IP2Location)
- [ ] Implement email-domain-analyzer.ts (with disposable domains list)
- [ ] Implement self-referral-detector.ts (track tenant API IPs in Redis)
- [ ] Implement geolocation-mismatch.ts
- [ ] Enhance FraudDetector with all new signals
- [ ] Update trackReferralClick() to capture email domain, click timestamp
- [ ] Update OnboardingService to re-run fraud check with email
- [ ] Enhance runFraudDetection() batch job
- [ ] Create admin fraud review page
- [ ] Add admin API routes: GET /flags, POST /override
- [ ] Implement Telegram alert for high fraud rate
- [ ] Write unit tests (≥ 90%)
- [ ] Write integration tests
- [ ] Run typecheck (0 errors)
- [ ] Deploy to staging; tune thresholds
- [ ] Deploy to production (score-only mode 7 days)
- [ ] Enable auto-block for score ≥ 80
- [ ] Update docs

---

## Success Criteria

- **Detection rate**: >95% of simulated bot attacks flagged (score ≥ 61)
- **False positive rate**: < 2% of legitimate clicks flagged (review queue)
- **Auto-block**: Score ≥ 80 correctly blocked >98% (high precision)
- **Performance**: Batch job processes 10k clicks in < 5 minutes
- **Admin efficiency**: Can review 100 flags/hour via dashboard
- **Metrics**: All signals tracked in Prometheus histograms

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| False positives anger legitimate partners | High | High | Run score-only mode for 7 days; manual override; partner support email |
| IP2Location DB outdated | Medium | Medium | Auto-update DB weekly; fallback to IPQualityScore API |
| Performance degradation from device fingerprinting | Low | Medium | Index `metadata->>'device_id'`; cache device stats in Redis |
| Self-referral detection too aggressive (shared IPs) | Medium | Medium | Whitelist: corporate VPNs, university networks (known CIDRs) |
| Email typo detection misses new TLDs | Low | Low | Update major provider list quarterly |

---

## Security Considerations

- **IP storage**: Already stored in `clicked_by_ip` (INET type). Ensure GDPR compliance (IP is personal data).
- **Data minimization**: Store only necessary fingerprint components; hash device_id (not raw components).
- **Audit**: All fraud overrides logged with admin user ID and reason.
- **Transparency**: Partners can see fraud score on their clicks (in dashboard) and dispute.

---

## Next Steps

After Phase 5:
1. Phase 6: Testing & monitoring (load test reporting endpoints, WS connections, fraud batch)
2. Documentation: API reference, admin runbook, partner FAQ
3. Production rollout with monitoring

---

**Phase Status**: Not Started  
**Blockers**: Phase 4 completion (affiliate auth)  
**Next**: Begin implementation after Phase 4 tests pass
