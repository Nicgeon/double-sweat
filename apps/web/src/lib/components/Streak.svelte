<script lang="ts">
  import Icon from './Icon.svelte';

  let { weeks }: { weeks: number } = $props();
</script>

<span class="ds-streak">
  <Icon name="flame" size={18} />
  <span class="ds-num ds-streak__num">{weeks}</span>
  <span>{weeks === 1 ? 'Woche in Serie' : 'Wochen in Serie'}</span>
</span>
