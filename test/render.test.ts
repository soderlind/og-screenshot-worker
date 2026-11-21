import { describe, expect, it, vi } from 'vitest';
import { renderQuickAction } from '../src/render';
import { loadSiteProfile } from '../src/site-profile';

describe('renderQuickAction', () => {
  const profile = loadSiteProfile({ SITE_ORIGIN: 'https://example.com', VIEWPORT: '800x400' });

  it('renders the configured page and returns the PNG bytes', async () => {
    const quickAction = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));

    expect(await renderQuickAction({ quickAction }, profile, 'about')).toEqual(new Uint8Array([1, 2, 3]));
    expect(quickAction).toHaveBeenCalledWith('screenshot', {
      url: 'https://example.com/about/',
      viewport: { width: 800, height: 400 },
      gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
      waitForTimeout: 500,
    });
  });

  it('rejects unsuccessful responses instead of caching an error body', async () => {
    const quickAction = vi.fn(async () => new Response('unavailable', { status: 503 }));

    await expect(renderQuickAction({ quickAction }, profile, 'about')).rejects.toThrow(
      'Browser Run screenshot failed with status 503',
    );
  });
});
