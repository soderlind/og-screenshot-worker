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
  async fetch(request: Request, env: Env): Promise<Response> {
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

    // Check cache first
    const cached = await env.CACHE.get(cacheKey, 'arrayBuffer');
    if (cached) {
      return new Response(cached, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'HIT',
        },
      });
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

      // Store in cache
      await env.CACHE.put(cacheKey, screenshot, { expirationTtl: CACHE_TTL });

      return new Response(screenshot, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
          'X-Cache': 'MISS',
        },
      });
    } catch (error) {
      console.error('Screenshot failed:', error);
      // Fallback to existing SVG-based OG image
      const fallbackUrl = `${SITE}/og/${slug}.png`;
      return fetch(fallbackUrl);
    }
  },
};
