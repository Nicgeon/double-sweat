<script lang="ts">
  import LanguageSwitch from '#lib/components/LanguageSwitch.svelte';
  import Logo from '#lib/components/Logo.svelte';

  let { children } = $props();
</script>

<div class="auth">
  <div class="auth__box">
    <Logo size={32} />
    {@render children()}
    <LanguageSwitch />
  </div>
</div>
