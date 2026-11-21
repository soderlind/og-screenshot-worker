import puppeteer from '@cloudflare/puppeteer';
import type { SiteProfile } from './site-profile';

export type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;

const SCREENSHOT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

/** Renders one Slug as a PNG in an already-open browser. */
export async function renderScreenshot(browser: Browser, profile: SiteProfile, slug: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setViewport(profile.viewport);
    await page.setUserAgent(SCREENSHOT_USER_AGENT);
    await page.goto(profile.pageUrl(slug), { waitUntil: 'networkidle0', timeout: 15000 });
    // Let animations settle.
    await new Promise((r) => setTimeout(r, 500));
    return await page.screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

export async function renderQuickAction(
  binding: Pick<BrowserRun, 'quickAction'>,
  profile: SiteProfile,
  slug: string,
): Promise<Uint8Array> {
  const response = await binding.quickAction('screenshot', {
    url: profile.pageUrl(slug),
    viewport: profile.viewport,
    userAgent: SCREENSHOT_USER_AGENT,
    gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
    waitForTimeout: 500,
    cacheTTL: 0,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Browser Run screenshot failed with status ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
