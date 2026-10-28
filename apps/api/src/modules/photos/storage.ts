import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, rename, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

// Schlüssel entstehen ausschließlich serverseitig: <teamId>/<jahr-monat>/<checkinId>[.thumb].jpg
const KEY_PATTERN = /^[0-9A-Z]{26}\/\d{4}-\d{2}\/[0-9A-Z]{26}(\.thumb)?\.jpg$/;

export interface PhotoStorage {
  write(key: string, data: Buffer): Promise<void>;
  open(
    key: string,
  ):
    | { stream: ReturnType<typeof createReadStream>; size: number }
    | Promise<{ stream: ReturnType<typeof createReadStream>; size: number }>;
  remove(keys: string[]): Promise<void>;
  /** Löscht Dateien, die in keiner Datenbankzeile mehr vorkommen und älter als die Schonfrist sind. */
  sweepOrphans(known: Set<string>, now: number, graceMs: number): Promise<number>;
}

export function createPhotoStorage(root: string): PhotoStorage {
  const base = resolve(root);

  function pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Ungültiger Foto-Schlüssel');
    const full = resolve(join(base, key));
    if (!full.startsWith(base + sep)) throw new Error('Ungültiger Foto-Schlüssel');
    return full;
  }

  return {
    async write(key, data) {
      const target = pathFor(key);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      // Erst in eine Temp-Datei, dann atomar umbenennen: nie halbe Dateien unter dem Zielnamen
      const tmp = `${target}.tmp-${randomBytes(6).toString('hex')}`;
      await writeFile(tmp, data, { mode: 0o600 });
      await rename(tmp, target);
    },

    async open(key) {
      const target = pathFor(key);
      const info = await stat(target);
      return { stream: createReadStream(target), size: info.size };
    },

    async remove(keys) {
      await Promise.all(
        keys.map(async (key) => {
          try {
            await unlink(pathFor(key));
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }),
      );
    },

    async sweepOrphans(known, now, graceMs) {
      let removed = 0;
      const walk = async (dir: string, relative: string): Promise<void> => {
        let entries: import('node:fs').Dirent[];
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
          throw error;
        }
        for (const entry of entries) {
          const rel = relative ? `${relative}/${entry.name}` : entry.name;
          const full = join(dir, entry.name);
          if (entry.isDirectory()) {
            await walk(full, rel);
            // Leere Verzeichnisse aufräumen (rmdir schlägt bei Inhalt fehl, das ist gewollt)
            await rm(full, { recursive: false }).catch(() => undefined);
          } else if (entry.isFile() && !known.has(rel)) {
            const info = await stat(full);
            if (now - info.mtimeMs > graceMs) {
              await unlink(full);
              removed++;
            }
          }
        }
      };
      await walk(base, '');
      return removed;
    },
  };
}
