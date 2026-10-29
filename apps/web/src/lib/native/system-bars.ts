import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import { NATIVE } from './flag.ts';

/**
 * App: Die Symbole in Status- und Navigationsleiste folgen dem gewählten App-Design, nicht nur dem Systemschema.
 * Sonst wären sie bei hellem App-Design auf dunklem Handy (oder umgekehrt) nicht lesbar.
 */
export function syncSystemBars(choice: 'system' | 'light' | 'dark'): void {
  if (!NATIVE) return;
  const style =
    choice === 'dark'
      ? SystemBarsStyle.Dark
      : choice === 'light'
        ? SystemBarsStyle.Light
        : SystemBarsStyle.Default;
  void SystemBars.setStyle({ style }).catch(() => {});
}
