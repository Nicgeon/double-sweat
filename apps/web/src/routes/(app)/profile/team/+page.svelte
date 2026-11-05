<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import Button from '#lib/components/Button.svelte';
  import Card from '#lib/components/Card.svelte';
  import InviteSheet from '#lib/components/InviteSheet.svelte';
  import Page from '#lib/components/Page.svelte';
  import { session } from '#lib/state/session.svelte.ts';
  import { longDate } from '#lib/util/format.ts';

  const team = $derived(session.team);
  let inviteOpen = $state(false);
</script>

<Page title={t('more.teamCard')} backHref="/profile">
  <div class="stack narrow">
    <Card title={team?.name}>
      <div class="stack">
        <ul class="list">
          {#each team?.members ?? [] as m (m.id)}
            <li class="line"><span>{m.isMe ? t('common.nameYou', { name: m.displayName }) : m.displayName}</span><span class="small muted">{m.timezone}</span></li>
          {/each}
        </ul>
        {#if team && !team.full}
          <Button icon="send" onclick={() => (inviteOpen = true)}>{t('more.invitePartner')}</Button>
          {#if team.invite}<p class="small muted">{t('more.inviteOpen', { date: longDate(new Date(team.invite.expiresAt).toISOString().slice(0, 10)) })}</p>{/if}
        {/if}
      </div>
    </Card>
  </div>
</Page>

<InviteSheet open={inviteOpen} onclose={() => (inviteOpen = false)} />
