<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import Icon from './Icon.svelte';

  /** `more`: heute schon eingecheckt, die Schaltfläche tritt zurück ("Noch ein Check-in"). */
  let { more = false }: { more?: boolean } = $props();
</script>

<a class="ds-fab {more ? 'ds-fab--quiet' : ''}" href="/checkin">
  <Icon name="camera" size={24} />
  <span>{more ? t('nav.checkinMore') : t('nav.checkin')}</span>
</a>
