import { loadSiteProfile, SiteProfileError, type SiteEnv, type SiteProfile } from './site-profile';
import { createScreenshotStore } from './screenshot-store';
import { renderScreenshot, withBrowser, type Browser } from './render';
import { collectSlugs, warmCache } from './warmup';
import { pageExists, PageNotFoundError } from './page-check';
import puppeteer from '@cloudflare/puppeteer';

interface Env extends SiteEnv {
  BROWSER: Fetcher;
  CACHE: KVNamespace;
}

const CORS = { 'Access-Control-Allow-Origin': '*' };

function textResponse(body: string, status: number, extra: HeadersInit = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS, ...extra } });
}

// Short-lived so a page published later gets its image soon.
const notFound = () => textResponse('Page not found', 404, { 'Cache-Control': 'public, max-age=300' });

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext, profile: SiteProfile): Promise<Response> {
  const url = new URL(request.url);
  const slug = profile.slugFromRequestPath(url.pathname);
  if (!slug) {
    return textResponse('Invalid slug. Expected /path/to/page.png', 400);
  }

  const store = createScreenshotStore({
    profile,
    kv: env.CACHE,
    edge: caches.default,
    waitUntil: (p) => ctx.waitUntil(p),
  });

  const hit = await store.lookup(slug, url.origin);
  if (hit) return hit;

  if (!(await pageExists(profile.pageUrl(slug), (u, init) => fetch(u, init)))) {
    return notFound();
  }

  try {
    const png = await withBrowser(env.BROWSER, (browser) => renderScreenshot(browser, profile, slug));
    return await store.save(slug, png, url.origin);
  } catch (error) {
    if (error instanceof PageNotFoundError) return notFound();
    console.error('Screenshot failed:', error);
    // Fallback Image is never cached.
    const fallbackUrl = profile.fallbackUrl(slug);
    return fallbackUrl ? fetch(fallbackUrl) : textResponse('Screenshot failed', 502);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET' } });
    }

    let profile: SiteProfile;
    try {
      profile = loadSiteProfile(env);
    } catch (error) {
      if (error instanceof SiteProfileError) {
        console.error('Invalid site configuration:', error.message);
        return textResponse('Worker is misconfigured', 500);
      }
      throw error;
    }

    return handleRequest(request, env, ctx, profile);
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const profile = loadSiteProfile(env);
    const store = createScreenshotStore({ profile, kv: env.CACHE, waitUntil: (p) => ctx.waitUntil(p) });
    const slugs = await collectSlugs(profile, (u) => fetch(u));

    // Launch the browser only if something is actually missing.
    let browser: Browser | null = null;
    try {
      const result = await warmCache(profile, store, slugs, async (slug) => {
        browser ??= await puppeteer.launch(env.BROWSER);
        return renderScreenshot(browser, profile, slug);
      });
      console.log(
        `Cache Warmup for ${profile.host}: ${slugs.length} slugs, ${result.rendered.length} rendered, ` +
          `${result.skipped} already cached, ${result.failed.length} failed`,
      );
    } finally {
      if (browser) await (browser as Browser).close();
    }
  },
};
