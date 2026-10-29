<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { NATIVE } from '#lib/native/flag.ts';
  import { loadPhoto } from '#lib/util/photo-cache.ts';

  type Props = { src: string; alt?: string; width?: number; height?: number; class?: string };
  let { src, alt = '', width, height, class: className = '' }: Props = $props();
  let blobUrl = $state<string | null>(null);
  let failed = $state(false);

  // App: geschütztes Foto mit Bearer-Token laden; Web: das Cookie genügt
  $effect(() => {
    if (!NATIVE) return;
    let cancelled = false;
    blobUrl = null;
    failed = false;
    loadPhoto(src)
      .then((url) => {
        if (!cancelled) blobUrl = url;
      })
      .catch(() => {
        if (!cancelled) failed = true;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if !NATIVE}
  <img {src} {alt} {width} {height} loading="lazy" class={className} />
{:else if blobUrl}
  <img src={blobUrl} {alt} {width} {height} class={className} />
{:else if failed}
  <span class="ds-photo__empty">{t('photo.unavailable')}</span>
{/if}
