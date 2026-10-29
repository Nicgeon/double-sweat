import { send } from '#lib/api/client.ts';

const MAX = 150;
const cache = new Map<string, Promise<string>>();

/**
 * Lädt ein geschütztes Foto mit Anmeldung und gibt eine blob:-URL zurück (ein <img> kann keinen Header senden).
 * Nur in der App nötig; die Web-App nutzt das Cookie. Die Fotos bleiben nur im Arbeitsspeicher.
 */
export function loadPhoto(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) return hit;
  const pending = (async () => {
    const res = await send(new Request(path, { credentials: 'omit' }));
    if (!res.ok) throw new Error(`photo ${res.status}`);
    return URL.createObjectURL(await res.blob());
  })();
  cache.set(path, pending);
  pending.catch(() => cache.delete(path));
  if (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) {
      const url = cache.get(oldest);
      cache.delete(oldest);
      void url?.then((u) => URL.revokeObjectURL(u)).catch(() => {});
    }
  }
  return pending;
}

export function clearPhotoCache(): void {
  for (const url of cache.values()) void url.then((u) => URL.revokeObjectURL(u)).catch(() => {});
  cache.clear();
}
