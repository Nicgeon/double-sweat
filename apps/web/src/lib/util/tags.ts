import type { IconName } from '#lib/icons.ts';

export const TAGS: { value: string; label: string; icon: IconName }[] = [
  { value: 'kraft', label: 'Kraft', icon: 'dumbbell' },
  { value: 'cardio', label: 'Cardio', icon: 'heart-pulse' },
  { value: 'laufen', label: 'Laufen', icon: 'footprints' },
  { value: 'rad', label: 'Rad', icon: 'bike' },
  { value: 'schwimmen', label: 'Schwimmen', icon: 'waves' },
  { value: 'yoga', label: 'Yoga', icon: 'flower-2' },
  { value: 'sonstiges', label: 'Sonstiges', icon: 'activity' },
];

export const tagMeta = (value: string | null | undefined) => TAGS.find((t) => t.value === value);
