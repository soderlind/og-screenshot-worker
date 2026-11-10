import { describe, expect, it, vi } from 'vitest';
import { pageExists } from '../src/page-check';

const respond = (...statuses: number[]) => {
  const fn = vi.fn(async () => new Response(null, { status: statuses.shift() }));
  return fn;
};

describe('pageExists', () => {
  it.each([
    [200, true],
    [301, true],
    [500, true],
    [404, false],
    [410, false],
  ])('HEAD %i → %s', async (status, expected) => {
    expect(await pageExists('https://a.com/x/', respond(status))).toBe(expected);
  });

  it('retries with GET when HEAD is not allowed', async () => {
    const fetchFn = respond(405, 404);
    expect(await pageExists('https://a.com/x/', fetchFn)).toBe(false);
    expect(fetchFn.mock.calls.map((c) => (c as unknown[])[1])).toMatchObject([{ method: 'HEAD' }, { method: 'GET' }]);
  });

  it('lets the renderer decide on network errors', async () => {
    expect(await pageExists('https://a.com/x/', async () => { throw new Error('offline'); })).toBe(true);
  });
});
