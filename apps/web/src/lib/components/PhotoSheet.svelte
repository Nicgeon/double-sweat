<script lang="ts">
  import { api, ApiError, type Checkin, unwrap } from '#lib/api/client.ts';
  import { longDate } from '#lib/util/format.ts';
  import { tagMeta } from '#lib/util/tags.ts';
  import ApiImage from './ApiImage.svelte';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';

  type Props = { checkin: Checkin | null; mine: boolean; onclose: () => void; ondeleted: () => void };
  let { checkin, mine, onclose, ondeleted }: Props = $props();
  let error = $state<string | null>(null);
  let busy = $state(false);
  const tag = $derived(tagMeta(checkin?.tag));

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
      {#if error}<Banner tone="error">{error}</Banner>{/if}
      {#if mine}<Button variant="secondary" icon="trash-2" loading={busy} onclick={remove}>Check-in zurücknehmen</Button>{/if}
    </div>
  {/if}
</Sheet>
