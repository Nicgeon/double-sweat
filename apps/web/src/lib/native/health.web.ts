import { ALLOW_HTTP } from './flag.ts';
import type { HealthAvailability, HealthConnectPlugin, HealthSession } from './plugins.ts';

/** Vorgabe der Tests im Browser (nur im Testbuild): so verhält sich "Health Connect" dort. */
export interface HealthFake {
  availability?: HealthAvailability;
  granted?: boolean;
  /** Die Erlaubnis wird beim Nachfragen verweigert. */
  deny?: boolean;
  sessions?: HealthSession[];
  /** Wie oft "Health Connect öffnen" und "Play Store" angetippt wurden. */
  opened?: number;
  store?: number;
}

declare global {
  interface Window {
    __dsHealthFake?: HealthFake;
  }
}

/** Im Browser gibt es kein Health Connect; im Testbuild lässt es sich über `window.__dsHealthFake` vorspielen. */
export class HealthConnectWeb implements HealthConnectPlugin {
  private fake(): HealthFake | undefined {
    return ALLOW_HTTP ? window.__dsHealthFake : undefined;
  }

  async status() {
    const f = this.fake();
    if (!f) return { availability: 'unsupported' as const, granted: false };
    return { availability: f.availability ?? 'available', granted: !!f.granted };
  }

  async requestPermission() {
    const f = this.fake();
    if (f && (f.availability ?? 'available') === 'available' && !f.deny) f.granted = true;
    return { granted: !!f?.granted };
  }

  async recentSessions() {
    const f = this.fake();
    return { granted: !!f?.granted, sessions: f?.granted ? (f.sessions ?? []) : [] };
  }

  async openSettings() {
    const f = this.fake();
    if (f) f.opened = (f.opened ?? 0) + 1;
  }

  async openStore() {
    const f = this.fake();
    if (f) f.store = (f.store ?? 0) + 1;
  }
}
