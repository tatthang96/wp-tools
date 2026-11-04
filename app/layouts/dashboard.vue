<script setup lang="ts">
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'

const auth = useAuthStore()
const { user, siteUrl, siteName } = storeToRefs(auth)

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
  label: 'Users',
  icon: 'i-lucide-users',
  to: '/admin/users'
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/admin/settings'
}]]

async function signOut() {
  auth.logout()
  await navigateTo('/')
}

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
  label: 'Sign out',
  icon: 'i-lucide-log-out',
  onSelect: signOut
}]])
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar
      collapsible
      resizable
    >
      <template #header="{ collapsed }">
        <ULink
          :to="siteUrl"
          target="_blank"
          class="flex min-w-0 items-center gap-2 px-1"
          :title="siteUrl"
        >
          <UIcon
            name="i-simple-icons-wordpress"
            class="size-5 shrink-0 text-primary"
          />
          <span
            v-if="!collapsed"
            class="truncate font-semibold text-highlighted"
          >{{ siteName || 'WP Tools' }}</span>
        </ULink>
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
  </UDashboardGroup>
</template>
