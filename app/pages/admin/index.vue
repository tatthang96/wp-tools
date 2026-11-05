<script setup lang="ts">
import { useQuery } from '@pinia/colada'
import { pluginsQuery, usersStatsQuery } from '~/queries/wordpress'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Overview' })

const { user, siteName, siteUrl, sessions } = storeToRefs(useAuthStore())

const plugins = useQuery(pluginsQuery)
const usersStats = useQuery(usersStatsQuery)

interface StatResult {
  value: string
  caption: string
  error?: boolean
}

const number = new Intl.NumberFormat()

const loading = computed(() =>
  plugins.asyncStatus.value === 'loading' || usersStats.asyncStatus.value === 'loading'
)

function loadStats() {
  plugins.refetch()
  usersStats.refetch()
}

function failed(error: unknown): StatResult {
  return {
    value: '—',
    caption: error instanceof WpError ? error.message : 'Couldn\'t load this data.',
    error: true
  }
}

const pluginsResult = computed<StatResult | null>(() => {
  if (plugins.error.value) return failed(plugins.error.value)
  const list = plugins.data.value
  if (!list) return null
  const active = list.filter(p => p.status !== 'inactive').length
  return {
    value: number.format(list.length),
    caption: `${number.format(active)} active · ${number.format(list.length - active)} inactive`
  }
})

const usersResult = computed<StatResult | null>(() => {
  if (usersStats.error.value) return failed(usersStats.error.value)
  const stats = usersStats.data.value
  if (!stats) return null
  let caption = stats.newestName ? `Newest: ${stats.newestName}` : 'No users yet'
  if (stats.limited) caption = 'Authors with published posts (your role can\'t see all users)'
  return { value: number.format(stats.total), caption }
})

const stats = computed(() => [{
  label: 'Sites',
  icon: 'i-lucide-globe',
  result: {
    value: number.format(sessions.value.length),
    caption: sessions.value.length > 1
      ? `Connected · viewing ${siteUrl.value ? new URL(siteUrl.value).host : ''}`
      : (siteUrl.value ? new URL(siteUrl.value).host : '')
  } as StatResult
}, {
  label: 'Plugins',
  icon: 'i-lucide-plug',
  result: pluginsResult.value
}, {
  label: 'Users',
  icon: 'i-lucide-users',
  result: usersResult.value
}])

const activity = [
  { icon: 'i-lucide-plug', text: 'WooCommerce updated to 9.4 on shop.example.com', time: '10 min ago' },
  { icon: 'i-lucide-user-plus', text: 'New user jane@example.com registered', time: '1 hour ago' },
  { icon: 'i-lucide-shield-check', text: 'Security scan completed with no issues', time: '3 hours ago' },
  { icon: 'i-lucide-database', text: 'Nightly backup finished for 12 sites', time: 'Yesterday' }
]
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            label="Refresh"
            color="neutral"
            variant="ghost"
            :loading="loading"
            @click="loadStats"
          />
          <UColorModeButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <p class="text-muted">
          Welcome back, <span class="font-medium text-highlighted">{{ user?.name }}</span>.
          Connected to
          <ULink
            :to="siteUrl"
            target="_blank"
            class="font-medium text-primary"
          >
            {{ siteName }}
          </ULink>.
        </p>

        <div class="grid gap-4 sm:grid-cols-3">
          <UCard
            v-for="stat in stats"
            :key="stat.label"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <p class="text-sm text-muted">
                  {{ stat.label }}
                </p>
                <template v-if="stat.result">
                  <p class="mt-1 text-2xl font-semibold text-highlighted">
                    {{ stat.result.value }}
                  </p>
                  <p
                    class="mt-1 text-xs"
                    :class="stat.result.error ? 'text-error' : 'text-dimmed'"
                  >
                    {{ stat.result.caption }}
                  </p>
                </template>
                <template v-else>
                  <USkeleton class="mt-2 h-7 w-16" />
                  <USkeleton class="mt-2 h-3 w-32" />
                </template>
              </div>
              <UIcon
                :name="stat.icon"
                class="size-5 text-primary"
              />
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Recent activity
            </h2>
          </template>

          <ul class="divide-y divide-default">
            <li
              v-for="item in activity"
              :key="item.text"
              class="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <UIcon
                :name="item.icon"
                class="size-4 shrink-0 text-muted"
              />
              <span class="flex-1 text-sm text-default">{{ item.text }}</span>
              <span class="text-xs text-dimmed">{{ item.time }}</span>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
