import { type MessageKey, t } from '#lib/i18n/index.svelte.ts';
import type { IconName } from '#lib/icons.ts';

export type ReactionKind = 'flame' | 'applause' | 'strong' | 'heart';

const ICONS: Record<ReactionKind, IconName> = {
  flame: 'flame',
  applause: 'trophy',
  strong: 'dumbbell',
  heart: 'heart-pulse',
};

export type ReactionMeta = { value: ReactionKind; label: string; icon: IconName };

const meta = (value: ReactionKind): ReactionMeta => ({
  value,
  label: t(`reaction.${value}` as MessageKey),
  icon: ICONS[value],
});

/** Symbole, mit denen man auf den Check-in des Partners reagiert. Immer mit Wort, nie nur ein Symbol. */
export const reactionList = (): ReactionMeta[] => (Object.keys(ICONS) as ReactionKind[]).map(meta);

export const reactionMeta = (value: string | null | undefined): ReactionMeta | undefined =>
  value && value in ICONS ? meta(value as ReactionKind) : undefined;
