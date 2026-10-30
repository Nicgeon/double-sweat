import type { SelfieCameraPlugin } from './plugins.ts';

/** Im Browser läuft das Selfie über die Live-Kamera, nicht über dieses Plugin. */
export class SelfieCameraWeb implements SelfieCameraPlugin {
  async take() {
    return { webPath: null };
  }
}
