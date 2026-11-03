declare global {
  /** Versionsnummer dieser Oberfläche, beim Bauen aus package.json eingesetzt (vite.config.ts). */
  const __APP_VERSION__: string;

  namespace App {
    /** Fehler, die SvelteKit anzeigt; `detail` ist die technische Angabe (nur für die Fehlerseite). */
    interface Error {
      message: string;
      detail?: string;
    }
  }
}

export {};
