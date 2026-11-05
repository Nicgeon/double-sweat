import { type MessageKey, t } from '#lib/i18n/index.svelte.ts';
import type { IconName } from '#lib/icons.ts';

/** Die festen Kennungen der API (`CHECKIN_TAGS`); nur die Beschriftung folgt der Sprache. */
export type TagValue = 'kraft' | 'cardio' | 'laufen' | 'rad' | 'schwimmen' | 'yoga' | 'sonstiges';

const TAG_ICONS: Record<TagValue, IconName> = {
  kraft: 'dumbbell',
  cardio: 'heart-pulse',
  laufen: 'footprints',
  rad: 'bike',
  schwimmen: 'waves',
  yoga: 'flower-2',
  sonstiges: 'activity',
};

/** Die Werte sind feste Kennungen der API (nicht übersetzt); nur die Beschriftung folgt der Sprache. */
export const TAG_VALUES = Object.keys(TAG_ICONS) as TagValue[];

export type TagMeta = { value: TagValue; label: string; icon: IconName };

export const tagList = (): TagMeta[] =>
  TAG_VALUES.map((value) => ({
    value,
    label: t(`tag.${value}` as MessageKey),
    icon: TAG_ICONS[value] as IconName,
  }));

export const isTag = (value: string | null | undefined): value is TagValue =>
  !!value && value in TAG_ICONS;

export const tagMeta = (value: string | null | undefined): TagMeta | undefined =>
  isTag(value)
    ? { value, label: t(`tag.${value}` as MessageKey), icon: TAG_ICONS[value] }
    : undefined;
