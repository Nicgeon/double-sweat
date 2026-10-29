import type { Locale } from '../../i18n/locales.js';
import type { MailMessage } from './mailer.js';

// Reiner Text, keine Tracking-Pixel, keine externen Bilder. Anrede im Du bzw. informell.

const clean = (value: string) =>
  value
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 80);

interface Texts {
  subject: string;
  /** Der Text ohne Gruß und Fußzeile; {link} wird durch den Link ersetzt. */
  body: string;
}

const FOOTER: Record<Locale, string> = {
  de: '\n\n— Double Sweat\nDiese Nachricht wurde automatisch gesendet. Antworten werden nicht gelesen.',
  en: '\n\n— Double Sweat\nThis message was sent automatically. Replies are not read.',
};

const GREETING: Record<Locale, (name: string) => string> = {
  de: (name) => `Hallo ${name},`,
  en: (name) => `Hi ${name},`,
};

type Kind =
  | 'verify'
  | 'passwordReset'
  | 'passwordChanged'
  | 'emailChangeConfirm'
  | 'emailChangedNotice';

const TEXTS: Record<Kind, Record<Locale, Texts>> = {
  verify: {
    de: {
      subject: 'Double Sweat: E-Mail-Adresse bestätigen',
      body: 'bitte bestätige deine E-Mail-Adresse, damit du dein Passwort bei Bedarf selbst zurücksetzen kannst:\n\n{link}\n\nDer Link ist 24 Stunden gültig. Wenn du dich nicht registriert hast, kannst du diese Nachricht ignorieren.',
    },
    en: {
      subject: 'Double Sweat: confirm your email address',
      body: 'please confirm your email address so you can reset your password yourself if you ever need to:\n\n{link}\n\nThe link is valid for 24 hours. If you did not sign up, you can ignore this message.',
    },
  },
  passwordReset: {
    de: {
      subject: 'Double Sweat: Passwort zurücksetzen',
      body: 'für dein Konto wurde ein neues Passwort angefordert. Mit diesem Link kannst du eines festlegen:\n\n{link}\n\nDer Link ist 30 Minuten gültig und nur einmal verwendbar. Wenn du das nicht angefordert hast, ignoriere diese Nachricht. Dein Passwort bleibt dann unverändert.',
    },
    en: {
      subject: 'Double Sweat: reset your password',
      body: 'a new password was requested for your account. Use this link to set one:\n\n{link}\n\nThe link is valid for 30 minutes and can be used once. If you did not request this, ignore this message. Your password stays unchanged.',
    },
  },
  passwordChanged: {
    de: {
      subject: 'Double Sweat: Dein Passwort wurde geändert',
      body: 'dein Passwort wurde soeben geändert, alle anderen Geräte wurden abgemeldet.\n\nWarst du das nicht? Dann setze dein Passwort sofort über „Passwort vergessen“ zurück oder wende dich an die Person, die den Server betreibt.',
    },
    en: {
      subject: 'Double Sweat: your password was changed',
      body: 'your password was just changed, and all other devices were signed out.\n\nWasn’t you? Reset your password right away using “Forgot password”, or contact the person who runs the server.',
    },
  },
  emailChangeConfirm: {
    de: {
      subject: 'Double Sweat: Neue E-Mail-Adresse bestätigen',
      body: 'für dein Konto wurde diese Adresse als neue E-Mail-Adresse angegeben. Zum Bestätigen:\n\n{link}\n\nDer Link ist 24 Stunden gültig. Wenn du das nicht angefordert hast, ignoriere diese Nachricht.',
    },
    en: {
      subject: 'Double Sweat: confirm your new email address',
      body: 'this address was given as the new email address for your account. To confirm:\n\n{link}\n\nThe link is valid for 24 hours. If you did not request this, ignore this message.',
    },
  },
  emailChangedNotice: {
    de: {
      subject: 'Double Sweat: E-Mail-Adresse geändert',
      body: 'die E-Mail-Adresse deines Kontos wurde geändert. Ab jetzt gehen Nachrichten an die neue Adresse.\n\nWarst du das nicht? Wende dich bitte umgehend an die Person, die den Server betreibt.',
    },
    en: {
      subject: 'Double Sweat: email address changed',
      body: 'the email address of your account was changed. From now on, messages go to the new address.\n\nWasn’t you? Please contact the person who runs the server right away.',
    },
  },
};

function compose(kind: Kind, locale: Locale, to: string, name: string, link?: string): MailMessage {
  const { subject, body } = TEXTS[kind][locale];
  const text = body.replace('{link}', link ?? '');
  return {
    to,
    subject,
    text: `${GREETING[locale](clean(name))}\n\n${text}${FOOTER[locale]}`,
  };
}

export const verifyEmailMail = (locale: Locale, to: string, name: string, link: string) =>
  compose('verify', locale, to, name, link);
export const passwordResetMail = (locale: Locale, to: string, name: string, link: string) =>
  compose('passwordReset', locale, to, name, link);
export const passwordChangedMail = (locale: Locale, to: string, name: string) =>
  compose('passwordChanged', locale, to, name);
export const emailChangeConfirmMail = (locale: Locale, to: string, name: string, link: string) =>
  compose('emailChangeConfirm', locale, to, name, link);
export const emailChangedNoticeMail = (locale: Locale, to: string, name: string) =>
  compose('emailChangedNotice', locale, to, name);
