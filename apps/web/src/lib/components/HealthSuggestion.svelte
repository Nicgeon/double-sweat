<script lang="ts">
  import { t, tn } from '#lib/i18n/index.svelte.ts';
  import type { HealthSession } from '#lib/native/plugins.ts';
  import { clockTime } from '#lib/util/format.ts';
  import { tagMeta } from '#lib/util/tags.ts';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  type Props = {
    /** Das Training, das vorgeschlagen wird (das jüngste von heute) */
    session: HealthSession;
    /** Wie viele weitere Trainings von heute noch offen sind */
    more?: number;
    ondismiss: () => void;
  };
  let { session, more = 0, ondismiss }: Props = $props();

  const meta = $derived(tagMeta(session.tag));
  const line = $derived(`${meta?.label ?? session.tag} · ${t('health.minutes', { n: session.minutes })} · ${clockTime(session.startMs)}`);
</script>

<!-- Ein Training aus Health Connect, für das noch kein Check-in da ist: ein Tipp führt mit vorbelegter Sportart zur Kamera -->
<section class="ds-card suggest" aria-label={t('health.detected')}>
  <div class="suggest__head">
    <span class="suggest__icon"><Icon name={meta?.icon ?? 'heart-pulse'} size={20} /></span>
    <div class="suggest__text">
      <strong>{t('health.detected')}</strong>
      <span class="suggest__line">{line}</span>
      {#if more > 0}<span class="small muted">{tn('health.more', more)}</span>{/if}
    </div>
  </div>
  <div class="suggest__actions">
    <Button size="sm" icon="camera" href={`/checkin?hc=${encodeURIComponent(session.id)}`}>{t('health.checkinNow')}</Button>
    <Button size="sm" variant="ghost" onclick={ondismiss}>{t('health.dismiss')}</Button>
  </div>
</section>

<style>
  .suggest {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .suggest__head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .suggest__icon {
    flex: none;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
  }

  .suggest__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    font: 400 14px / 20px var(--font-body);
  }

  .suggest__text strong {
    font-weight: 700;
  }

  .suggest__line {
    color: var(--ink-muted);
  }

  .suggest__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
