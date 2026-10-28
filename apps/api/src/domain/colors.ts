/**
 * Identitätsfarben der Personen. Die Namen sind die Tokens aus design/tokens.json (Familie X, on-X, X-ink,
 * X-soft); die Reihenfolge ist die der Auswahl in der Oberfläche. Die Form (Kreis, Quadrat) gehört zum
 * Slot und ist unabhängig von der Farbe.
 */
export const PARTNER_COLORS = [
  'ember',
  'tide',
  'orchid',
  'moss',
  'sky',
  'cocoa',
  'graphite',
] as const;
export type PartnerColor = (typeof PARTNER_COLORS)[number];

export const SLOT_DEFAULT_COLOR: Record<number, PartnerColor> = { 1: 'ember', 2: 'tide' };

export function isPartnerColor(value: unknown): value is PartnerColor {
  return typeof value === 'string' && (PARTNER_COLORS as readonly string[]).includes(value);
}

/**
 * Wählt die Farbe für einen Teamplatz. Gewünscht oder bisherige Farbe, sonst der Standard des Slots, sonst die
 * erste freie der Palette. Nie die Farbe der anderen Person im Team.
 */
export function pickColor(
  slot: number,
  partnerColor: PartnerColor | null,
  preferred: PartnerColor | null = null,
): PartnerColor {
  const candidates = [preferred, SLOT_DEFAULT_COLOR[slot] ?? null, ...PARTNER_COLORS];
  const free = candidates.find((c): c is PartnerColor => c !== null && c !== partnerColor);
  return free ?? PARTNER_COLORS[0];
}
