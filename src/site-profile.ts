/**
 * Site Profile: everything one install knows about the site it screenshots.
 * Built once from per-install configuration (wrangler `[vars]`), validated up front.
 */
export interface SiteEnv {
  SITE_ORIGIN?: string;
  PAGE_PATH?: string;
  FALLBACK_PATH?: string;
  SITEMAP_URL?: string;
  VIEWPORT?: string;
  CACHE_TTL_SECONDS?: string;
  BROWSER_MAX_AGE_SECONDS?: string;
  WARMUP_LIMIT?: string;
}

export interface SiteProfile {
  origin: string;
  /** Hostname of the site; scopes KV keys so installs can share a namespace. */
  host: string;
  viewport: { width: number; height: number };
  cacheTtlSeconds: number;
  browserMaxAgeSeconds: number;
  sitemapUrl: string;
  warmupLimit: number;
  /** `/plugins/wp-loupe.png` → `plugins/wp-loupe`; null when invalid. */
  slugFromRequestPath(pathname: string): string | null;
  /** Slug → live page URL on the site. */
  pageUrl(slug: string): string;
  /** Live page URL on the site → Slug; null when it isn't a page of this site. */
  slugFromPageUrl(url: string): string | null;
  /** Fallback Image URL, or null when the install has no fallback. */
  fallbackUrl(slug: string): string | null;
}

export class SiteProfileError extends Error {}

const SLUG_TOKEN = '{slug}';
const SLUG_PATTERN = /^[a-z0-9][a-z0-9/_-]*$/i;

function normalizeSlug(raw: string): string | null {
  const trimmed = raw.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/');
  const slug = trimmed || 'index';
  return SLUG_PATTERN.test(slug) ? slug : null;
}

function parseTemplate(name: string, value: string): { prefix: string; suffix: string } {
  const parts = value.split(SLUG_TOKEN);
  if (parts.length !== 2 || !value.startsWith('/')) {
    throw new SiteProfileError(`${name} must start with "/" and contain ${SLUG_TOKEN} exactly once`);
  }
  return { prefix: parts[0], suffix: parts[1] };
}

function parsePositiveInt(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new SiteProfileError(`${name} must be a positive integer, got "${value}"`);
  }
  return n;
}

function parseViewport(value: string | undefined): { width: number; height: number } {
  if (value === undefined || value === '') return { width: 1200, height: 630 };
  const match = /^(\d+)x(\d+)$/.exec(value);
  if (!match) throw new SiteProfileError(`VIEWPORT must look like 1200x630, got "${value}"`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

export function loadSiteProfile(env: SiteEnv): SiteProfile {
  if (!env.SITE_ORIGIN) {
    throw new SiteProfileError('SITE_ORIGIN is required (for example "https://example.com")');
  }
  let originUrl: URL;
  try {
    originUrl = new URL(env.SITE_ORIGIN);
  } catch {
    throw new SiteProfileError(`SITE_ORIGIN is not a valid URL: "${env.SITE_ORIGIN}"`);
  }
  if (originUrl.protocol !== 'https:' && originUrl.protocol !== 'http:') {
    throw new SiteProfileError('SITE_ORIGIN must be an http(s) URL');
  }
  const origin = originUrl.origin;

  const page = parseTemplate('PAGE_PATH', env.PAGE_PATH || '/{slug}/');
  const fallback = env.FALLBACK_PATH ? parseTemplate('FALLBACK_PATH', env.FALLBACK_PATH) : null;
  const sitemapUrl = new URL(env.SITEMAP_URL || '/sitemap.xml', origin).toString();

  return {
    origin,
    host: originUrl.host,
    viewport: parseViewport(env.VIEWPORT),
    cacheTtlSeconds: parsePositiveInt('CACHE_TTL_SECONDS', env.CACHE_TTL_SECONDS, 60 * 60 * 24 * 7),
    browserMaxAgeSeconds: parsePositiveInt('BROWSER_MAX_AGE_SECONDS', env.BROWSER_MAX_AGE_SECONDS, 60 * 60 * 24),
    sitemapUrl,
    warmupLimit: parsePositiveInt('WARMUP_LIMIT', env.WARMUP_LIMIT, 50),

    slugFromRequestPath(pathname) {
      return normalizeSlug(pathname.replace(/\.png$/i, ''));
    },

    pageUrl(slug) {
      const path = slug === 'index' ? '/' : `${page.prefix}${slug}${page.suffix}`;
      return new URL(path, origin).toString();
    },

    slugFromPageUrl(url) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return null;
      }
      if (parsed.origin !== origin) return null;
      let path = parsed.pathname;
      if (path === '/' || path === '') return 'index';
      if (!path.startsWith(page.prefix)) return null;
      path = path.slice(page.prefix.length);
      if (page.suffix && path.endsWith(page.suffix)) {
        path = path.slice(0, -page.suffix.length);
      }
      return normalizeSlug(path);
    },

    fallbackUrl(slug) {
      if (!fallback) return null;
      return new URL(`${fallback.prefix}${slug}${fallback.suffix}`, origin).toString();
    },
  };
}
