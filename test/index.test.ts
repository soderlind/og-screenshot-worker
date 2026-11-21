import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index';
import { background, memoryEdge, memoryKv } from './fakes';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function setup(pageStatus: number) {
  const kv = memoryKv();
  const pending = background();
  const quickAction = vi.fn(async () => Response.json({
    success: true,
    result: { screenshot: 'AQID', content: '<html></html>' },
    meta: { status: pageStatus, title: 'Example' },
  }));
  vi.stubGlobal('caches', { default: memoryEdge() });

  return {
    quickAction,
    kv,
    pending,
    env: {
      SITE_ORIGIN: 'https://example.com',
      FALLBACK_PATH: '/og/{slug}.png',
      BROWSER: { quickAction, fetch: vi.fn(async () => new Response(null)) },
      CACHE: kv,
    },
    ctx: { waitUntil: pending.waitUntil } as ExecutionContext,
  };
}

describe('screenshot requests', () => {
  it.each([404, 410])('returns 404 without rendering or caching when the pre-check returns %i', async (status) => {
    const fetchFn = vi.fn(async () => new Response(null, { status }));
    vi.stubGlobal('fetch', fetchFn);
    const { env, ctx, quickAction, kv } = setup(200);

    const response = await worker.fetch(new Request('https://og.example.com/about.png'), env, ctx);

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(quickAction).not.toHaveBeenCalled();
    expect(kv.data.size).toBe(0);
    expect(fetchFn).toHaveBeenCalledWith('https://example.com/about/', { method: 'HEAD', redirect: 'follow' });
  });

  it.each([404, 410])('returns 404 when the page disappears after the pre-check (%i)', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
    const { env, ctx, quickAction, kv } = setup(status);

    const response = await worker.fetch(new Request('https://og.example.com/about.png'), env, ctx);

    expect(response.status).toBe(404);
    expect(quickAction).toHaveBeenCalledOnce();
    expect(kv.data.size).toBe(0);
  });

  it('uses the fallback without caching when the browser sees a page error', async () => {
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'HEAD' ? new Response(null, { status: 200 }) : new Response('fallback'),
    );
    vi.stubGlobal('fetch', fetchFn);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env, ctx, kv } = setup(500);

    const response = await worker.fetch(new Request('https://og.example.com/about.png'), env, ctx);

    expect(await response.text()).toBe('fallback');
    expect(fetchFn).toHaveBeenLastCalledWith('https://example.com/og/about.png');
    expect(kv.data.size).toBe(0);
  });

  it('stores successful screenshots and serves the next request from cache', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchFn);
    const { env, ctx, quickAction, kv, pending } = setup(200);
    const request = new Request('https://og.example.com/about.png');

    const first = await worker.fetch(request, env, ctx);
    expect(first.headers.get('X-Cache')).toBe('MISS');
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(kv.data.size).toBe(1);
    await pending.flush();

    const second = await worker.fetch(request, env, ctx);
    expect(second.headers.get('X-Cache')).toBe('HIT-EDGE');
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(quickAction).toHaveBeenCalledOnce();
  });
});
