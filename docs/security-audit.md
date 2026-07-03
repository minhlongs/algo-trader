# Security Audit

> Generated: 2026-07-03
> Scope: Dependency CVEs, `pnpm audit` findings

---

## Dependency Vulnerabilities

### Audit Command

```bash
pnpm audit --audit-level=high
```

### Result Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 0     |
| Moderate | 3     |
| Low      | 1     |

**No high or critical vulnerabilities found.** All findings are moderate or low.

---

### Moderate — @fastify/static (2 advisories)

| Field | Value |
|-------|-------|
| Installed | `9.0.0` |
| Patched | `>=9.1.1` |
| Advisories | GHSA-pr96-94w5-mx2h (path traversal), GHSA-x428-ghpx-8j92 (route guard bypass) |
| Path | `.> @fastify/static` |
| Fixable with `pnpm update` | No — pinned to exact `9.0.0` in `package.json` |
| Recommended fix | Change semver to `^9.0.0` and run `pnpm update @fastify/static` |

### Moderate — ip-address (XSS)

| Field | Value |
|-------|-------|
| Installed | Via `express-rate-limit@8.3.1` |
| Vulnerable | `<=10.1.0` |
| Patched | `>=10.1.1` |
| Path | `.> express-rate-limit > ip-address` |
| Fixable with `pnpm update` | No — `express-rate-limit` pinned to exact `8.3.1` |
| Recommended fix | Change semver to `^8.3.1` and run `pnpm update express-rate-limit` |

### Low — elliptic (cryptographic primitive)

| Field | Value |
|-------|-------|
| Installed | Via `@polymarket/clob-client-v2` transitive dep chain |
| Vulnerable | `<=6.6.1` |
| Patched | None available (`<0.0.0`) |
| Path | `.> @polymarket/clob-client-v2 > ... > elliptic` |
| Fixable | No patch exists — upstream library affected |
| Status | Acceptable risk: `elliptic` is used for Polymarket signing, not general-purpose crypto. No known exploit in this usage context. Upstream fix tracked: https://github.com/indutny/elliptic |

---

## Non-Fixable Items

These packages are pinned to exact versions and would require a `package.json` semver change:

| Package | Pinned Version | Issue |
|---------|---------------|-------|
| `@fastify/static` | `9.0.0` | 2 moderate path traversal CVEs; patched in `9.1.1` |
| `express-rate-limit` | `8.3.1` | Depends on vulnerable `ip-address`; patched in `8.5.x` |
| `elliptic` | `<=6.6.1` | Low-severity; no upstream patch available |

---

## Recommendations

1. Change `@fastify/static` from `"9.0.0"` to `"^9.0.0"` and run `pnpm update`.
2. Change `express-rate-limit` from `"8.3.1"` to `"^8.3.1"` and run `pnpm update`.
3. Monitor `elliptic` GitHub for upstream patch (current severity: low, no exploit path in current usage).

---

## Outdated Packages (Minor/Patch — for awareness)

The following are out of date but have no known CVE:

- `@polymarket/clob-client`: `5.8.0` -> `5.8.1`
- `ccxt`: `4.5.44` -> `4.5.63`
- `fs-extra`: `11.3.4` -> `11.3.6`
- `jose`: `6.2.2` -> `6.2.3`
- `bullmq`: `5.71.1` -> `5.79.2`
- `ioredis`: `5.10.1` -> `5.11.1`
- `grammy`: `1.41.1` -> `1.44.0`
