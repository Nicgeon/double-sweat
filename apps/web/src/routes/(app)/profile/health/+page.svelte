<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { onMount } from 'svelte';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import Icon from '#lib/components/Icon.svelte';
  import Page from '#lib/components/Page.svelte';
  import Toggle from '#lib/components/Toggle.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { HealthConnect } from '#lib/native/plugins.ts';
  import { healthStore } from '#lib/state/health.svelte.ts';
  import { clockTime } from '#lib/util/format.ts';
  import { tagMeta } from '#lib/util/tags.ts';

  let busy = $state(false);
  /** Die Erlaubnis wurde eben abgelehnt (der Schalter springt zurück). */
  let denied = $state(false);
  let on = $state(healthStore.enabled);

  const unusable = $derived(healthStore.availability === 'unavailable' || healthStore.availability === 'update_required');

  onMount(() => {
    void healthStore.refresh().then(() => (on = healthStore.enabled && healthStore.granted));
  });

  async function toggle(next: boolean) {
    denied = false;
    busy = true;
    try {
      if (next) {
        const ok = await healthStore.enable();
        on = ok;
        denied = !ok && healthStore.availability === 'available';
      } else {
        healthStore.disable();
        on = false;
      }
    } finally {
      busy = false;
    }
  }

  const call = (fn: () => Promise<void>) => () => void fn().catch(() => {});
</script>

<Page title={t('health.title')} backHref="/profile">
  <div class="stack narrow">
    {#if !NATIVE}
      <Banner tone="info">{t('health.browserOnly')}</Banner>
    {:else}
      <Card>
        <div class="stack stack--tight">
          <p>{t('health.intro')}</p>
          <p class="small muted">{t('health.privacy')}</p>
        </div>
      </Card>

      {#if healthStore.failed}<Banner tone="error">{t('health.failed')}</Banner>{/if}

      {#if healthStore.availability === 'unavailable'}
        <Banner tone="info">
          {t('health.unavailable')}
          {#snippet action()}<Button variant="secondary" size="sm" onclick={call(() => HealthConnect.openStore())}>{t('health.openStore')}</Button>{/snippet}
        </Banner>
      {:else if healthStore.availability === 'update_required'}
        <Banner tone="info">
          {t('health.updateRequired')}
          {#snippet action()}<Button variant="secondary" size="sm" onclick={call(() => HealthConnect.openStore())}>{t('health.openStore')}</Button>{/snippet}
        </Banner>
      {/if}

      <div class="ds-card ds-card--flush">
        <div class="ds-setting">
          <Toggle label={t('health.toggle')} hint={t('health.toggleHint')} bind:checked={on} disabled={busy || unusable} onchange={toggle} />
        </div>
      </div>

      {#if denied}
        <Banner tone="info">
          {t('health.denied')}
          {#snippet action()}<Button variant="secondary" size="sm" onclick={call(() => HealthConnect.openSettings())}>{t('health.openSettings')}</Button>{/snippet}
        </Banner>
      {/if}

      {#if healthStore.active}
        <section class="stack stack--tight" aria-labelledby="health-found">
          <h2 class="ds-overline" id="health-found">{t('health.found')}</h2>
          {#if healthStore.sessions.length === 0}
            <div class="ds-empty-row">
              <span class="ds-empty-row__icon"><Icon name="heart-pulse" size={20} /></span>
              <p class="small muted">{t('health.none')}</p>
            </div>
          {:else}
            <ul class="ds-card ds-card--flush list-reset">
              {#each healthStore.sessions as s (s.id)}
                {@const meta = tagMeta(s.tag)}
                <li class="ds-msg">
                  <span class="ds-tile"><Icon name={meta?.icon ?? 'activity'} size={20} /></span>
                  <span class="ds-msg__text">
                    <span class="ds-msg__title">{meta?.label ?? s.tag}</span>
                    <span class="ds-msg__cap">{t('health.minutes', { n: s.minutes })} · {clockTime(s.startMs)}</span>
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
          <div class="row">
            <Button variant="secondary" size="sm" icon="refresh-cw" onclick={() => void healthStore.refresh()}>{t('health.refresh')}</Button>
            <Button variant="ghost" size="sm" onclick={call(() => HealthConnect.openSettings())}>{t('health.openSettings')}</Button>
          </div>
        </section>
      {/if}
    {/if}
  </div>
</Page>

<style>
  .list-reset {
    list-style: none;
    margin: 0;
  }
</style>
