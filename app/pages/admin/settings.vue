<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Settings' })

const auth = useAuthStore()
const { user, siteUrl, siteName, session } = storeToRefs(auth)

const details = computed(() => [
  { label: 'Site', value: siteName.value },
  { label: 'Site URL', value: siteUrl.value, href: siteUrl.value },
  { label: 'Username', value: user.value?.username },
  { label: 'Display name', value: user.value?.name },
  { label: 'Email', value: user.value?.email || '—' },
  { label: 'Roles', value: user.value?.roles.join(', ') || '—' },
  { label: 'REST API', value: session.value?.root.pretty ? '/wp-json/' : '?rest_route= (plain permalinks)' }
])

async function signOut() {
  auth.logout()
  await navigateTo('/')
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-2xl space-y-6">
        <UPageCard
          title="WordPress connection"
          description="This dashboard is signed in to your site with an application password."
          variant="subtle"
        >
          <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
            <template
              v-for="item in details"
              :key="item.label"
            >
              <dt class="text-muted">
                {{ item.label }}
              </dt>
              <dd class="break-all text-highlighted">
                <ULink
                  v-if="item.href"
                  :to="item.href"
                  target="_blank"
                  class="text-primary"
                >
                  {{ item.value }}
                </ULink>
                <template v-else>
                  {{ item.value }}
                </template>
              </dd>
            </template>
          </dl>
        </UPageCard>

        <UPageCard
          title="Application password"
          description="Signing out removes the password from this browser only. To revoke access completely, delete the application password in WordPress."
          variant="subtle"
        >
          <div class="flex flex-wrap gap-2">
            <UButton
              :to="wpAdminUrl(siteUrl, 'profile.php#application-passwords-section')"
              target="_blank"
              icon="i-simple-icons-wordpress"
              label="Manage application passwords"
              color="neutral"
              variant="outline"
            />
            <UButton
              icon="i-lucide-log-out"
              label="Sign out"
              color="error"
              variant="soft"
              @click="signOut"
            />
          </div>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
