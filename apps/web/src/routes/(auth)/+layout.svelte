<script lang="ts">
  import Logo from '#lib/components/Logo.svelte';

  let { children } = $props();
</script>

<div class="auth">
  <div class="auth__box">
    <Logo size={32} />
    {@render children()}
  </div>
</div>
