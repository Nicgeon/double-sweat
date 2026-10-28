import type { MailMessage } from './mailer.js';

// Reiner Text, keine Tracking-Pixel, keine externen Bilder. Anrede im Du.

const clean = (value: string) =>
  value
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 80);

const footer =
  '\n\n— Double Sweat\nDiese Nachricht wurde automatisch gesendet. Antworten werden nicht gelesen.';

export function verifyEmailMail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: 'Double Sweat: E-Mail-Adresse bestätigen',
    text: `Hallo ${clean(name)},\n\nbitte bestätige deine E-Mail-Adresse, damit du dein Passwort bei Bedarf selbst zurücksetzen kannst:\n\n${link}\n\nDer Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, kannst du diese Nachricht ignorieren.${footer}`,
  };
}

export function passwordResetMail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: 'Double Sweat: Passwort zurücksetzen',
    text: `Hallo ${clean(name)},\n\nfür dein Konto wurde ein neues Passwort angefordert. Mit diesem Link kannst du eines festlegen:\n\n${link}\n\nDer Link ist 30 Minuten gültig und nur einmal verwendbar. Wenn du das nicht angefordert hast, ignoriere diese Nachricht. Dein Passwort bleibt dann unverändert.${footer}`,
  };
}

export function passwordChangedMail(to: string, name: string): MailMessage {
  return {
    to,
    subject: 'Double Sweat: Dein Passwort wurde geändert',
    text: `Hallo ${clean(name)},\n\ndein Passwort wurde soeben geändert, alle anderen Geräte wurden abgemeldet.\n\nWarst du das nicht? Dann setze dein Passwort sofort über „Passwort vergessen“ zurück oder wende dich an die Person, die den Server betreibt.${footer}`,
  };
}

export function emailChangeConfirmMail(to: string, name: string, link: string): MailMessage {
  return {
    to,
    subject: 'Double Sweat: Neue E-Mail-Adresse bestätigen',
    text: `Hallo ${clean(name)},\n\nfür dein Konto wurde diese Adresse als neue E-Mail-Adresse angegeben. Zum Bestätigen:\n\n${link}\n\nDer Link ist 24 Stunden gültig. Wenn du das nicht angefordert hast, ignoriere diese Nachricht.${footer}`,
  };
}

export function emailChangedNoticeMail(to: string, name: string): MailMessage {
  return {
    to,
    subject: 'Double Sweat: E-Mail-Adresse geändert',
    text: `Hallo ${clean(name)},\n\ndie E-Mail-Adresse deines Kontos wurde geändert. Ab jetzt gehen Nachrichten an die neue Adresse.\n\nWarst du das nicht? Wende dich bitte umgehend an die Person, die den Server betreibt.${footer}`,
  };
}
