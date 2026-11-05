<script lang="ts">
  import { t } from '#lib/i18n/index.svelte.ts';
  import { api, ApiError, type Checkin, unwrap } from '#lib/api/client.ts';
  import { session } from '#lib/state/session.svelte.ts';
  import { longDate } from '#lib/util/format.ts';
  import { type ReactionKind, reactionList, reactionMeta } from '#lib/util/reactions.ts';
  import { isTag, type TagValue, tagList, tagMeta } from '#lib/util/tags.ts';
  import ApiImage from './ApiImage.svelte';
  import Banner from './Banner.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Icon from './Icon.svelte';
  import Segmented from './Segmented.svelte';
  import Sheet from './Sheet.svelte';

  type Props = {
    checkin: Checkin | null;
    mine: boolean;
    onclose: () => void;
    ondeleted: () => void;
    /** Nach einer Reaktion mit dem neuen Stand der Reaktionen dieses Check-ins. */
    /** `id` gehört zum Check-in, auf den reagiert wurde; das Fenster kann bei der Antwort schon zu sein. */
    onreacted?: (id: string, reactions: Checkin['reactions']) => void;
    /** Nach dem Ändern von Sportart oder Notiz mit dem neuen Stand dieses Check-ins. */
    onupdated?: (checkin: Checkin) => void;
  };
  let { checkin, mine, onclose, ondeleted, onreacted, onupdated }: Props = $props();
  let error = $state<string | null>(null);
  let busy = $state(false);
  /** Sportart und Notiz werden bearbeitet (nur eigene Check-ins). */
  let editing = $state(false);
  let editTag = $state<TagValue | null>(null);
  let editNote = $state('');
  let saved = $state(false);
  const tag = $derived(tagMeta(checkin?.tag));
  let reacting = $state<ReactionKind | null>(null);
  /** Antippen des kleinen Bildes tauscht Foto und Selfie. */
  let selfieLarge = $state(false);
  // Ein anderes Foto (oder ein geschlossenes Fenster) beendet das Bearbeiten. Es zählt die ID: ein neuer Stand
  // desselben Check-ins (Reaktion, gespeicherte Änderung) setzt nichts zurück.
  const checkinId = $derived(checkin?.id);
  $effect(() => {
    void checkinId;
    selfieLarge = false;
    editing = false;
    saved = false;
    error = null;
  });

  function startEdit() {
    if (!checkin) return;
    editTag = isTag(checkin.tag) ? checkin.tag : null;
    editNote = checkin.note ?? '';
    saved = false;
    error = null;
    editing = true;
  }

  async function saveEdit() {
    if (!checkin) return;
    error = null;
    busy = true;
    try {
      const id = checkin.id;
      const res = unwrap(
        await api.PATCH('/api/v1/checkins/{id}', {
          params: { path: { id } },
          // Ein leeres Notizfeld entfernt die Notiz; die Sportart bleibt, wenn sie nicht gewählt wurde
          body: { note: editNote.trim() === '' ? null : editNote, ...(editTag ? { tag: editTag } : {}) },
        }),
      );
      editing = false;
      saved = true;
      onupdated?.(res.checkin);
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
  const big = $derived(selfieLarge && checkin?.selfie ? checkin.selfie : checkin?.photo);
  const small = $derived(selfieLarge ? checkin?.photo : checkin?.selfie);
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
      onreacted?.(id, res.reactions);
    } catch (e) {
      error = e instanceof ApiError ? e.message : t('common.failed');
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
      error = e instanceof ApiError ? e.message : t('common.failed');
    } finally {
      busy = false;
    }
  }
</script>

<Sheet open={checkin !== null} title={checkin ? `${checkin.displayName}, ${longDate(checkin.localDate)}` : ''} {onclose}>
  {#if checkin}
    <div class="stack">
      <div class="viewer-wrap">
        {#if big}<ApiImage class="viewer" src={big.fullUrl} alt={selfieLarge ? t('photo.selfieOf', { name: checkin.displayName }) : t('photo.of', { name: checkin.displayName })} width={big.width} height={big.height} />{/if}
        {#if small}
          <button type="button" class="selfie-inset" aria-label={selfieLarge ? t('photo.showPhoto') : t('photo.showSelfie')} onclick={() => (selfieLarge = !selfieLarge)} data-testid="selfie-swap">
            <ApiImage src={small.thumbUrl} alt="" />
          </button>
        {/if}
      </div>
      {#if editing}
        <form class="stack stack--tight" onsubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
          <div>
            <p class="ds-field__label">{t('checkin.workout')}</p>
            <Segmented wrap label={t('checkin.workout')} options={tagList()} bind:value={editTag} />
          </div>
          <Field label={t('checkin.note')} multiline maxlength={280} placeholder={t('checkin.notePlaceholder')} bind:value={editNote} />
          {#if error}<Banner tone="error">{error}</Banner>{/if}
          <div class="row">
            <Button type="submit" icon="check" loading={busy}>{t('common.save')}</Button>
            <Button variant="ghost" onclick={() => { editing = false; error = null; }}>{t('common.cancel')}</Button>
          </div>
        </form>
      {:else}
        {#if tag}<p class="row"><Icon name={tag.icon} size={18} /> {tag.label}</p>{/if}
        {#if checkin.note}<p>{checkin.note}</p>{/if}
      {/if}
      {#if saved && !editing}<Banner tone="success">{t('photo.saved')}</Banner>{/if}
      {#if !mine}
        <div class="ds-react" role="group" aria-label={t('photo.reactTo', { name: checkin.displayName })}>
          {#each reactionList() as r (r.value)}
            <Button variant="secondary" size="sm" icon={r.icon} aria-pressed={mineKind === r.value} loading={reacting === r.value} onclick={() => react(r.value)}>{r.label}</Button>
          {/each}
        </div>
      {:else if fromPartner}
        {@const meta = reactionMeta(fromPartner.kind)}
        {#if meta}<p class="row"><Icon name={meta.icon} size={18} /> {fromPartner.displayName}: {meta.label}</p>{/if}
      {/if}
      {#if error && !editing}<Banner tone="error">{error}</Banner>{/if}
      {#if mine && !editing}
        <div class="row">
          <Button variant="secondary" icon="pencil" onclick={startEdit}>{t('photo.edit')}</Button>
          <Button variant="secondary" icon="trash-2" loading={busy} onclick={remove}>{t('photo.undo')}</Button>
        </div>
      {/if}
    </div>
  {/if}
</Sheet>
