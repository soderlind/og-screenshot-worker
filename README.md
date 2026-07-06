
# OG Screenshot Worker

Generate dynamic Open Graph images using Cloudflare Browser Rendering.

This Cloudflare Worker takes live screenshots of pages on [soderlind.no](https://soderlind.no) and serves them as OG images for social media previews.

[How It Works](#how-it-works) · [Setup](#setup) · [Configuration](#configuration) · [Usage](#usage) · [Cache Warmup](#cache-warmup)

---



## How It Works

When someone shares a link to `soderlind.no/plugins/wp-loupe/`, social platforms fetch `https://og.soderlind.no/plugins/wp-loupe.png`. The worker:

1. **Checks KV cache** — Returns cached screenshot if available
2. **Launches headless browser** — Uses Cloudflare Browser Rendering
3. **Takes screenshot** — Captures the page at 1200×630 pixels (OG standard)
4. **Caches result** — Stores in KV for 7 days
5. **Returns PNG** — Serves the image with proper headers

```
Request: https://og.soderlind.no/plugins/wp-loupe.png
         ↓
Worker extracts slug: "plugins/wp-loupe"
         ↓
Navigates to: https://soderlind.no/plugins/wp-loupe/
         ↓
Takes screenshot → Caches → Returns PNG
```

---

## Setup

### Prerequisites

- Cloudflare Workers Paid plan (required for Browser Rendering)
- `wrangler` CLI installed

### 1. Create KV Namespace

```bash
cd workers/og-screenshot
npx wrangler kv namespace create CACHE
```

Copy the returned `id` into `wrangler.toml`.

### 2. Deploy Worker

```bash
npm install
npx wrangler deploy
```

### 3. Add DNS Record

In Cloudflare Dashboard → DNS → Add record:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| AAAA | og | 100:: | Proxied |

This routes `og.soderlind.no` to the worker.

### 4. Update Head Component

In your Astro site, set the og:image URL:

```astro
---
const ogSlug = Astro.locals.starlightRoute?.id || slug || 'index';
const ogImage = `https://og.soderlind.no/${ogSlug}.png`;
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
pattern = "og.soderlind.no/*"
zone_name = "soderlind.no"
```

### Environment Variables

| Binding | Type | Description |
|---------|------|-------------|
| `BROWSER` | Browser | Cloudflare Browser Rendering binding |
| `CACHE` | KV Namespace | Screenshot cache storage |

---

## Usage

### URL Format

```
https://og.soderlind.no/{slug}.png
```

### Examples

| Page | OG Image URL |
|------|--------------|
| Homepage | `https://og.soderlind.no/index.png` |
| About | `https://og.soderlind.no/about.png` |
| WP Loupe | `https://og.soderlind.no/plugins/wp-loupe.png` |
| AI Router | `https://og.soderlind.no/ai/ai-router.png` |

### Cache Headers

- `X-Cache: HIT` — Served from KV cache
- `X-Cache: MISS` — Fresh screenshot generated

### Testing

```bash
# Check if working
curl -I https://og.soderlind.no/about.png

# Verify cache hit on second request
curl -I https://og.soderlind.no/about.png | grep X-Cache
```

---

## Cache Warmup

A GitHub Action runs weekly to warm the OG image cache, ensuring fast social media previews.

### Automatic Warmup

The workflow runs every Sunday at 06:00 UTC:

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
          curl -s https://soderlind.no/sitemap.xml | \
            sed -n 's/.*<loc>https:\/\/soderlind\.no\/\([^<]*\)<\/loc>.*/\1/p' | \
            sed 's/\/$//' | \
            while read slug; do
              [ -z "$slug" ] && slug="index"
              curl -s -o /dev/null "https://og.soderlind.no/${slug}.png"
            done
```

### Manual Warmup

Trigger the workflow manually from GitHub Actions, or run locally:

```bash
cat sitemap.xml | \
  sed -n 's/.*<loc>https:\/\/soderlind\.no\/\([^<]*\)<\/loc>.*/\1/p' | \
  sed 's/\/$//' | \
  while read slug; do
    [ -z "$slug" ] && slug="index"
    curl -s -o /dev/null -w "%{http_code} ${slug}\n" "https://og.soderlind.no/${slug}.png"
  done
```

---

## Fallback Behavior

If screenshot fails (timeout, browser error), the worker falls back to the static Satori-generated OG image at `/og/{slug}.png`.

---

## Cost Considerations

Browser Rendering is included in Workers Paid plan:
- First 1,000 browser sessions/month free
- $0.02 per additional session

With 7-day caching, typical documentation sites stay well within $5 tier.

## Source code

Source code is available at https://github.com/soderlind/og-screenshot-worker


