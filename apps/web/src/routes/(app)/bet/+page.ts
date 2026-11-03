import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Die Seite hieß früher "Einsatz" (/bet). Alte Links, Lesezeichen und gespeicherte Mitteilungen führen hierher weiter. */
export const load: PageLoad = ({ url }) => {
  redirect(308, `/deal${url.search}${url.hash}`);
};
