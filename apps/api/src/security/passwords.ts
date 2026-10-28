import { type Algorithm, hash, verify } from '@node-rs/argon2';

export interface Argon2Params {
  memoryKib: number;
  timeCost: number;
  parallelism: number;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
  /** true, wenn der Hash mit schwächeren Parametern als aktuell konfiguriert erzeugt wurde. */
  needsRehash(passwordHash: string): boolean;
  /** Verbraucht dieselbe Rechenzeit wie eine echte Prüfung (gegen Timing-Enumeration). */
  dummyVerify(password: string): Promise<void>;
}

// Argon2id = 2 (der Enum-Export von @node-rs/argon2 ist ein const enum und mit isolatedModules nicht nutzbar)
const ARGON2ID = 2 as Algorithm;

export function createPasswordHasher(params: Argon2Params): PasswordHasher {
  const options = {
    algorithm: ARGON2ID,
    memoryCost: params.memoryKib,
    timeCost: params.timeCost,
    parallelism: params.parallelism,
  };
  let dummy: Promise<string> | null = null;

  return {
    hash: (password) => hash(password, options),
    async verify(passwordHash, password) {
      try {
        return await verify(passwordHash, password);
      } catch {
        return false;
      }
    },
    needsRehash(passwordHash) {
      const match = /^\$argon2id\$v=\d+\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(passwordHash);
      if (!match) return true;
      const [, m, t, p] = match;
      return (
        Number(m) < params.memoryKib ||
        Number(t) < params.timeCost ||
        Number(p) !== params.parallelism
      );
    },
    async dummyVerify(password) {
      dummy ??= hash('dummy-password-for-timing-equalisation', options);
      try {
        await verify(await dummy, password);
      } catch {
        /* Ergebnis ist irrelevant */
      }
    },
  };
}
