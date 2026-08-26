
# OG Screenshot Worker

Generate dynamic Open Graph images using Cloudflare Browser Rendering.

This Cloudflare Worker takes live screenshots of pages on
[example.com](https://example.com) and serves them as OG images for social
media previews.

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
4. **Takes screenshot** — Captures the page at 1200×630 pixels (OG standard)
5. **Populates both caches** — Stores in KV for 7 days and in the edge cache
  (non-blocking, via `waitUntil`)
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

### 2. Deploy Worker

```bash
npm install
npx wrangler deploy
```

For local development:

```bash
npx wrangler dev
```

### 3. Add DNS Record

In Cloudflare Dashboard → DNS → Add record:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| AAAA | og | 100:: | Proxied |

This routes `og.example.com` to the worker.

### 4. Update Head Component

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

[browser]
binding = "BROWSER"

[[kv_namespaces]]
binding = "CACHE"
id = "your-kv-namespace-id"

[[routes]]
pattern = "og.example.com/*"
zone_name = "example.com"
```

### `src/index.ts`

`src/index.ts` contains the worker code that handles requests, checks caches,
and generates screenshots. It uses the Cloudflare Browser Rendering API to take
screenshots of pages and serves them as PNG images.

Source code is available at [GitHub](https://github.com/soderlind/og-screenshot-worker/blob/main/src/index.ts).

### Environment Variables

| Binding | Type | Description |
| --- | --- | --- |
| `BROWSER` | Browser | Cloudflare Browser Rendering binding |
| `CACHE` | KV Namespace | Screenshot cache storage |

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

A GitHub Action runs weekly to warm the OG image cache, ensuring fast social
media previews.

### Automatic Warmup

The workflow runs every Sunday at 06:00 UTC:

<!-- markdownlint-disable MD013 -->

```yaml
# .github/workflows/warm-og-cache.yml
name: Warm OG Image Cache

on:
  schedule:
    - cron: '0 6 * * 0'   # Weekly on Sunday at 06:00 UTC
  workflow_dispatch:

jobs:
  warm-cache:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch sitemap and warm OG cache
        run: |
          curl -s https://example.com/sitemap.xml | \
            sed -n 's/.*<loc>https:\/\/example\.com\/\([^<]*\)<\/loc>.*/\1/p' | \
            sed 's/\/$//' | \
            while read slug; do
              [ -z "$slug" ] && slug="index"
              curl -s -o /dev/null \
                "https://og.example.com/${slug}.png"
            done
```

<!-- markdownlint-enable MD013 -->

### Manual Warmup

Trigger the workflow manually from GitHub Actions, or run locally:

```bash
cat sitemap.xml | \
  sed -n 's/.*<loc>https:\/\/example\.com\/\([^<]*\)<\/loc>.*/\1/p' | \
  sed 's/\/$//' | \
  while read slug; do
    [ -z "$slug" ] && slug="index"
    curl -s -o /dev/null -w "%{http_code} ${slug}\n" \
      "https://og.example.com/${slug}.png"
  done
```

---

## Fallback Behavior

If screenshot fails (timeout, browser error), the worker falls back to the
static Satori-generated OG image at `/og/{slug}.png`.

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

### Safe Refactor Checklist

- Keep `X-Cache` semantics accurate (`HIT-EDGE`, `HIT-KV`, `MISS`)
- Ensure browser instances are closed in success and failure paths
- Avoid changing cache key format without a migration strategy
- Validate slug parsing before constructing target URLs

---

## Cost Considerations

Browser Rendering is included in Workers Paid plan:

- First 1,000 browser sessions/month free
- $0.02 per additional session

With 7-day caching, typical documentation sites stay well within $5 tier.

---

## AI Contribution Attribution

Assisted-by: GitHub Copilot:GPT-5.3-Codex
