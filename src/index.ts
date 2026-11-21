interface Env {
  BROWSER: BrowserRun;
  CACHE: KVNamespace;
}

const SITE = 'https://soderlind.no';
const WIDTH = 1200;
const HEIGHT = 630;
const CACHE_TTL = 60 * 60 * 24 * 7; // 7 days
const IMAGE_HEADERS = {
  'Content-Type': 'image/png',
  'Cache-Control': 'public, max-age=86400',
  'Access-Control-Allow-Origin': '*',
};

function parseSlug(pathname: string): string | null {
  const withoutExt = pathname.replace(/\.png$/i, '');
  const trimmed = withoutExt.replace(/^\/+/g, '').replace(/\/+$/g, '');
  const normalized = trimmed.replace(/\/+/g, '/');
  const slug = normalized || 'index';

  // Allow letters, numbers, underscore, dash and path separators only.
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(slug)) {
    return null;
  }

  return slug;
}

function withCacheHeader(response: Response, cacheState: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Cache', cacheState);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function imageResponse(body: BodyInit, cacheState: string): Response {
  return new Response(body, {
    headers: { ...IMAGE_HEADERS, 'X-Cache': cacheState },
  });
}

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

    const slug = parseSlug(url.pathname);
    if (!slug) {
      return new Response('Invalid slug. Expected /path/to/page.png', {
        status: 400,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const cacheKey = `og:${slug}`;

    // 1. Edge cache (Cloudflare Cache API) — fastest, colo-local, no KV read.
    const cache = caches.default;
    const cacheRequest = new Request(url.toString(), { method: 'GET' });
    const edgeHit = await cache.match(cacheRequest);
    if (edgeHit) {
      return withCacheHeader(edgeHit, 'HIT-EDGE');
    }

    // 2. Workers KV — durable, cross-colo store.
    const cached = await env.CACHE.get(cacheKey, 'arrayBuffer');
    if (cached) {
      const response = imageResponse(cached, 'HIT-KV');
      // Warm the edge cache for subsequent requests in this colo.
      ctx.waitUntil(cache.put(cacheRequest, response.clone()));
      return response;
    }

    try {
      // Navigate to the actual page
      const targetUrl = new URL(slug === 'index' ? '/' : `/${slug}/`, SITE).toString();
      const screenshotResponse = await env.BROWSER.quickAction('screenshot', {
        url: targetUrl,
        viewport: { width: WIDTH, height: HEIGHT },
        gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
        waitForTimeout: 500,
      });

      if (!screenshotResponse.ok) {
        await screenshotResponse.body?.cancel();
        throw new Error(`Browser Run screenshot failed with status ${screenshotResponse.status}`);
      }

      const screenshot = await screenshotResponse.arrayBuffer();
      const response = imageResponse(screenshot, 'MISS');

      // 3. Populate both caches without blocking the response.
      ctx.waitUntil(env.CACHE.put(cacheKey, screenshot, { expirationTtl: CACHE_TTL }));
      ctx.waitUntil(cache.put(cacheRequest, response.clone()));

      return response;
    } catch (error) {
      console.error('Screenshot failed:', error);
      // Fallback to existing SVG-based OG image (never cached at the edge)
      const fallbackUrl = new URL(`/og/${slug}.png`, SITE).toString();
      return fetch(fallbackUrl);
    }
  },
};
