import { describe, expect, it, vi } from 'vitest';
import { PageNotFoundError } from '../src/page-check';
import { renderQuickAction, renderScreenshot, type Browser } from '../src/render';
import { loadSiteProfile } from '../src/site-profile';

const profile = loadSiteProfile({ SITE_ORIGIN: 'https://example.com', VIEWPORT: '800x400' });

function snapshot(status: number) {
  return Response.json({
    success: true,
    result: { screenshot: 'AQID', content: '<html></html>' },
    meta: { status, title: 'Example' },
  });
}

describe('renderQuickAction', () => {
  it('renders the configured page and returns the PNG bytes', async () => {
    const quickAction = vi.fn(async () => snapshot(200));

    expect(await renderQuickAction({ quickAction }, profile, 'about')).toEqual(new Uint8Array([1, 2, 3]));
    expect(quickAction).toHaveBeenCalledWith('snapshot', {
      url: 'https://example.com/about/',
      viewport: { width: 800, height: 400 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      formats: ['content', 'screenshot'],
      gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
      waitForTimeout: 500,
      cacheTTL: 0,
    });
  });

  it.each([404, 410])('rejects a page that returned %i', async (status) => {
    const quickAction = vi.fn(async () => snapshot(status));

    await expect(renderQuickAction({ quickAction }, profile, 'about')).rejects.toBeInstanceOf(PageNotFoundError);
  });

  it('rejects other page errors instead of caching an error screenshot', async () => {
    const quickAction = vi.fn(async () => snapshot(500));

    await expect(renderQuickAction({ quickAction }, profile, 'about')).rejects.toThrow('Page returned 500');
  });

  it('rejects unsuccessful Quick Action responses', async () => {
    const quickAction = vi.fn(async () => new Response('unavailable', { status: 503 }));

    await expect(renderQuickAction({ quickAction }, profile, 'about')).rejects.toThrow(
      'Browser Run snapshot failed with status 503',
    );
  });

  it('rejects malformed snapshot responses', async () => {
    const quickAction = vi.fn(async () => Response.json({ success: true, result: {}, meta: { status: 200 } }));

    await expect(renderQuickAction({ quickAction }, profile, 'about')).rejects.toThrow('Invalid Browser Run snapshot');
  });
});

describe('renderScreenshot', () => {
  it.each([404, 410, 500])('does not capture a page that returned %i', async (status) => {
    const page = {
      setViewport: vi.fn(),
      setUserAgent: vi.fn(),
      goto: vi.fn(async () => ({ status: () => status })),
      screenshot: vi.fn(),
      close: vi.fn(),
    };
    const browser: Pick<Browser, 'newPage'> = { newPage: vi.fn().mockResolvedValue(page) };

    await expect(renderScreenshot(browser, profile, 'about')).rejects.toThrow();
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalledOnce();
  });
});
