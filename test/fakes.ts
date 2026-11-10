export function memoryKv() {
  const data = new Map<string, Uint8Array>();
  const kv = {
    data,
    async get(key: string, type: 'arrayBuffer' | 'stream') {
      const value = data.get(key);
      if (!value) return null;
      if (type === 'stream') return new Response(value).body;
      return value.slice().buffer;
    },
    async put(key: string, value: Uint8Array | ArrayBuffer) {
      data.set(key, new Uint8Array(value instanceof ArrayBuffer ? value : value.slice()));
    },
  };
  return kv as typeof kv & KVNamespace;
}

export function memoryEdge() {
  const data = new Map<string, Response>();
  const edge = {
    data,
    async match(req: Request) {
      return data.get(req.url)?.clone() ?? undefined;
    },
    async put(req: Request, res: Response) {
      data.set(req.url, res);
    },
  };
  return edge as typeof edge & Cache;
}

export function background() {
  const pending: Promise<unknown>[] = [];
  return {
    waitUntil: (p: Promise<unknown>) => void pending.push(p),
    flush: () => Promise.all(pending),
  };
}
