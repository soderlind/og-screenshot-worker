export class PageNotFoundError extends Error {}

function isGone(status: number): boolean {
  return status === 404 || status === 410;
}

export function checkPageStatus(status: number, url: string): void {
  if (isGone(status)) throw new PageNotFoundError(url);
  if (status >= 400) throw new Error(`Page returned ${status}: ${url}`);
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch (error) {
    console.warn('Failed to cancel page check response:', error);
  }
}

export async function pageExists(url: string, fetchFn: (url: string, init: RequestInit) => Promise<Response>): Promise<boolean> {
  let response: Response;
  try {
    response = await fetchFn(url, { method: 'HEAD', redirect: 'follow' });
    if (response.status === 405 || response.status === 501) {
      await cancelBody(response);
      response = await fetchFn(url, { method: 'GET', redirect: 'follow' });
    }
  } catch (error) {
    console.warn('Page check failed:', error);
    return true;
  }

  await cancelBody(response);
  return !isGone(response.status);
}
