<script setup lang="ts">
const auth = useAuthStore()
const { app } = useRuntimeConfig()

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: `${app.baseURL}favicon.ico` }
  ],
  htmlAttrs: {
    lang: 'en'
  },
  titleTemplate: title => title ? `${title} · WP Tools` : 'WP Tools'
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <!-- Keyed by the active site, so pages remount with fresh state after switching sites. -->
      <NuxtPage :page-key="route => `${auth.currentId ?? 'guest'}:${route.path}`" />
    </NuxtLayout>
  </UApp>
</template>
