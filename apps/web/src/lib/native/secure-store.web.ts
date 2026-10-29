import type { SecureStorePlugin } from './plugins.ts';

/** Nur für Tests im Browser: localStorage statt Keystore. Auf dem Gerät wird das Kotlin-Plugin verwendet. */
export class SecureStoreWeb implements SecureStorePlugin {
  async get({ key }: { key: string }) {
    return { value: localStorage.getItem(`ds_native_${key}`) };
  }
  async set({ key, value }: { key: string; value: string }) {
    localStorage.setItem(`ds_native_${key}`, value);
  }
  async remove({ key }: { key: string }) {
    localStorage.removeItem(`ds_native_${key}`);
  }
}
