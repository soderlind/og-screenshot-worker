import { describe, expect, it, vi } from 'vitest';
import { loadSiteProfile } from '../src/site-profile';
import { createScreenshotStore } from '../src/screenshot-store';
import { collectSlugs, warmCache } from '../src/warmup';
import { background, memoryKv } from './fakes';

const profile = loadSiteProfile({ SITE_ORIGIN: 'https://example.com', WARMUP_LIMIT: '2' });

const xml = (tag: string, locs: string[]) =>
  `<?xml version="1.0"?><${tag}>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</${tag}>`;

function fakeFetch(pages: Record<string, string>) {
  return async (url: string) => (url in pages ? new Response(pages[url]) : new Response('', { status: 404 }));
}

describe('collectSlugs', () => {
  it('follows a sitemap index and maps URLs to Slugs', async () => {
    const slugs = await collectSlugs(
      profile,
      fakeFetch({
        'https://example.com/sitemap.xml': xml('sitemapindex', ['https://example.com/sitemap-0.xml', 'https://example.com/sitemap-1.xml']),
        'https://example.com/sitemap-0.xml': xml('urlset', ['https://example.com/', 'https://example.com/about/']),
        'https://example.com/sitemap-1.xml': xml('urlset', ['https://example.com/plugins/wp-loupe/', 'https://elsewhere.com/x/', 'https://example.com/about/']),
      }),
    );
    expect(slugs).toEqual(['index', 'about', 'plugins/wp-loupe']);
  });

  it('accepts a plain urlset', async () => {
    const slugs = await collectSlugs(profile, fakeFetch({ 'https://example.com/sitemap.xml': xml('urlset', ['https://example.com/a/']) }));
    expect(slugs).toEqual(['a']);
  });

  it('reads CDATA-wrapped locations', async () => {
    const slugs = await collectSlugs(
      profile,
      fakeFetch({
        'https://example.com/sitemap.xml':
          '<sitemapindex><sitemap><loc><![CDATA[https://example.com/s.xml]]></loc></sitemap></sitemapindex>',
        'https://example.com/s.xml': '<urlset><url><loc> <![CDATA[ https://example.com/a/?x=1&y=2 ]]> </loc></url></urlset>',
      }),
    );
    expect(slugs).toEqual(['a']);
  });

  it('fails loudly when the sitemap is missing', async () => {
    await expect(collectSlugs(profile, fakeFetch({}))).rejects.toThrow(/404/);
  });
});

describe('warmCache', () => {
  it('renders only misses, up to the limit', async () => {
    const store = createScreenshotStore({ profile, kv: memoryKv(), waitUntil: background().waitUntil });
    await store.save('a', new Uint8Array([1]));
    const render = vi.fn(async () => new Uint8Array([2]));

    const result = await warmCache(profile, store, ['a', 'b', 'c', 'd'], render);
    expect(result).toEqual({ rendered: ['b', 'c'], skipped: 1, failed: [] });
    expect(render).toHaveBeenCalledTimes(2);
    expect(await store.has('d')).toBe(false);
  });

  it('records failures and keeps going', async () => {
    const store = createScreenshotStore({ profile, kv: memoryKv(), waitUntil: background().waitUntil });
    const render = vi.fn(async (slug: string) => {
      if (slug === 'a') throw new Error('boom');
      return new Uint8Array([1]);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await warmCache(profile, store, ['a', 'b'], render);
    expect(result).toEqual({ rendered: ['b'], skipped: 0, failed: ['a'] });
  });
});
