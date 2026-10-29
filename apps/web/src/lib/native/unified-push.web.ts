import type { UnifiedPushPlugin } from './plugins.ts';

/** Im Browser gibt es kein UnifiedPush. */
export class UnifiedPushWeb implements UnifiedPushPlugin {
  async getDistributors() {
    return { distributors: [], current: null };
  }
  async register(): Promise<never> {
    throw new Error('UnifiedPush ist nur in der Android-App verfügbar');
  }
  async unregister() {}
  async current() {
    return { registration: null };
  }
  async requestNotificationPermission() {
    return { granted: false };
  }
}
