<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import Icon from './Icon.svelte';

  let { weeks }: { weeks: number } = $props();
</script>

<span class="ds-streak">
  <Icon name="flame" size={18} />
  <span class="ds-num ds-streak__num">{weeks}</span>
  <span>{tn('streak.label', weeks)}</span>
</span>
