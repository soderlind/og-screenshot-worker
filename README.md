
# OG Screenshot Worker

Generate dynamic Open Graph images using Cloudflare Browser Rendering.

This Cloudflare Worker takes live screenshots of pages on one site and serves
them as OG images for social media previews.

The worker is standalone: **one install per site**. Every site-specific value
lives in `wrangler.toml`, so you can deploy it N times (one per site) without
touching the code. Cache Warmup runs inside the worker on a Cron Trigger, so no
CI is needed either.

[How It Works](#how-it-works) · [Setup](#setup) ·
[Configuration](#configuration) · [Usage](#usage) ·
[Cache Warmup](#cache-warmup)

---

## How It Works

When someone shares a link to `example.com/plugins/wp-loupe/`, social
platforms fetch `https://og.example.com/plugins/wp-loupe.png`. The worker
caches on two tiers and only renders on a full miss:

1. **Edge cache (Cache API)** — Returns the image from the colo-local edge
  cache if present (fastest, no KV read)
2. **KV cache** — On an edge miss, returns the screenshot from KV
  (durable, cross-colo) and warms the edge cache
3. **Launches headless browser** — On a full miss, uses Cloudflare Browser Rendering
4. **Takes screenshot** — Captures the page at `VIEWPORT` (default 1200×630)
5. **Populates both caches** — Stores in KV and in the edge cache for
  `CACHE_TTL_SECONDS` (default 7 days)
6. **Returns PNG** — Serves the image with proper headers

---

## Setup

### Prerequisites

- Cloudflare Workers Paid plan (required for Browser Rendering)
- `wrangler` CLI installed

### 1. Create KV Namespace

```bash
cd og-screenshot-worker
npx wrangler kv namespace create CACHE
```

Copy the returned `id` into `wrangler.toml`.

### 2. Configure the Site

Set `SITE_ORIGIN`, the route, and any optional variables in `wrangler.toml`
(see [Configuration](#configuration)).

### 3. Deploy Worker

```bash
npm install
npx wrangler deploy
```

For local development:

```bash
npx wrangler dev
```

### 4. Add DNS Record

In Cloudflare Dashboard → DNS → Add record:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| AAAA | og | 100:: | Proxied |

This routes `og.example.com` to the worker.

### 5. Update Head Component

In your Astro site, set the og:image URL:

```astro
---
const ogSlug = Astro.locals.starlightRoute?.id || slug || 'index';
const ogImage = `https://og.example.com/${ogSlug}.png`;
---

<meta property="og:image" content={ogImage} />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
```

---

## Configuration

### wrangler.toml

```toml
name = "og-screenshot"
main = "src/index.ts"
compatibility_date = "2025-01-01"
compatibility_flags = ["nodejs_compat"]

[vars]
SITE_ORIGIN = "https://example.com"
PAGE_PATH = "/{slug}/"
FALLBACK_PATH = "/og/{slug}.png"

[browser]
binding = "BROWSER"

[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"

[triggers]
crons = ["0 6 * * SUN"]

[[routes]]
pattern = "og.example.com/*"
zone_name = "example.com"
```

### Bindings

| Binding | Type | Description |
| --- | --- | --- |
| `BROWSER` | Browser | Cloudflare Browser Rendering binding |
| `CACHE` | KV Namespace | Screenshot cache storage |

### Variables

| Variable | Default | Description |
| --- | --- | --- |
| `SITE_ORIGIN` | — (required) | Site to screenshot, e.g. `https://example.com` |
| `PAGE_PATH` | `/{slug}/` | Slug → page path. `index` always maps to `/` |
| `FALLBACK_PATH` | unset | Fallback Image path, e.g. `/og/{slug}.png`. Unset returns 502 on failure |
| `SITEMAP_URL` | `SITE_ORIGIN/sitemap.xml` | Sitemap or sitemap index used by Cache Warmup |
| `VIEWPORT` | `1200x630` | Screenshot size |
| `CACHE_TTL_SECONDS` | `604800` | Screenshot lifetime across KV Cache and Edge Cache (min `60`) |
| `BROWSER_MAX_AGE_SECONDS` | `86400` | `max-age` sent to browsers and crawlers |
| `WARMUP_LIMIT` | `50` | Max renders per Cache Warmup run |

Invalid configuration is rejected on the first request (HTTP 500 plus a log
line naming the bad variable).

### Multiple Sites

Deploy one worker per site. Either copy `wrangler.toml` per site, or use
[Wrangler environments](https://developers.cloudflare.com/workers/wrangler/environments/):

```toml
[env.docs]
name = "og-screenshot-docs"
vars = { SITE_ORIGIN = "https://docs.example.com" }
kv_namespaces = [{ binding = "CACHE", id = "..." }]
browser = { binding = "BROWSER" }
triggers = { crons = ["0 6 * * SUN"] }
routes = [{ pattern = "og.docs.example.com/*", zone_name = "example.com" }]
```

```bash
npx wrangler deploy --env docs
```

KV keys are scoped by site host (`og:{host}:{slug}`), so installs can share
one KV namespace safely.

### Source Layout

| Module | Responsibility |
| --- | --- |
| `src/site-profile.ts` | Reads and validates per-install config; owns Slug ↔ URL mapping and Fallback Image URL |
| `src/screenshot-store.ts` | Edge Cache → KV Cache lookup, write-back, keys, TTLs, `X-Cache` |
| `src/render.ts` | Browser Rendering screenshot of one Slug |
| `src/warmup.ts` | Sitemap → Slugs, renders cache misses |
| `src/index.ts` | `fetch` and `scheduled` handlers wiring the modules |

---

## Usage

### URL Format

```text
https://og.example.com/{slug}.png
```

### Examples

| Page | OG Image URL |
| --- | --- |
| Homepage | `https://og.example.com/index.png` |
| About | `https://og.example.com/about.png` |
| WP Loupe | `https://og.example.com/plugins/wp-loupe.png` |
| AI Router | `https://og.example.com/ai/ai-router.png` |

### Cache Headers

- `X-Cache: HIT-EDGE` — Served from the local Cloudflare edge cache (fastest path).
- `X-Cache: HIT-KV` — Served from Workers KV after an edge miss, then written
  back to edge cache.
- `X-Cache: MISS` — Fresh screenshot generated, then written to both KV and
  edge cache.

### Testing

```bash
# Check if working
curl -I https://og.example.com/about.png

# Verify cache hit on second request
curl -I https://og.example.com/about.png | grep -i X-Cache
```

---

## Cache Warmup

The worker warms its own cache from the site's sitemap on a Cron Trigger
(`[triggers] crons` in `wrangler.toml`, weekly by default):

1. Fetches `SITEMAP_URL` (a sitemap index is followed one level deep)
2. Maps each page URL on `SITE_ORIGIN` to a Slug using `PAGE_PATH`
3. Skips Slugs already in KV; renders and stores the rest, up to `WARMUP_LIMIT`
   per run, reusing one browser session

Warmup fills the KV Cache only. The Edge Cache fills on the first request in
each colo.

Trigger it locally:

```bash
npx wrangler dev --test-scheduled
curl "http://localhost:8787/__scheduled?cron=0+6+*+*+SUN"
```

---

## Fallback Behavior

If the screenshot fails (timeout, browser error), the worker proxies the static
image at `FALLBACK_PATH` on the site (for example a Satori-generated
`/og/{slug}.png`). Fallback responses are never cached. Without
`FALLBACK_PATH`, the worker returns `502`.

---

## Contributor Notes

### Implementation Contract

The worker is easiest to maintain when these boundaries are kept explicit:

1. Slug parsing and validation
2. Cache lookup order (Edge, then KV)
3. Rendering on full miss only
4. Fallback fetch if rendering fails

If you refactor, preserve this order to avoid hidden cost increases in Browser
Rendering usage.

### Development

```bash
npm test          # vitest, in-memory KV and Edge Cache adapters
npm run typecheck
```

### Safe Refactor Checklist

- Keep `X-Cache` semantics accurate (`HIT-EDGE`, `HIT-KV`, `MISS`)
- Ensure browser instances are closed in success and failure paths
- Avoid changing cache key format without a migration strategy
- Keep site-specific values in the Site Profile, never as constants

---

## Cost Considerations

Browser Rendering is included in Workers Paid plan:

- First 1,000 browser sessions/month free
- $0.02 per additional session

With 7-day caching, typical documentation sites stay well within $5 tier.

---

## AI Contribution Attribution

Assisted-by: GitHub Copilot:GPT-5.3-Codex
