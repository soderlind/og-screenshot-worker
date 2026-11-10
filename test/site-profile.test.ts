import { describe, expect, it } from 'vitest';
import { loadSiteProfile, SiteProfileError } from '../src/site-profile';

const profile = loadSiteProfile({ SITE_ORIGIN: 'https://example.com', FALLBACK_PATH: '/og/{slug}.png' });

describe('loadSiteProfile', () => {
  it('requires SITE_ORIGIN', () => {
    expect(() => loadSiteProfile({})).toThrow(SiteProfileError);
  });

  it('rejects malformed configuration', () => {
    expect(() => loadSiteProfile({ SITE_ORIGIN: 'not a url' })).toThrow(SiteProfileError);
    expect(() => loadSiteProfile({ SITE_ORIGIN: 'https://a.com', PAGE_PATH: '/blog/' })).toThrow(SiteProfileError);
    expect(() => loadSiteProfile({ SITE_ORIGIN: 'https://a.com', VIEWPORT: 'big' })).toThrow(SiteProfileError);
    expect(() => loadSiteProfile({ SITE_ORIGIN: 'https://a.com', CACHE_TTL_SECONDS: '-1' })).toThrow(SiteProfileError);
    // Workers KV minimum expirationTtl
    expect(() => loadSiteProfile({ SITE_ORIGIN: 'https://a.com', CACHE_TTL_SECONDS: '59' })).toThrow(SiteProfileError);
    expect(loadSiteProfile({ SITE_ORIGIN: 'https://a.com', CACHE_TTL_SECONDS: '60' }).cacheTtlSeconds).toBe(60);
  });

  it('applies defaults', () => {
    expect(profile.viewport).toEqual({ width: 1200, height: 630 });
    expect(profile.cacheTtlSeconds).toBe(604800);
    expect(profile.sitemapUrl).toBe('https://example.com/sitemap.xml');
    expect(profile.host).toBe('example.com');
  });
});

describe('Slug mapping', () => {
  it.each([
    ['/plugins/wp-loupe.png', 'plugins/wp-loupe'],
    ['/about.PNG', 'about'],
    ['/', 'index'],
    ['//a//b/.png', 'a/b'],
    ['/../etc.png', null],
    ['/a%20b.png', null],
  ])('request path %s → %s', (path, slug) => {
    expect(profile.slugFromRequestPath(path)).toBe(slug);
  });

  it('maps Slug to page URL', () => {
    expect(profile.pageUrl('index')).toBe('https://example.com/');
    expect(profile.pageUrl('plugins/wp-loupe')).toBe('https://example.com/plugins/wp-loupe/');
  });

  it.each([
    ['https://example.com/', 'index'],
    ['https://example.com/about/', 'about'],
    ['https://example.com/plugins/wp-loupe', 'plugins/wp-loupe'],
    ['https://other.com/about/', null],
  ])('page URL %s → %s', (url, slug) => {
    expect(profile.slugFromPageUrl(url)).toBe(slug);
  });

  it('round-trips with a custom PAGE_PATH', () => {
    const blog = loadSiteProfile({ SITE_ORIGIN: 'https://b.dev', PAGE_PATH: '/posts/{slug}.html' });
    expect(blog.pageUrl('hello')).toBe('https://b.dev/posts/hello.html');
    expect(blog.slugFromPageUrl(blog.pageUrl('hello'))).toBe('hello');
    expect(blog.slugFromPageUrl('https://b.dev/about')).toBeNull();
    expect(blog.slugFromPageUrl('https://b.dev/posts/feed')).toBeNull();
    expect(blog.slugFromPageUrl('https://b.dev/posts/feed/')).toBeNull();
  });

  it('only builds a Fallback Image URL when configured', () => {
    expect(profile.fallbackUrl('about')).toBe('https://example.com/og/about.png');
    expect(loadSiteProfile({ SITE_ORIGIN: 'https://a.com' }).fallbackUrl('about')).toBeNull();
  });
});
