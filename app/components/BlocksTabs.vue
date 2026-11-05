<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const items: NavigationMenuItem[] = [{
  label: 'Block types',
  icon: 'i-lucide-blocks',
  to: '/admin/blocks',
  exact: true
}, {
  label: 'Patterns',
  icon: 'i-lucide-layout-template',
  to: '/admin/blocks/patterns'
}]
</script>

<template>
  <UDashboardToolbar>
    <UNavigationMenu
      :items="items"
      highlight
      class="-mx-1 flex-1"
    />
  </UDashboardToolbar>
</template>
