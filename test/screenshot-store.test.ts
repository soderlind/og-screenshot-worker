import { describe, expect, it } from 'vitest';
import { loadSiteProfile } from '../src/site-profile';
import { createScreenshotStore } from '../src/screenshot-store';
import { background, memoryEdge, memoryKv } from './fakes';

const PNG = new Uint8Array([137, 80, 78, 71]);
const OG = 'https://og.example.com';

function setup(origin = 'https://example.com', kv = memoryKv()) {
  const edge = memoryEdge();
  const bg = background();
  const clock = { t: 1_000_000 };
  const profile = loadSiteProfile({ SITE_ORIGIN: origin });
  const store = createScreenshotStore({ profile, kv, edge, waitUntil: bg.waitUntil, now: () => clock.t });
  return { kv, edge, bg, store, clock };
}

describe('ScreenshotStore', () => {
  it('misses when nothing is stored', async () => {
    const { store } = setup();
    expect(await store.lookup('about', OG)).toBeNull();
    expect(await store.has('about')).toBe(false);
  });

  it('save → MISS, then HIT-EDGE', async () => {
    const { store, bg } = setup();
    const saved = await store.save('about', PNG, OG);
    expect(saved.headers.get('X-Cache')).toBe('MISS');
    await bg.flush();

    const hit = await store.lookup('about', OG);
    expect(hit?.headers.get('X-Cache')).toBe('HIT-EDGE');
    expect(new Uint8Array(await hit!.arrayBuffer())).toEqual(PNG);
  });

  it('falls through to KV and warms the Edge Cache', async () => {
    const { store, edge, bg } = setup();
    await store.save('about', PNG); // no public origin: KV only, like warmup
    expect(edge.data.size).toBe(0);
    expect(await store.has('about')).toBe(true);

    const hit = await store.lookup('about', OG);
    expect(hit?.headers.get('X-Cache')).toBe('HIT-KV');
    await bg.flush();
    expect((await store.lookup('about', OG))?.headers.get('X-Cache')).toBe('HIT-EDGE');
  });

  it('keeps Edge Cache and KV TTLs in step', async () => {
    const { store } = setup();
    const res = await store.save('about', PNG, OG);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=604800');
  });

  it('isolates installs sharing one KV namespace', async () => {
    const shared = memoryKv();
    const a = setup('https://a.com', shared);
    const b = setup('https://b.com', shared);
    await a.store.save('about', PNG);
    expect(await a.store.has('about')).toBe(true);
    expect(await b.store.has('about')).toBe(false);
    expect([...shared.data.keys()]).toEqual(['og:a.com:about']);
  });

  it('promotes KV hits to the edge only for their remaining lifetime', async () => {
    const { store, edge, bg, clock } = setup();
    await store.save('about', PNG);
    clock.t += (604800 - 3600) * 1000; // one hour left

    const hit = await store.lookup('about', OG);
    expect(hit?.headers.get('Cache-Control')).toBe('public, max-age=3600, s-maxage=3600');
    await bg.flush();
    expect(edge.data.size).toBe(1);
  });

  it('does not promote expired-by-age KV hits to the edge', async () => {
    const { store, edge, bg, clock } = setup();
    await store.save('about', PNG);
    clock.t += 604800 * 1000;

    const hit = await store.lookup('about', OG);
    expect(hit?.headers.get('X-Cache')).toBe('HIT-KV');
    await bg.flush();
    expect(edge.data.size).toBe(0);
  });
});
