<script lang="ts">
  import { goto } from '$app/navigation';
  import { pendingJoin } from '#lib/native/boot.svelte.ts';
  import { probeServer, ServerError } from '#lib/native/server-url.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Sheet from './Sheet.svelte';

  let error = $state<string | null>(null);
  let busy = $state(false);
  const link = $derived(pendingJoin.link);
  const host = $derived(link ? new URL(link.server).host : '');

  function close() {
    pendingJoin.link = null;
    error = null;
  }

  async function connect() {
    if (!link) return;
    busy = true;
    error = null;
    try {
      const info = await probeServer(link.server);
      if (session.serverUrl) await session.forgetServer();
      await session.useServer(link.server, info);
      const code = link.code;
      close();
      await goto(`/join/${code}`);
    } catch (e) {
      error = e instanceof ServerError ? e.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<Sheet open={link !== null} title="Mit diesem Server verbinden?" onclose={close}>
  <div class="stack">
    <p class="code">{host}</p>
    <p>Diese Einladung stammt von einem Server, mit dem die App noch nicht verbunden ist. Bestätige nur, wenn du ihn kennst: Dort legst du dein Konto an.</p>
    {#if session.serverUrl}
      <Banner tone="warning" title="Du wirst abgemeldet">Die App wechselt vom bisherigen Server ({new URL(session.serverUrl).host}) zu diesem.</Banner>
    {/if}
    {#if error}<Banner tone="error">{error}</Banner>{/if}
  </div>
  {#snippet footer()}
    <Button variant="ghost" onclick={close}>Abbrechen</Button>
    <Button loading={busy} onclick={connect}>Verbinden</Button>
  {/snippet}
</Sheet>
