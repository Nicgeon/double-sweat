import type { PartnerColor } from '#lib/api/client.ts';

/** Palette in der Reihenfolge der Auswahl; Namen entsprechen den Tokens in design/tokens.json. */
export const PARTNER_COLORS: { value: PartnerColor; label: string }[] = [
  { value: 'ember', label: 'Glut' },
  { value: 'tide', label: 'Flut' },
  { value: 'orchid', label: 'Orchidee' },
  { value: 'moss', label: 'Moos' },
  { value: 'sky', label: 'Himmel' },
  { value: 'cocoa', label: 'Kakao' },
  { value: 'graphite', label: 'Graphit' },
];
