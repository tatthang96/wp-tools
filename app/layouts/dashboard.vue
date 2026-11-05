<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const auth = useAuthStore()
const { user, siteUrl, sessions } = storeToRefs(auth)
const { signOutCurrent, signOutAll } = useSiteSwitch()
const addSiteOpen = useAddSiteDialog()

const links: NavigationMenuItem[][] = [[{
  label: 'Overview',
  icon: 'i-lucide-layout-dashboard',
  to: '/admin',
  exact: true
}, {
  label: 'Posts',
  icon: 'i-lucide-file-text',
  to: '/admin/posts'
}, {
  label: 'Blocks',
  icon: 'i-lucide-blocks',
  to: '/admin/blocks'
}, {
  label: 'Users',
  icon: 'i-lucide-users',
  to: '/admin/users'
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/admin/settings'
}]]

// The session can also end elsewhere, e.g. signing out in another tab.
whenever(() => !auth.loggedIn, () => navigateTo('/'))

const userMenu = computed<DropdownMenuItem[][]>(() => [[{
  label: user.value?.email || user.value?.username || '',
  type: 'label'
}], [{
  label: 'Open WP Admin',
  icon: 'i-simple-icons-wordpress',
  to: wpAdminUrl(siteUrl.value),
  target: '_blank'
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/admin/settings'
}], [{
  label: sessions.value.length > 1 ? 'Sign out of this site' : 'Sign out',
  icon: 'i-lucide-log-out',
  onSelect: signOutCurrent
}, ...(sessions.value.length > 1
  ? [{ label: 'Sign out of all sites', icon: 'i-lucide-log-out', color: 'error' as const, onSelect: signOutAll }]
  : [])]])

function onSiteAdded() {
  addSiteOpen.value = false
  navigateTo('/admin')
}
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      collapsible
      resizable
    >
      <template #header="{ collapsed }">
        <SiteSwitcher :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
        />
      </template>

      <template #footer="{ collapsed }">
        <UDropdownMenu
          :items="userMenu"
          :content="{ align: 'start', side: 'top' }"
          class="w-full"
        >
          <UButton
            :avatar="{ src: user?.avatar, alt: user?.name }"
            :label="collapsed ? undefined : user?.name"
            :square="collapsed"
            trailing-icon="i-lucide-chevrons-up-down"
            color="neutral"
            variant="ghost"
            block
            :ui="{ trailingIcon: collapsed ? 'hidden' : 'ms-auto text-dimmed' }"
          />
        </UDropdownMenu>
      </template>
    </UDashboardSidebar>

    <slot />

    <UModal
      v-model:open="addSiteOpen"
      title="Add a site"
      :ui="{ content: 'max-w-md' }"
    >
      <template #body>
        <ConnectSiteForm
          title="Connect another site"
          description="Add a WordPress site (or a multisite subsite) to switch between in the sidebar."
          @connected="onSiteAdded"
        />
      </template>
    </UModal>
  </UDashboardGroup>
</template>
