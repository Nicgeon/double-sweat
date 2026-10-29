<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  type Props = { busy?: boolean; disabled?: boolean; label?: string; onclick?: () => void };
  let { busy = false, disabled = false, label = t('camera.shutter'), onclick }: Props = $props();
</script>

<button type="button" class="ds-shutter {busy ? 'is-busy' : ''}" aria-label={label} aria-busy={busy || undefined} disabled={busy || disabled} {onclick}>
  <span class="ds-shutter__ring"><span class="ds-shutter__core"></span></span>
</button>
