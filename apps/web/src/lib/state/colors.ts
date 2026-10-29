import type { PartnerColor } from '#lib/api/client.ts';
import { type MessageKey, t } from '#lib/i18n/index.svelte.ts';

/** Palette in der Reihenfolge der Auswahl; Kennungen entsprechen den Tokens in design/tokens.json. */
const VALUES: PartnerColor[] = ['ember', 'tide', 'orchid', 'moss', 'sky', 'cocoa', 'graphite'];

export const colorName = (value: PartnerColor): string => t(`color.${value}` as MessageKey);

export const partnerColors = (): { value: PartnerColor; label: string }[] =>
  VALUES.map((value) => ({ value, label: colorName(value) }));

export const PARTNER_COLOR_VALUES = VALUES;
