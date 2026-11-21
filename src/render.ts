import puppeteer from '@cloudflare/puppeteer';
import type { SiteProfile } from './site-profile';

export type Browser = Awaited<ReturnType<typeof puppeteer.launch>>;

/** Renders one Slug as a PNG in an already-open browser. */
export async function renderScreenshot(browser: Browser, profile: SiteProfile, slug: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setViewport(profile.viewport);
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
    gotoOptions: { waitUntil: 'networkidle0', timeout: 15000 },
    waitForTimeout: 500,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Browser Run screenshot failed with status ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
