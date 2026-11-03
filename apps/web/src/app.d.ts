declare global {
  namespace App {
    /** Fehler, die SvelteKit anzeigt; `detail` ist die technische Angabe (nur für die Fehlerseite). */
    interface Error {
      message: string;
      detail?: string;
    }
  }
}

export {};
