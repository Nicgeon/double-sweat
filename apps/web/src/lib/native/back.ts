/** Die Hauptseiten der Tab-Leiste: von dort geht es zurück zu "Heute", nicht tiefer in den Verlauf. */
const TAB_ROOTS = ['/history', '/deal', '/profile'];
/** Seiten vor der Anmeldung: ohne Verlauf beendet Zurück die App. */
const OUTSIDE = /^\/(?:login|register|server|join|forgot|reset|verify)(?:\/|$)/;

export type BackAction =
  /** Im Browserverlauf einen Schritt zurück. */
  | { type: 'history' }
  /** Zu einer bestimmten Seite (Tab-Wurzel zu "Heute", Unterseite zu ihrer Übersicht). */
  | { type: 'goto'; to: string }
  /** Die App beenden. */
  | { type: 'exit' };

/** Die Seite über einer Unterseite. */
export function parentOf(path: string, search: string): string {
  if (path.startsWith('/profile/')) return '/profile';
  if (path === '/notifications/settings') {
    return new URLSearchParams(search).get('from') === 'profile' ? '/profile' : '/notifications';
  }
  return '/';
}

/**
 * Was der Zurück-Knopf der Android-App auf dieser Seite tut (wenn kein Fenster offen ist):
 * Unterseite zurück, Tab-Wurzel zu "Heute", auf "Heute" die App beenden.
 */
export function backAction(path: string, search: string, canGoBack: boolean): BackAction {
  if (path === '/') return { type: 'exit' };
  if (TAB_ROOTS.includes(path)) return { type: 'goto', to: '/' };
  if (OUTSIDE.test(path)) return canGoBack ? { type: 'history' } : { type: 'exit' };
  return canGoBack ? { type: 'history' } : { type: 'goto', to: parentOf(path, search) };
}
