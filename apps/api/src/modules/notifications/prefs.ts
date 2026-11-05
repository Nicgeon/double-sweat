import type { NotificationType } from '../../i18n/notifications.js';

/**
 * Einstellungen pro Art von Mitteilung. Das Postfach schreibt immer alles; die Einstellung entscheidet nur, ob
 * zusätzlich ein Push kommt (bei der Abend-Erinnerung, ob sie überhaupt erzeugt wird).
 */
export const NOTIFICATION_SETTINGS = [
  'reminder', // Abendliche Erinnerung, wenn das Wochenziel gefährdet ist
  'nudge', // Anstupser vom Partner
  'checkin', // Check-ins des Partners und sein erreichtes Wochenziel
  'reaction', // Reaktionen auf deine Fotos
  'agreement', // Änderungen an Einsatz und Belohnung, Einlösungen
  'result', // Wochenergebnis und was daraus folgt (Schuld, Belohnung)
  'streak', // Serie: Meilensteine und gerissene Serie
] as const;

export type NotificationSetting = (typeof NOTIFICATION_SETTINGS)[number];
export type NotificationPrefs = Record<NotificationSetting, boolean>;

/** Ohne eigene Wahl kommt alles an (so war es vor den Einstellungen, neue Arten sind ebenfalls an). */
export const DEFAULT_PREFS: NotificationPrefs = {
  reminder: true,
  nudge: true,
  checkin: true,
  reaction: true,
  agreement: true,
  result: true,
  streak: true,
};

/** Zu welcher Einstellung gehört eine Art? null = immer per Push (Team-Ereignisse, Test). */
export const SETTING_OF: Record<NotificationType, NotificationSetting | null> = {
  reminder: 'reminder',
  nudge: 'nudge',
  checkin: 'checkin',
  goal_reached: 'checkin',
  reaction: 'reaction',
  bet_set: 'agreement',
  bet_changed: 'agreement',
  reward_set: 'agreement',
  debt_redeemed: 'agreement',
  reward_received: 'agreement',
  debt_created: 'result',
  reward_earned: 'result',
  week_result: 'result',
  streak_milestone: 'streak',
  streak_broken: 'streak',
  partner_joined: null,
  team_dissolved: null,
  test: null,
};

/** Liest die gespeicherten Werte; Unbekanntes und Fehlerhaftes fällt auf den Standard zurück. */
export function parsePrefs(json: string | null | undefined): NotificationPrefs {
  const prefs = { ...DEFAULT_PREFS };
  if (!json) return prefs;
  try {
    const stored = JSON.parse(json) as Record<string, unknown>;
    for (const key of NOTIFICATION_SETTINGS) {
      if (typeof stored[key] === 'boolean') prefs[key] = stored[key];
    }
  } catch {
    /* kaputter Eintrag: Standard */
  }
  return prefs;
}

/** Legt Änderungen über den bisherigen Stand und gibt den neuen Wert zum Speichern zurück. */
export function mergePrefs(
  json: string | null | undefined,
  patch: Partial<NotificationPrefs>,
): string {
  const next = parsePrefs(json);
  for (const key of NOTIFICATION_SETTINGS) {
    const value = patch[key];
    if (value !== undefined) next[key] = value;
  }
  return JSON.stringify(next);
}

/** Kommt diese Art für diese Person als Push an? */
export function pushWanted(prefs: NotificationPrefs, type: NotificationType): boolean {
  const setting = SETTING_OF[type];
  return setting === null || prefs[setting];
}

/**
 * Wohin führt die Mitteilung in der App (Pfad)? Wird beim Lesen aus Art und Angaben gebildet, gilt also auch für
 * ältere Einträge. null = nirgends hin.
 */
export function linkFor(
  type: NotificationType,
  data: Record<string, unknown> | null | undefined,
): string | null {
  switch (type) {
    case 'nudge':
    case 'reminder':
      return '/checkin';
    case 'checkin':
    case 'goal_reached':
    case 'reaction': {
      const id = data?.checkinId;
      return typeof id === 'string' && id ? `/?photo=${encodeURIComponent(id)}` : '/';
    }
    case 'partner_joined':
    case 'team_dissolved':
      return '/';
    case 'bet_set':
    case 'bet_changed':
    case 'reward_set':
    case 'debt_created':
    case 'debt_redeemed':
    case 'reward_earned':
    case 'reward_received':
      return '/deal';
    case 'week_result':
    case 'streak_milestone':
    case 'streak_broken':
      return '/history';
    case 'test':
      return null;
  }
}
