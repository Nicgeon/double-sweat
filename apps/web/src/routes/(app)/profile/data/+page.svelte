<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { goto } from '$app/navigation';
  import { api, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import PasswordSheet from '#lib/components/PasswordSheet.svelte';
  import Page from '#lib/components/Page.svelte';
  import { NATIVE } from '#lib/native/flag.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { downloadExport } from '#lib/util/export.ts';

  const partner = $derived(session.partner);

  let notice = $state<string | null>(null);
  let sheet = $state<'' | 'export' | 'delete' | 'dissolve'>('');

  async function exportData(password: string) {
    const res = unwrap(await api.POST('/api/v1/me/export', { body: { password } }));
    sheet = '';
    await downloadExport(res.downloadUrl);
    notice = NATIVE ? t('more.exportReadyNative') : t('more.exportStarted');
  }
  async function dissolve(password: string) {
    unwrap(await api.DELETE('/api/v1/team', { body: { password } }));
    sheet = '';
    await session.refresh();
  }
  async function deleteAccount(password: string) {
    unwrap(await api.DELETE('/api/v1/me', { body: { password } }));
    session.clear();
    await goto('/login');
  }
</script>

<Page title={t('profile.dataTitle')} backHref="/profile">
  {#if notice}<Banner tone="success">{notice}</Banner>{/if}

  <div class="stack narrow">
    <Card title={t('profile.exportCard')}>
      <div class="stack">
        <p class="small muted">{t('more.exportBody')}</p>
        <Button variant="secondary" icon="download" onclick={() => (sheet = 'export')}>{t('more.export')}</Button>
      </div>
    </Card>

    <!-- Unwiderruflich: abgesetzt vom Alltäglichen, jede Aktion fragt das Passwort ab -->
    <section class="stack stack--tight" aria-labelledby="data-danger">
      <h2 class="ds-overline" id="data-danger">{t('profile.danger')}</h2>
      <div class="ds-card stack">
        <Button variant="secondary" icon="trash-2" onclick={() => (sheet = 'dissolve')}>{t('more.dissolve')}</Button>
        <Button variant="danger" icon="trash-2" onclick={() => (sheet = 'delete')}>{t('more.deleteAccount')}</Button>
      </div>
    </section>
  </div>
</Page>

<PasswordSheet open={sheet === 'export'} title={t('more.exportTitle')} confirmLabel={t('more.exportStart')} onclose={() => (sheet = '')} onconfirm={exportData}>
  <p>{t('more.exportBody')}</p>
</PasswordSheet>

<PasswordSheet open={sheet === 'dissolve'} title={t('more.dissolveTitle')} confirmLabel={t('more.dissolve')} danger onclose={() => (sheet = '')} onconfirm={dissolve}>
  <p>{t('more.dissolveBody')}{partner ? ` ${t('more.dissolveNotify', { name: partner.displayName })}` : ''}</p>
</PasswordSheet>

<PasswordSheet open={sheet === 'delete'} title={t('more.deleteTitle')} confirmLabel={t('more.deleteAccount')} danger onclose={() => (sheet = '')} onconfirm={deleteAccount}>
  <p>{t('more.deleteBody')}{partner ? ` ${t('more.deleteKeeps', { name: partner.displayName })}` : ''}</p>
</PasswordSheet>
