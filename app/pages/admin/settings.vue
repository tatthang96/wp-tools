<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Settings' })

const auth = useAuthStore()
const { user, siteUrl, siteName, session, sessions, currentId } = storeToRefs(auth)
const { switchSite, signOutCurrent } = useSiteSwitch()
const addSiteOpen = useAddSiteDialog()

const sites = computed(() => sessions.value.map(s => ({
  id: sessionId(s),
  name: s.siteName,
  url: s.root.siteUrl,
  user: s.user.name,
  avatar: s.user.avatar,
  remembered: auth.isRemembered(sessionId(s))
})))

const details = computed(() => [
  { label: 'Site', value: siteName.value },
  { label: 'Site URL', value: siteUrl.value, href: siteUrl.value },
  { label: 'Username', value: user.value?.username },
  { label: 'Display name', value: user.value?.name },
  { label: 'Email', value: user.value?.email || '—' },
  { label: 'Roles', value: user.value?.roles.join(', ') || '—' },
  { label: 'REST API', value: session.value?.root.pretty ? '/wp-json/' : '?rest_route= (plain permalinks)' }
])

function removeSite(id: string) {
  if (id === currentId.value) signOutCurrent()
  else auth.removeSession(id)
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
          title="Connected sites"
          description="Sites saved in this browser. Switch between them from the site menu at the top of the sidebar."
          variant="subtle"
        >
          <ul class="divide-y divide-default">
            <li
              v-for="site in sites"
              :key="site.id"
              class="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <UAvatar
                :src="site.avatar"
                :alt="site.user"
                size="sm"
              />
              <div class="min-w-0 flex-1">
                <p class="flex items-center gap-2 truncate text-sm font-medium text-highlighted">
                  {{ site.name }}
                  <UBadge
                    v-if="site.id === currentId"
                    label="Active"
                    color="primary"
                    variant="subtle"
                    size="sm"
                  />
                </p>
                <p class="truncate text-xs text-muted">
                  {{ site.url }} · {{ site.user }} · {{ site.remembered ? 'remembered on this device' : 'this tab only' }}
                </p>
              </div>
              <UButton
                v-if="site.id !== currentId"
                label="Switch"
                color="neutral"
                variant="outline"
                size="sm"
                @click="switchSite(site.id)"
              />
              <UButton
                label="Sign out"
                color="error"
                variant="ghost"
                size="sm"
                @click="removeSite(site.id)"
              />
            </li>
          </ul>
          <div>
            <UButton
              label="Add site"
              icon="i-lucide-plus"
              color="neutral"
              variant="outline"
              @click="addSiteOpen = true"
            />
          </div>
        </UPageCard>

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
              label="Sign out of this site"
              color="error"
              variant="soft"
              @click="signOutCurrent"
            />
          </div>
        </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
