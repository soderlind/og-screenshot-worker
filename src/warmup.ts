import type { SiteProfile } from './site-profile';
import type { ScreenshotStore } from './screenshot-store';

type FetchLike = (url: string) => Promise<Response>;

const MAX_CHILD_SITEMAPS = 50;

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*(?:<!\[CDATA\[\s*([\s\S]*?)\s*\]\]>|([^<]+?))\s*<\/loc>/g)].map((m) =>
    // CDATA content is literal; plain text needs entity decoding.
    m[1] !== undefined ? m[1] : m[2].replace(/&amp;/g, '&'),
  );
}

/** Reads the site's sitemap (or sitemap index, one level deep) and returns its Slugs. */
export async function collectSlugs(profile: SiteProfile, fetchFn: FetchLike): Promise<string[]> {
  const fetchXml = async (url: string) => {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Sitemap fetch failed: ${res.status} ${url}`);
    return res.text();
  };

  const root = await fetchXml(profile.sitemapUrl);
  let pageUrls: string[];
  if (/<sitemapindex[\s>]/.test(root)) {
    pageUrls = [];
    for (const child of extractLocs(root).slice(0, MAX_CHILD_SITEMAPS)) {
      pageUrls.push(...extractLocs(await fetchXml(child)));
    }
  } else {
    pageUrls = extractLocs(root);
  }

  const slugs = new Set<string>();
  for (const url of pageUrls) {
    const slug = profile.slugFromPageUrl(url);
    if (slug) slugs.add(slug);
  }
  return [...slugs];
}

export interface WarmupResult {
  rendered: string[];
  skipped: number;
  failed: string[];
}

/**
 * Renders and stores every Slug missing from the KV Cache, up to `profile.warmupLimit` renders per run.
 * `render` is only invoked for misses, so callers can open a browser lazily.
 */
export async function warmCache(
  profile: SiteProfile,
  store: ScreenshotStore,
  slugs: string[],
  render: (slug: string) => Promise<Uint8Array>,
): Promise<WarmupResult> {
  const result: WarmupResult = { rendered: [], skipped: 0, failed: [] };
  for (const slug of slugs) {
    if (result.rendered.length + result.failed.length >= profile.warmupLimit) break;
    if (await store.has(slug)) {
      result.skipped++;
      continue;
    }
    try {
      await store.save(slug, await render(slug));
      result.rendered.push(slug);
    } catch (error) {
      console.error(`Warmup failed for ${slug}:`, error);
      result.failed.push(slug);
    }
  }
  return result;
}
