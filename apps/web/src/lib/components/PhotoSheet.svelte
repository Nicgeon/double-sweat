<script lang="ts">
  import { api, ApiError, type Checkin, unwrap } from '#lib/api/client.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { longDate } from '#lib/util/format.ts';
  import { REACTIONS, type ReactionKind, reactionMeta } from '#lib/util/reactions.ts';
  import { tagMeta } from '#lib/util/tags.ts';
  import ApiImage from './ApiImage.svelte';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  type Props = {
    checkin: Checkin | null;
    mine: boolean;
    onclose: () => void;
    ondeleted: () => void;
    /** Nach einer Reaktion mit dem neuen Stand der Reaktionen dieses Check-ins. */
    onreacted?: (reactions: Checkin['reactions']) => void;
  };
  let { checkin, mine, onclose, ondeleted, onreacted }: Props = $props();
  let error = $state<string | null>(null);
  let busy = $state(false);
  const tag = $derived(tagMeta(checkin?.tag));
  let reacting = $state<ReactionKind | null>(null);
  /** Meine Reaktion (auf Check-ins des Partners) bzw. die des Partners (auf meine). */
  const mineKind = $derived(checkin?.reactions.find((r) => r.userId === session.user?.id)?.kind ?? null);
  const fromPartner = $derived(checkin?.reactions.find((r) => r.userId !== session.user?.id));

  /** Dieselbe Reaktion noch einmal antippen nimmt sie zurück. */
  async function react(kind: ReactionKind) {
    if (!checkin) return;
    error = null;
    reacting = kind;
    try {
      const id = checkin.id;
      const res =
        mineKind === kind
          ? unwrap(await api.DELETE('/api/v1/checkins/{id}/reaction', { params: { path: { id } } }))
          : unwrap(await api.PUT('/api/v1/checkins/{id}/reaction', { params: { path: { id } }, body: { kind } }));
      onreacted?.(res.reactions);
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    } finally {
      reacting = null;
    }
  }

  async function remove() {
    if (!checkin) return;
    error = null;
    busy = true;
    try {
      unwrap(await api.DELETE('/api/v1/checkins/{id}', { params: { path: { id: checkin.id } } }));
      ondeleted();
    } catch (e) {
      error = e instanceof ApiError ? e.message : 'Das hat nicht geklappt.';
    } finally {
      busy = false;
    }
  }
</script>

<Sheet open={checkin !== null} title={checkin ? `${checkin.displayName}, ${longDate(checkin.localDate)}` : ''} {onclose}>
  {#if checkin}
    <div class="stack">
      <ApiImage class="viewer" src={checkin.photo.fullUrl} alt="Foto von {checkin.displayName}" width={checkin.photo.width} height={checkin.photo.height} />
      {#if tag}<p class="row"><Icon name={tag.icon} size={18} /> {tag.label}</p>{/if}
      {#if checkin.note}<p>{checkin.note}</p>{/if}
      {#if !mine}
        <div class="ds-react" role="group" aria-label="Auf das Training von {checkin.displayName} reagieren">
          {#each REACTIONS as r (r.value)}
            <Button variant="secondary" size="sm" icon={r.icon} aria-pressed={mineKind === r.value} loading={reacting === r.value} onclick={() => react(r.value)}>{r.label}</Button>
          {/each}
        </div>
      {:else if fromPartner}
        {@const meta = reactionMeta(fromPartner.kind)}
        {#if meta}<p class="row"><Icon name={meta.icon} size={18} /> {fromPartner.displayName}: {meta.label}</p>{/if}
      {/if}
      {#if error}<Banner tone="error">{error}</Banner>{/if}
      {#if mine}<Button variant="secondary" icon="trash-2" loading={busy} onclick={remove}>Check-in zurücknehmen</Button>{/if}
    </div>
  {/if}
</Sheet>
