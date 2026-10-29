import type { Locale } from './locales.js';

/**
 * Fehlermeldungen in anderen Sprachen. Im Code steht die deutsche Meldung (Standardsprache und Rückfall); der Schlüssel
 * ist genau dieser Text. Eine fehlende Übersetzung zeigt deshalb nie einen leeren Text, sondern die deutsche Meldung.
 * Ein Test stellt sicher, dass jede im Code vorkommende Meldung hier eine englische Fassung hat.
 */
const EN: Record<string, string> = {
  'Anfrage von nicht erlaubtem Ursprung': 'Request from a disallowed origin',
  'Anfrage zu groß': 'Request too large',
  'Animierte Bilder sind nicht erlaubt': 'Animated images are not allowed',
  'Anmeldung ungültig, bitte erneut anmelden': 'Sign-in is no longer valid, please sign in again',
  'Auf diesem Server ist die Registrierung deaktiviert': 'Registration is disabled on this server',
  'Auf eigene Check-ins kannst du nicht reagieren': 'You cannot react to your own check-ins',
  'Belohnung nicht gefunden': 'Reward not found',
  'CSRF-Token fehlt oder ist ungültig': 'CSRF token is missing or invalid',
  'Check-in nicht gefunden': 'Check-in not found',
  'Das Bild hat zu viele Pixel': 'The image has too many pixels',
  'Das Bild konnte nicht gelesen werden': 'The image could not be read',
  'Das FCM-Token ist ungültig': 'The FCM token is invalid',
  'Das Passwort ist falsch': 'The password is wrong',
  'Das ist bereits deine E-Mail-Adresse': 'That is already your email address',
  'Das war etwas viel. Versuche es später noch einmal.': 'That was a lot. Please try again later.',
  'Dein Team hat noch keinen Partner': 'Your team has no partner yet',
  'Dein Team ist bereits vollständig': 'Your team is already complete',
  'Die Notiz ist zu lang': 'The note is too long',
  'Die Verschlüsselungsschlüssel der Subscription sind ungültig':
    'The encryption keys of the subscription are invalid',
  'Die Woche ist abgeschlossen, der Check-in kann nicht mehr geändert werden':
    'The week is closed, the check-in can no longer be changed',
  'Die maximale Anzahl an Teams auf diesem Server ist erreicht':
    'The maximum number of teams on this server has been reached',
  'Diese E-Mail-Adresse ist bereits registriert': 'This email address is already registered',
  'Diese E-Mail-Adresse ist bereits vergeben': 'This email address is already taken',
  'Diese Farbe hat dein Partner schon gewählt': 'Your partner has already chosen this color',
  'Dieser Push-Anbieter ist auf dem Server abgeschaltet':
    'This push provider is turned off on the server',
  'Dieses Foto wurde bereits verwendet': 'This photo has already been used',
  'Dieses Gerät ist bereits für ein anderes Konto registriert':
    'This device is already registered for another account',
  'Dieses Team ist bereits vollständig': 'This team is already complete',
  'Du bist bereits in einem Team': 'You are already in a team',
  'Du bist in keinem Team': 'You are not in a team',
  'E-Mail oder Passwort ist falsch': 'Email or password is wrong',
  'Einladung ungültig oder abgelaufen': 'Invitation is invalid or has expired',
  'Erwartet ein Datum im Format YYYY-MM-DD': 'Expected a date in the format YYYY-MM-DD',
  'FCM braucht die Schlüssel p256dh und auth: Nachrichten werden Ende-zu-Ende verschlüsselt':
    'FCM needs the keys p256dh and auth: messages are end-to-end encrypted',
  'Für Check-ins brauchst du ein Team': 'You need a team to check in',
  'Gerät nicht gefunden': 'Device not found',
  'Interner Fehler': 'Internal error',
  'Keine Änderungen angegeben': 'No changes given',
  'Neue Teams können auf diesem Server nicht selbst angelegt werden':
    'New teams cannot be created on this server by yourself',
  'Nicht angemeldet': 'Not signed in',
  'Nicht gefunden': 'Not found',
  'Nur JPEG-, PNG- und WebP-Bilder sind erlaubt': 'Only JPEG, PNG and WebP images are allowed',
  'Nur die Person, der etwas geschuldet wird, kann das bestätigen':
    'Only the person who is owed something can confirm this',
  'Nur die Person, die die Belohnung verdient hat, kann das bestätigen':
    'Only the person who earned the reward can confirm this',
  'Push-Ziel nicht erreichbar oder nicht auflösbar':
    'Push target is unreachable or cannot be resolved',
  'Schuld nicht gefunden': 'Debt not found',
  'Setup-Token fehlt oder ist falsch': 'Setup token is missing or wrong',
  'Sitzung nicht gefunden': 'Session not found',
  'Team nicht gefunden': 'Team not found',
  'Unbekannte Zeitzone': 'Unknown time zone',
  'Ungültige Eingabe': 'Invalid input',
  'Web Push braucht die Schlüssel p256dh und auth': 'Web Push needs the keys p256dh and auth',
  'Zu viele Anfragen, bitte später erneut versuchen': 'Too many requests, please try again later',
  'Zu viele registrierte Geräte, bitte nicht benötigte entfernen':
    'Too many registered devices, please remove the ones you do not need',
  // Begründungen der Prüfung von Push-Zielen (SSRF-Schutz)
  'URL zu lang': 'URL too long',
  'Keine gültige URL': 'Not a valid URL',
  'URL darf keine Zugangsdaten enthalten': 'URL must not contain credentials',
  'Nur https:// ist erlaubt': 'Only https:// is allowed',
  'Host fehlt': 'Host is missing',
  'Host nicht auflösbar': 'Host cannot be resolved',
  'Ziel liegt in einem nicht erlaubten Adressbereich': 'Target is in a disallowed address range',
};

/** Meldungen mit eingesetzten Werten. */
const PATTERNS: [RegExp, Partial<Record<Locale, (m: RegExpExecArray) => string>>][] = [
  [
    /^Du hast heute schon (\d+) Check-ins gemacht$/,
    { en: (m) => `You have already made ${m[1]} check-ins today` },
  ],
  [
    /^Push-Ziel nicht erlaubt: (.*)$/,
    { en: (m) => `Push target not allowed: ${EN[m[1] ?? ''] ?? m[1]}` },
  ],
];

/** Die Meldung in der gewünschten Sprache; unbekannte Meldungen und Deutsch bleiben unverändert. */
export function localizeError(locale: Locale, message: string): string {
  if (locale === 'de') return message;
  const known = locale === 'en' ? EN[message] : undefined;
  if (known) return known;
  for (const [pattern, byLocale] of PATTERNS) {
    const match = pattern.exec(message);
    const render = byLocale[locale];
    if (match && render) return render(match);
  }
  return message;
}

/** Alle übersetzten Meldungen (für den Test, der die Abdeckung prüft). */
export const translatedMessages = (locale: Locale): string[] =>
  locale === 'en' ? Object.keys(EN) : [];
