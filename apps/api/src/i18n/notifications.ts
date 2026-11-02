import type { Locale } from './locales.js';

/** Arten von Mitteilungen. Der Text entsteht erst beim Zustellen und Lesen, in der Sprache des Empfängers. */
export type NotificationType =
  | 'nudge'
  | 'reminder'
  | 'debt_created'
  | 'bet_set'
  | 'bet_changed'
  | 'reward_set'
  | 'reward_earned'
  | 'reaction'
  | 'team_dissolved'
  | 'streak_milestone'
  | 'streak_broken'
  | 'test';

export type NotificationParams = Record<string, string | number>;

export const NOTIFICATION_TITLE = 'Double Sweat';

type Template = (p: NotificationParams) => string;

const REACTION_PHRASE: Record<Locale, Record<string, string>> = {
  de: {
    flame: 'feuert dich an',
    applause: 'applaudiert dir',
    strong: 'findet dich stark',
    heart: 'ist stolz auf dich',
  },
  en: {
    flame: 'is cheering you on',
    applause: 'is applauding you',
    strong: 'thinks you are strong',
    heart: 'is proud of you',
  },
};

/** Hängt an die Abend-Erinnerung an, dass auch die gemeinsame Serie auf dem Spiel steht (ab zwei Wochen). */
const streakRisk: Record<Locale, Template> = {
  de: (p) =>
    Number(p.streak) >= 2 ? ` Eure Serie von ${p.streak} Wochen steht auf dem Spiel.` : '',
  en: (p) => (Number(p.streak) >= 2 ? ` Your streak of ${p.streak} weeks is on the line.` : ''),
};

const TEMPLATES: Record<NotificationType, Record<Locale, Template>> = {
  nudge: {
    de: (p) => `${p.name} stupst dich an: Zeit fürs Training!`,
    en: (p) => `${p.name} is nudging you: time to work out!`,
  },
  reminder: {
    de: (p) =>
      (p.missing === 1
        ? 'Heute noch trainieren: Dir fehlt noch ein Tag für dein Wochenziel, und es bleibt kein Puffer.'
        : `Dir fehlen noch ${p.missing} Tage für dein Wochenziel, und jeder verbleibende Tag zählt. Heute schon trainiert?`) +
      streakRisk.de(p),
    en: (p) =>
      (p.missing === 1
        ? 'Work out today: you are one day short of your weekly goal, and there is no buffer left.'
        : `You are ${p.missing} days short of your weekly goal, and every remaining day counts. Worked out today yet?`) +
      streakRisk.en(p),
  },
  streak_milestone: {
    de: (p) =>
      `${p.weeks} Wochen in Serie! Ihr habt ${p.weeks} Wochen in Folge beide euer Ziel geschafft.`,
    en: (p) => `${p.weeks} weeks in a row! You both reached your goal ${p.weeks} weeks running.`,
  },
  streak_broken: {
    de: (p) =>
      `Die Serie ist gerissen: ${p.weeks} Wochen in Folge, diese Woche hat es nicht gereicht. Nächste Woche beginnt eine neue.`,
    en: (p) =>
      `The streak ended: ${p.weeks} weeks in a row, but this week fell short. A new one starts next week.`,
  },
  debt_created: {
    de: (p) =>
      p.role === 'debtor'
        ? `Ziel verfehlt: Du schuldest ${p.other} diese Woche „${p.bet}“.`
        : `${p.other} hat das Ziel verfehlt und schuldet dir „${p.bet}“.`,
    en: (p) =>
      p.role === 'debtor'
        ? `Goal missed: this week you owe ${p.other} “${p.bet}”.`
        : `${p.other} missed the goal and owes you “${p.bet}”.`,
  },
  bet_set: {
    de: (p) => `${p.name} legt den eigenen Einsatz fest: „${p.bet}“.`,
    en: (p) => `${p.name} sets their own stake: “${p.bet}”.`,
  },
  bet_changed: {
    de: (p) => `${p.name} ändert den eigenen Einsatz: „${p.bet}“.`,
    en: (p) => `${p.name} changes their own stake: “${p.bet}”.`,
  },
  reward_set: {
    de: (p) => `${p.name} verspricht dir eine Belohnung für dein Wochenziel: „${p.reward}“.`,
    en: (p) => `${p.name} promises you a reward for your weekly goal: “${p.reward}”.`,
  },
  reward_earned: {
    de: (p) =>
      p.role === 'recipient'
        ? `Wochenziel geschafft! Deine Belohnung von ${p.other}: „${p.reward}“.`
        : `${p.other} hat das Wochenziel geschafft. Deine Belohnung ist fällig: „${p.reward}“.`,
    en: (p) =>
      p.role === 'recipient'
        ? `Weekly goal reached! Your reward from ${p.other}: “${p.reward}”.`
        : `${p.other} reached the weekly goal. Your reward is due: “${p.reward}”.`,
  },
  reaction: {
    de: (p) => `${p.name} ${REACTION_PHRASE.de[String(p.kind)] ?? 'reagiert auf dein Training'}.`,
    en: (p) => `${p.name} ${REACTION_PHRASE.en[String(p.kind)] ?? 'reacted to your workout'}.`,
  },
  team_dissolved: {
    de: (p) => `${p.name ?? 'Dein Partner'} hat das Team aufgelöst. Dein Konto bleibt bestehen.`,
    en: (p) => `${p.name ?? 'Your partner'} dissolved the team. Your account stays active.`,
  },
  test: {
    de: () => 'Test erfolgreich: Benachrichtigungen kommen an.',
    en: () => 'Test successful: notifications are arriving.',
  },
};

export function renderNotification(
  locale: Locale,
  type: NotificationType,
  params: NotificationParams = {},
): { title: string; body: string } {
  return { title: NOTIFICATION_TITLE, body: TEMPLATES[type][locale](params) };
}

export const NOTIFICATION_TYPES = Object.keys(TEMPLATES) as NotificationType[];

export const isNotificationType = (value: string): value is NotificationType =>
  Object.hasOwn(TEMPLATES, value);
