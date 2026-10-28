<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';

  type Props = Omit<HTMLInputAttributes, 'prefix'> & {
    label: string;
    value?: string;
    hint?: string;
    error?: string | null;
    multiline?: boolean;
    suffix?: Snippet;
  };
  let { label, value = $bindable(''), hint, error, multiline = false, suffix, class: className = '', ...rest }: Props = $props();
  const id = $props.id();
  const describedBy = $derived([hint && !error ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined);
</script>

<div class="ds-field {error ? 'is-error' : ''} {className}">
  <label class="ds-field__label" for={id}>{label}</label>
  <div class="ds-field__control">
    {#if multiline}
      <textarea {id} class="ds-field__input" bind:value aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest as object}></textarea>
    {:else}
      <input {id} class="ds-field__input" bind:value aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
    {/if}
    {@render suffix?.()}
  </div>
  {#if hint && !error}<p class="ds-field__hint" id="{id}-hint">{hint}</p>{/if}
  {#if error}
    <p class="ds-field__error" id="{id}-error" role="alert"><Icon name="circle-alert" size={16} /> {error}</p>
  {/if}
</div>
