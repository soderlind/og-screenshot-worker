/** Thrown when the live page for a Slug is gone (404/410); never worth rendering or falling back. */
export class PageNotFoundError extends Error {}

const GONE = new Set([404, 410]);

export function isGone(status: number): boolean {
  return GONE.has(status);
}

/**
 * Cheap pre-check before spending a browser session: false only when the site says the page
 * is gone. Network errors and other statuses return true and are left to the renderer.
 */
export async function pageExists(url: string, fetchFn: (url: string, init: RequestInit) => Promise<Response>): Promise<boolean> {
  try {
    let res = await fetchFn(url, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405 || res.status === 501) {
      res = await fetchFn(url, { method: 'GET', redirect: 'follow' });
      await res.body?.cancel();
    }
    return !isGone(res.status);
  } catch {
    return true;
  }
}
