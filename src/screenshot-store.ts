import type { SiteProfile } from './site-profile';

export type CacheState = 'HIT-EDGE' | 'HIT-KV' | 'MISS';

type KvStore = Pick<KVNamespace, 'get' | 'put'>;
type EdgeCache = Pick<Cache, 'match' | 'put'>;

export interface ScreenshotStoreDeps {
  profile: SiteProfile;
  kv: KvStore;
  /** Edge Cache; omitted where no public URL exists (e.g. scheduled warmup). */
  edge?: EdgeCache;
  waitUntil(promise: Promise<unknown>): void;
}

export interface ScreenshotStore {
  /**
   * Edge Cache, then KV Cache. A KV hit warms the Edge Cache in the background.
   * `publicOrigin` is the OG host origin the request came in on; it keys the Edge Cache.
   */
  lookup(slug: string, publicOrigin?: string): Promise<Response | null>;
  /** Writes to KV (awaited) and the Edge Cache (background); returns the MISS response. */
  save(slug: string, png: Uint8Array | ArrayBuffer, publicOrigin?: string): Promise<Response>;
  /** True when the KV Cache already holds the slug. */
  has(slug: string): Promise<boolean>;
}

export function createScreenshotStore({ profile, kv, edge, waitUntil }: ScreenshotStoreDeps): ScreenshotStore {
  // Scope by site host so N installs can share one KV namespace safely.
  const kvKey = (slug: string) => `og:${profile.host}:${slug}`;
  const edgeKey = (slug: string, publicOrigin: string) => new Request(`${publicOrigin}/${slug}.png`, { method: 'GET' });

  const imageResponse = (body: BodyInit, state: CacheState) =>
    new Response(body, {
      headers: {
        'Content-Type': 'image/png',
        // max-age for browsers/social crawlers; s-maxage keeps the Edge Cache in step with KV.
        'Cache-Control': `public, max-age=${profile.browserMaxAgeSeconds}, s-maxage=${profile.cacheTtlSeconds}`,
        'Access-Control-Allow-Origin': '*',
        'X-Cache': state,
      },
    });

  const withState = (response: Response, state: CacheState) => {
    const headers = new Headers(response.headers);
    headers.set('X-Cache', state);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };

  return {
    async lookup(slug, publicOrigin) {
      if (edge && publicOrigin) {
        const hit = await edge.match(edgeKey(slug, publicOrigin));
        if (hit) return withState(hit, 'HIT-EDGE');
      }

      const stored = await kv.get(kvKey(slug), 'arrayBuffer');
      if (!stored) return null;

      const response = imageResponse(stored, 'HIT-KV');
      if (edge && publicOrigin) {
        waitUntil(edge.put(edgeKey(slug, publicOrigin), response.clone()));
      }
      return response;
    },

    async save(slug, png, publicOrigin) {
      await kv.put(kvKey(slug), png, { expirationTtl: profile.cacheTtlSeconds });
      const response = imageResponse(png, 'MISS');
      if (edge && publicOrigin) {
        waitUntil(edge.put(edgeKey(slug, publicOrigin), response.clone()));
      }
      return response;
    },

    async has(slug) {
      const stream = await kv.get(kvKey(slug), 'stream');
      if (!stream) return false;
      await stream.cancel();
      return true;
    },
  };
}
