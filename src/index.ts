import puppeteer from '@cloudflare/puppeteer';

interface Env {
  BROWSER: Fetcher;
  CACHE: KVNamespace;
}

const SITE = 'https://soderlind.no';
const WIDTH = 1200;
const HEIGHT = 630;
const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
        },
      });
    }

    // Extract slug from path, removing leading slash and .png extension
    const slug = url.pathname.replace(/^\/|\.png$/g, '') || 'index';
    const cacheKey = `og:${slug}`;

    // 1. Edge cache (Cloudflare Cache API) — fastest, colo-local, no KV read.
    const cache = caches.default;
    const cacheRequest = new Request(url.toString(), { method: 'GET' });
    const edgeHit = await cache.match(cacheRequest);
    if (edgeHit) {
      return edgeHit;
    }

    const cacheHeaders = {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    };

    // 2. Workers KV — durable, cross-colo store.
    const cached = await env.CACHE.get(cacheKey, 'arrayBuffer');
    if (cached) {
      const response = new Response(cached, {
        headers: { ...cacheHeaders, 'X-Cache': 'HIT' },
      });
      // Warm the edge cache for subsequent requests in this colo.
      ctx.waitUntil(cache.put(cacheRequest, response.clone()));
      return response;
    }

    try {
      const browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      await page.setViewport({ width: WIDTH, height: HEIGHT });

      // Navigate to the actual page
      const targetUrl = slug === 'index' ? SITE : `${SITE}/${slug}/`;
      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 15000 });

      // Wait a bit for any animations to settle
      await new Promise((r) => setTimeout(r, 500));

      const screenshot = await page.screenshot({ type: 'png' });
      await browser.close();

      const response = new Response(screenshot, {
        headers: { ...cacheHeaders, 'X-Cache': 'MISS' },
      });

      // 3. Populate both caches without blocking the response.
      ctx.waitUntil(env.CACHE.put(cacheKey, screenshot, { expirationTtl: CACHE_TTL }));
      ctx.waitUntil(cache.put(cacheRequest, response.clone()));

      return response;
    } catch (error) {
      console.error('Screenshot failed:', error);
      // Fallback to existing SVG-based OG image (never cached at the edge)
      const fallbackUrl = `${SITE}/og/${slug}.png`;
      return fetch(fallbackUrl);
    }
  },
};
