<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

// Sidebar header: the active site, with a menu to switch between saved sites.
defineProps<{ collapsed?: boolean }>()

const auth = useAuthStore()
const { siteName, siteUrl, sessions, currentId } = storeToRefs(auth)
const { switchSite } = useSiteSwitch()
const addSiteOpen = useAddSiteDialog()

const items = computed<DropdownMenuItem[][]>(() => [
  [{ label: 'Sites', type: 'label' }],
  sessions.value.map((s) => {
    const id = sessionId(s)
    return {
      label: s.siteName,
      description: `${new URL(s.root.siteUrl).host}${s.root.siteUrl.replace(/^https?:\/\/[^/]+/, '')} · ${s.user.name}`,
      type: 'checkbox' as const,
      checked: id === currentId.value,
      onSelect: () => switchSite(id)
    }
  }),
  [{
    label: 'Add site',
    icon: 'i-lucide-plus',
    onSelect: () => {
      addSiteOpen.value = true
    }
  }, {
    label: 'Manage sites',
    icon: 'i-lucide-settings',
    to: '/admin/settings'
  }, {
    label: 'Open site',
    icon: 'i-lucide-external-link',
    to: siteUrl.value,
    target: '_blank'
  }]
])
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start' }"
    :ui="{ content: 'w-72' }"
    class="w-full"
  >
    <UButton
      icon="i-simple-icons-wordpress"
      :label="collapsed ? undefined : (siteName || 'WP Tools')"
      :square="collapsed"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      class="font-semibold"
      :ui="{ leadingIcon: 'text-primary', label: 'truncate', trailingIcon: 'ms-auto text-dimmed' }"
    />
  </UDropdownMenu>
</template>
