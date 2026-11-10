# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Entries before 1.0.0 predate versioning and are grouped by date.

## [1.0.0] - 2026-11-10

### Added

- Standalone installs: one deployment per site, configured entirely through
  `[vars]` in `wrangler.toml` (`SITE_ORIGIN`, `PAGE_PATH`, `FALLBACK_PATH`,
  `SITEMAP_URL`, `VIEWPORT`, `CACHE_TTL_SECONDS`, `BROWSER_MAX_AGE_SECONDS`,
  `WARMUP_LIMIT`). Invalid configuration (including `CACHE_TTL_SECONDS`
  below the 60-second KV minimum) returns HTTP 500 and logs the offending
  variable.
- Site Profile module (`src/site-profile.ts`) owning Slug ↔ page URL mapping
  and the Fallback Image URL.
- Screenshot store module (`src/screenshot-store.ts`) owning the Edge Cache →
  KV Cache lookup, write-back, keys, TTLs and `X-Cache` header.
- In-worker Cache Warmup on a Cron Trigger (`scheduled` handler). Follows a
  sitemap index (including CDATA-wrapped `<loc>`), skips Slugs already in KV, renders at most `WARMUP_LIMIT`
  per run and reuses one browser session.
- Unit tests (Vitest) with in-memory KV and Edge Cache adapters, a TypeScript
  typecheck, and `npm test` / `npm run typecheck` scripts.
- README sections on configuration variables, multiple sites via Wrangler
  environments, and source layout.

### Changed

- KV keys are scoped by site host: `og:{host}:{slug}` (was `og:{slug}`).
  Existing cached images are re-rendered once after deploying.
- `CACHE_TTL_SECONDS` bounds a screenshot's lifetime in every cache. KV
  entries record when they were rendered, and a KV hit is promoted to the
  Edge Cache only for its remaining lifetime. Browsers receive at most
  `max-age=86400`.
- Edge Cache keys ignore the query string.
- Fallback Image is optional. Without `FALLBACK_PATH`, a failed render
  returns `502`.
- The deploy workflow runs typecheck and tests before deploying, uses
  `npm ci`, and runs on Node 24.

### Removed

- `.github/workflows/warm-og-cache.yml`, replaced by the in-worker Cache
  Warmup.

## 2026-08-26

### Changed

- Refactored the worker request flow and made the documentation generic.

## 2026-07-06

### Added

- Edge Cache (Cloudflare Cache API) in front of the KV Cache, with
  `X-Cache: HIT-EDGE | HIT-KV | MISS`.
- GitHub Actions for deploying and weekly Cache Warmup.

## 2026-07-01

### Added

- Initial worker: screenshots site pages with Cloudflare Browser Rendering,
  caches them in Workers KV for 7 days, and falls back to a static OG image.

[1.0.0]: https://github.com/soderlind/og-screenshot-worker/releases/tag/v1.0.0
