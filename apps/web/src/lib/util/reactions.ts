import type { IconName } from '#lib/icons.ts';

export type ReactionKind = 'flame' | 'applause' | 'strong' | 'heart';

/** Symbole, mit denen man auf den Check-in des Partners reagiert. Immer mit Wort, nie nur ein Symbol. */
export const REACTIONS: { value: ReactionKind; label: string; icon: IconName }[] = [
  { value: 'flame', label: 'Feuer', icon: 'flame' },
  { value: 'applause', label: 'Bravo', icon: 'trophy' },
  { value: 'strong', label: 'Stark', icon: 'dumbbell' },
  { value: 'heart', label: 'Stolz', icon: 'heart-pulse' },
];

export const reactionMeta = (value: string | null | undefined) =>
  REACTIONS.find((r) => r.value === value);
