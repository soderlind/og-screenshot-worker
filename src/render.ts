import puppeteer from '@cloudflare/puppeteer';
import type { SiteProfile } from './site-profile';
import { checkPageStatus } from './page-check';

export type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;

const SCREENSHOT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

/** Renders one Slug as a PNG in an already-open browser. */
export async function renderScreenshot(browser: Pick<Browser, 'newPage'>, profile: SiteProfile, slug: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setViewport(profile.viewport);
    await page.setUserAgent(SCREENSHOT_USER_AGENT);
    const url = profile.pageUrl(slug);
    const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    if (response) checkPageStatus(response.status(), url);
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
  const url = profile.pageUrl(slug);
  const response = await binding.quickAction('snapshot', {
    url,
    viewport: profile.viewport,
    userAgent: SCREENSHOT_USER_AGENT,
    formats: ['content', 'screenshot'],
    gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
    waitForTimeout: 500,
    cacheTTL: 0,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Browser Run snapshot failed with status ${response.status}`);
  }

  const snapshot = await response.json<Partial<BrowserRunSnapshotSuccessResponse> | null>();
  if (snapshot?.success !== true || typeof snapshot.meta?.status !== 'number') {
    throw new Error('Invalid Browser Run snapshot response');
  }
  checkPageStatus(snapshot.meta.status, url);
  if (typeof snapshot.result?.screenshot !== 'string' || !snapshot.result.screenshot) {
    throw new Error('Invalid Browser Run snapshot response');
  }
  return Uint8Array.from(atob(snapshot.result.screenshot), (byte) => byte.charCodeAt(0));
}
