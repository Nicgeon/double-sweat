import { IANAZone } from 'luxon';

/** Gültiger IANA-Zeitzonenname, z. B. "Europe/Berlin". */
export function isValidTimeZone(zone: string): boolean {
  return zone.length > 0 && zone.length <= 64 && IANAZone.isValidZone(zone);
}
