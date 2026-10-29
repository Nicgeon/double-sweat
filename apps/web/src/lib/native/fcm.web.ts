import type { FcmPlugin } from './plugins.ts';

/** Im Browser gibt es kein FCM über dieses Plugin (Web Push läuft über den Browser selbst). */
export class FcmWeb implements FcmPlugin {
  async isAvailable() {
    return { available: false };
  }
  async register(): Promise<never> {
    throw new Error('FCM ist nur in der Android-App verfügbar');
  }
  async unregister() {}
  async current() {
    return { registration: null };
  }
}
