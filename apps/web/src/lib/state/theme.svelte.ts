import { syncSystemBars } from '#lib/native/system-bars.ts';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'ds_theme';

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* privater Modus oder gesperrter Speicher */
  }
  return 'system';
}

/** Hell, Dunkel oder System. Ohne Auswahl folgt tokens.css dem Systemschema (prefers-color-scheme). */
class Theme {
  choice = $state<ThemeChoice>('system');

  init(): void {
    this.choice = read();
    this.apply();
  }

  set(choice: ThemeChoice): void {
    this.choice = choice;
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* nicht kritisch */
    }
    this.apply();
  }

  private apply(): void {
    const root = document.documentElement;
    if (this.choice === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', this.choice);
    syncSystemBars(this.choice);
  }
}

export const theme = new Theme();
