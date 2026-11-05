<script lang="ts">
  import { i18n, LANGUAGE_NAMES, LOCALES, type Locale, t } from '#lib/i18n/index.svelte.ts';
  import { api, ApiError, type PartnerColor, unwrap } from '#lib/api/client.ts';
  import Banner from '#lib/components/Banner.svelte';
  import Card from '#lib/components/Card.svelte';
  import ColorPicker from '#lib/components/ColorPicker.svelte';
  import Page from '#lib/components/Page.svelte';
  import Segmented from '#lib/components/Segmented.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { type ThemeChoice, theme } from '#lib/state/theme.svelte.ts';

  const user = $derived(session.user);
  const me = $derived(session.me);
  const partner = $derived(session.partner);

  let color = $state<PartnerColor>(session.user?.color ?? 'ember');
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);

  const fail = (e: unknown) => {
    error = e instanceof ApiError ? e.message : t('common.failed');
    notice = null;
  };
  const ok = (text: string) => {
    notice = text;
    error = null;
  };

  /** Sprache umstellen: sofort in der Oberfläche, dauerhaft am Konto (Mitteilungen und Mails folgen ihr). */
  async function chooseLanguage(locale: Locale) {
    const before = i18n.current;
    i18n.set(locale);
    try {
      unwrap(await api.PATCH('/api/v1/me', { body: { locale } }));
      await session.refresh();
      ok(t('more.languageSaved'));
    } catch (e) {
      i18n.set(before);
      fail(e);
    }
  }

  async function saveColor(c: PartnerColor) {
    try {
      unwrap(await api.PATCH('/api/v1/me', { body: { color: c } }));
      await session.refresh();
      ok(t('more.colorSaved'));
    } catch (e) {
      color = user?.color ?? color;
      fail(e);
    }
  }
</script>

<Page title={t('more.appearance')} backHref="/profile">
  {#if error}<Banner tone="error">{error}</Banner>{/if}
  {#if notice}<Banner tone="success">{notice}</Banner>{/if}

  <div class="stack narrow">
    <Card title={t('more.colorCard')}>
      <ColorPicker bind:value={color} seat={me?.slot ?? 1} taken={partner ? { [partner.color]: partner.displayName } : {}} onchange={saveColor} />
    </Card>

    <Card title={t('more.languageCard')}>
      <Segmented
        label={t('common.language')}
        value={i18n.current}
        onchange={chooseLanguage}
        options={LOCALES.map((value) => ({ value, label: LANGUAGE_NAMES[value] }))}
      />
    </Card>

    <Card title={t('profile.theme')}>
      <Segmented
        label={t('profile.theme')}
        value={theme.choice}
        onchange={(v: ThemeChoice) => theme.set(v)}
        options={[
          { value: 'light', label: t('more.themeLight'), icon: 'sun' },
          { value: 'dark', label: t('more.themeDark'), icon: 'moon' },
          { value: 'system', label: t('more.themeSystem'), icon: 'monitor' },
        ]}
      />
    </Card>
  </div>
</Page>
