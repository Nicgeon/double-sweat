import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Die Seite hieß früher "Mehr" (/more), heute "Profil". Alte Links und Lesezeichen führen hierher weiter. */
export const load: PageLoad = ({ url }) => {
  redirect(308, `/profile${url.search}${url.hash}`);
};
