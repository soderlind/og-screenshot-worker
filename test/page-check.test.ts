import { afterEach, describe, expect, it, vi } from 'vitest';
import { pageExists } from '../src/page-check';

afterEach(() => vi.restoreAllMocks());

describe('pageExists', () => {
  it.each([
    [200, true],
    [500, true],
    [404, false],
    [410, false],
  ])('checks HEAD status %i', async (status, expected) => {
    const fetchFn = vi.fn(async () => new Response(null, { status }));

    expect(await pageExists('https://example.com/about/', fetchFn)).toBe(expected);
    expect(fetchFn).toHaveBeenCalledWith('https://example.com/about/', { method: 'HEAD', redirect: 'follow' });
  });

  it.each([405, 501])('retries with GET after HEAD returns %i and cancels the body', async (status) => {
    const getResponse = new Response('gone', { status: 410 });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(getResponse);

    expect(await pageExists('https://example.com/about/', fetchFn)).toBe(false);
    expect(fetchFn.mock.calls.map((call) => call[1])).toEqual([
      { method: 'HEAD', redirect: 'follow' },
      { method: 'GET', redirect: 'follow' },
    ]);
    expect(getResponse.bodyUsed).toBe(true);
  });

  it('logs a failed pre-check and lets the renderer decide', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await pageExists('https://example.com/about/', async () => { throw new Error('offline'); })).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});
