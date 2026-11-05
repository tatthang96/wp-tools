<script setup lang="ts">
useHead({ title: 'Sign in' })

const route = useRoute()

function onConnected() {
  const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin')
    ? route.query.redirect
    : '/admin'
  navigateTo(redirect)
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UPageCard class="w-full max-w-md">
      <ConnectSiteForm @connected="onConnected" />
    </UPageCard>
  </div>
</template>
