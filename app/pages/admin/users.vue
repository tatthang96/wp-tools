<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import { usersListQuery, type UsersSort, type WpListUser } from '~/queries/wordpress'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Users' })

const PER_PAGE = 20

const { siteUrl } = storeToRefs(useAuthStore())

const search = ref('')
const debouncedSearch = refDebounced(computed(() => search.value.trim()), 300)
const role = ref('all')
const sort = ref<UsersSort>('newest')
const page = ref(1)

// WordPress has no REST endpoint for listing roles, so offer the core ones.
const roleOptions = [
  { label: 'All roles', value: 'all' },
  { label: 'Administrator', value: 'administrator' },
  { label: 'Editor', value: 'editor' },
  { label: 'Author', value: 'author' },
  { label: 'Contributor', value: 'contributor' },
  { label: 'Subscriber', value: 'subscriber' }
]

const sortOptions: { label: string, value: UsersSort }[] = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Name A–Z', value: 'name' }
]

const { data, error, asyncStatus, refetch } = useQuery(() => usersListQuery({
  page: page.value,
  perPage: PER_PAGE,
  search: debouncedSearch.value,
  role: role.value,
  sort: sort.value
}))

const users = computed(() => error.value ? [] : data.value?.users ?? [])
const total = computed(() => error.value ? 0 : data.value?.total ?? 0)
const fullAccess = computed(() => data.value?.fullAccess ?? true)
const loading = computed(() => asyncStatus.value === 'loading')
const errorMessage = computed(() => {
  if (!error.value) return null
  return error.value instanceof WpError ? error.value.message : 'Couldn\'t load users.'
})

function loadUsers() {
  refetch()
}

// New filters start from the first page. `sync` resets the page before the query
// key is re-evaluated, so we don't fetch the old page number with the new filters.
watch([debouncedSearch, role, sort], () => {
  page.value = 1
}, { flush: 'sync' })

const rangeLabel = computed(() => {
  if (!total.value) return ''
  const from = (page.value - 1) * PER_PAGE + 1
  const to = Math.min(page.value * PER_PAGE, total.value)
  return `Showing ${from}–${to} of ${new Intl.NumberFormat().format(total.value)} users`
})

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

function formatRegistered(value?: string) {
  if (!value) return '—'
  // WordPress returns user_registered in UTC without a timezone suffix.
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date)
}

function roleLabel(value: string) {
  return value.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

const UAvatar = resolveComponent('UAvatar')
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const columns = computed<TableColumn<WpListUser>[]>(() => {
  const cols: TableColumn<WpListUser>[] = [{
    id: 'user',
    header: 'User',
    cell: ({ row }) => {
      const user = row.original
      return h('div', { class: 'flex items-center gap-3' }, [
        h(UAvatar, { src: user.avatar_urls?.['48'] ?? user.avatar_urls?.['96'], alt: user.name, size: 'md' }),
        h('div', { class: 'min-w-0' }, [
          h('p', { class: 'truncate font-medium text-highlighted' }, user.name),
          h('p', { class: 'truncate text-xs text-muted' }, `@${user.username ?? user.slug}`)
        ])
      ])
    }
  }]

  if (fullAccess.value) {
    cols.push({
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => row.original.email || '—'
    }, {
      id: 'roles',
      header: 'Role',
      cell: ({ row }) => {
        const roles = row.original.roles ?? []
        if (!roles.length) return h('span', { class: 'text-dimmed' }, 'None')
        return h('div', { class: 'flex flex-wrap gap-1' }, roles.map(r => h(UBadge, {
          label: roleLabel(r),
          color: r === 'administrator' ? 'primary' : 'neutral',
          variant: 'subtle'
        })))
      }
    }, {
      id: 'registered',
      header: 'Registered',
      cell: ({ row }) => formatRegistered(row.original.registered_date)
    })
  }

  // Only roles that can list users can edit them in WP Admin.
  if (fullAccess.value) {
    cols.push({
      id: 'actions',
      header: '',
      cell: ({ row }) => h('div', { class: 'flex justify-end' }, h(UButton, {
        to: wpAdminUrl(siteUrl.value, `user-edit.php?user_id=${row.original.id}`),
        target: '_blank',
        icon: 'i-lucide-external-link',
        label: 'Edit',
        color: 'neutral',
        variant: 'ghost',
        size: 'sm'
      }))
    })
  }

  return cols
})
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <UDashboardNavbar title="Users">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            aria-label="Refresh"
            :loading="loading"
            @click="loadUsers"
          />
          <UButton
            :to="wpAdminUrl(siteUrl, 'user-new.php')"
            target="_blank"
            icon="i-lucide-user-plus"
            label="Add user"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search users..."
            class="w-full sm:w-64"
          />
        </template>
        <template #right>
          <USelect
            v-model="role"
            :items="roleOptions"
            :disabled="!fullAccess"
            class="w-40"
          />
          <USelect
            v-model="sort"
            :items="sortOptions"
            class="w-40"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="errorMessage"
          :description="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
        />
        <UAlert
          v-else-if="!fullAccess"
          description="Your role can't list all users, so only authors with published posts are shown, without emails or roles."
          color="info"
          variant="subtle"
          icon="i-lucide-info"
        />

        <UTable
          :data="users"
          :columns="columns"
          :loading="loading"
          :empty="debouncedSearch || role !== 'all' ? 'No users match your filters.' : 'No users found.'"
        />

        <div
          v-if="total > PER_PAGE || rangeLabel"
          class="flex flex-wrap items-center justify-between gap-3"
        >
          <p class="text-sm text-muted">
            {{ rangeLabel }}
          </p>
          <UPagination
            v-if="total > PER_PAGE"
            v-model:page="page"
            :total="total"
            :items-per-page="PER_PAGE"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
