import { type MessageKey, t } from '#lib/i18n/index.svelte.ts';
import type { IconName } from '#lib/icons.ts';

const TAG_ICONS: Record<string, IconName> = {
  kraft: 'dumbbell',
  cardio: 'heart-pulse',
  laufen: 'footprints',
  rad: 'bike',
  schwimmen: 'waves',
  yoga: 'flower-2',
  sonstiges: 'activity',
};

/** Die Werte sind feste Kennungen der API (nicht übersetzt); nur die Beschriftung folgt der Sprache. */
export const TAG_VALUES = Object.keys(TAG_ICONS);

export type TagMeta = { value: string; label: string; icon: IconName };

export const tagList = (): TagMeta[] =>
  TAG_VALUES.map((value) => ({
    value,
    label: t(`tag.${value}` as MessageKey),
    icon: TAG_ICONS[value] as IconName,
  }));

export const tagMeta = (value: string | null | undefined): TagMeta | undefined =>
  value && value in TAG_ICONS
    ? { value, label: t(`tag.${value}` as MessageKey), icon: TAG_ICONS[value] as IconName }
    : undefined;
