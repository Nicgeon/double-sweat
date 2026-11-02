/** true im Build für die Android-App (Capacitor), false in der Web-App. Wird beim Bauen festgelegt. */
export const NATIVE = import.meta.env.VITE_TARGET === 'native';

/** Nur für Entwicklung und Tests: http:// als Serveradresse zulassen (nie im Release-Build). */
export const ALLOW_HTTP = import.meta.env.VITE_ALLOW_HTTP === 'true';

/** Version der API, die diese App spricht. Der Server meldet minClientApi und apiVersion. */
export const CLIENT_API = 2;
