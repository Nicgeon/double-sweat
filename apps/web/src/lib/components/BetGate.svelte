<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import { api, ApiError, unwrap } from '#lib/api/client.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { todayStore } from '#lib/state/today.svelte.ts';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Logo from './Logo.svelte';

  /** Name der anderen Person und ihr Einsatz (zur Orientierung), falls schon festgelegt. */
  type Props = { partnerName?: string; partnerBet?: string | null };
  let { partnerName, partnerBet = null }: Props = $props();

  let text = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);
  const name = $derived(partnerName ?? t('gate.anyone'));

  async function save() {
    error = null;
    busy = true;
    try {
      unwrap(await api.PUT('/api/v1/bets', { body: { text } }));
      // Mit dem frischen Stand fällt der Dialog weg
      await todayStore.load();
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
  async function signOut() {
    await session.logout();
    await goto('/login');
  }
</script>

<div class="auth">
  <div class="auth__box" role="dialog" aria-modal="true" aria-labelledby="gate-title">
    <Logo size={32} />
    <h1 class="auth__title" id="gate-title">{t('gate.title')}</h1>
    <p class="auth__lead">{t('gate.lead', { name })}</p>
    {#if partnerBet}<Banner tone="info">{t('gate.partnerSet', { name, bet: partnerBet })}</Banner>{/if}
    {#if error}<Banner tone="error">{error}</Banner>{/if}
    <form class="form" onsubmit={(e) => { e.preventDefault(); void save(); }}>
      <Field label={t('gate.field', { name })} bind:value={text} maxlength={140} placeholder={t('gate.placeholder')} hint={t('gate.hint')} required />
      <Button type="submit" size="lg" loading={busy}>{t('gate.save')}</Button>
    </form>
    <Button variant="ghost" onclick={signOut}>{t('common.signOut')}</Button>
  </div>
</div>
