<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import {
  fetchAuthors,
  fetchTerms,
  postsListQuery,
  postTypesQuery,
  restPath,
  siteKey,
  taxonomiesQuery,
  type PostsDateFilter,
  type PostsSort,
  type PostStatusFilter,
  type WpPost,
  type WpTaxonomy
} from '~/queries/wordpress'
import type { RemoteSelectItem } from '~/components/RemoteSelectMenu.vue'

definePageMeta({ layout: 'dashboard' })

const PER_PAGE = 20

const { siteUrl } = storeToRefs(useAuthStore())
const { runAction, running } = usePostActions()

// --- Filter options ---------------------------------------------------------

const statusOptions: { label: string, value: PostStatusFilter }[] = [
  { label: 'All statuses', value: 'all' },
  { label: 'Published', value: 'publish' },
  { label: 'Scheduled', value: 'future' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Pending review', value: 'pending' },
  { label: 'Private', value: 'private' },
  { label: 'Trash', value: 'trash' }
]

const dateOptions: { label: string, value: PostsDateFilter }[] = [
  { label: 'Any date', value: 'any' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 12 months', value: '12m' }
]

const sortOptions: { label: string, value: PostsSort }[] = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Recently modified', value: 'modified' },
  { label: 'Title A–Z', value: 'title' }
]

// --- Filter state, initialised from (and kept in) the URL ---------------------

const route = useRoute()
const router = useRouter()

function queryString(key: string) {
  const value = route.query[key]
  return typeof value === 'string' ? value : undefined
}

function queryId(key: string) {
  const value = Number(queryString(key))
  return Number.isInteger(value) && value > 0 ? value : undefined
}

function queryOption<T extends string>(key: string, options: { value: T }[], fallback: T): T {
  const value = queryString(key)
  return options.find(o => o.value === value)?.value ?? fallback
}

const type = ref(queryString('type') ?? 'post')
const status = ref(queryOption('status', statusOptions, 'all'))
const search = ref(queryString('s') ?? '')
const author = ref(queryId('author'))
const terms = ref<Record<string, number | undefined>>(Object.fromEntries(
  Object.keys(route.query)
    .filter(key => key.startsWith('tax_'))
    .map(key => [key.slice(4), queryId(key)])
))
const date = ref(queryOption('date', dateOptions, 'any'))
const sort = ref(queryOption('sort', sortOptions, 'newest'))
const page = ref(queryId('page') ?? 1)

const debouncedSearch = refDebounced(computed(() => search.value.trim()), 300)

const termFilters = computed(() => Object.fromEntries(
  Object.entries(terms.value).filter((entry): entry is [string, number] => entry[1] !== undefined)
))

const hasFilters = computed(() =>
  !!debouncedSearch.value || status.value !== 'all' || author.value !== undefined
  || Object.keys(termFilters.value).length > 0 || date.value !== 'any'
)

function clearFilters() {
  search.value = ''
  status.value = 'all'
  author.value = undefined
  terms.value = {}
  date.value = 'any'
}

// Term filters belong to the previous post type's taxonomies.
watch(type, () => {
  terms.value = {}
}, { flush: 'sync' })

// New filters start from page 1. `sync` resets the page before the query key is
// re-evaluated, so we don't fetch the old page number with the new filters.
watch([type, debouncedSearch, status, author, termFilters, date, sort], () => {
  page.value = 1
}, { flush: 'sync' })

watch([type, status, debouncedSearch, author, termFilters, date, sort, page], () => {
  router.replace({
    query: {
      type: type.value !== 'post' ? type.value : undefined,
      status: status.value !== 'all' ? status.value : undefined,
      s: debouncedSearch.value || undefined,
      author: author.value,
      ...Object.fromEntries(Object.entries(termFilters.value).map(([base, id]) => [`tax_${base}`, id])),
      date: date.value !== 'any' ? date.value : undefined,
      sort: sort.value !== 'newest' ? sort.value : undefined,
      page: page.value > 1 ? page.value : undefined
    }
  })
})

// --- Data --------------------------------------------------------------------

const { data: postTypes } = useQuery(postTypesQuery)
const currentType = computed(() => postTypes.value?.find(t => t.slug === type.value))
const typeOptions = computed(() => (postTypes.value ?? []).map(t => ({ label: t.name, value: t.slug })))

// Fall back to the first available type if the URL names one the site doesn't have.
watchImmediate(postTypes, (types) => {
  if (types?.length && !types.some(t => t.slug === type.value)) type.value = types[0]!.slug
})

const { data: taxonomies } = useQuery(() => taxonomiesQuery(type.value))

const { data, error, asyncStatus, refetch } = useQuery(() => postsListQuery({
  path: currentType.value ? restPath(currentType.value) : '',
  page: page.value,
  perPage: PER_PAGE,
  search: debouncedSearch.value,
  status: status.value,
  author: author.value ?? null,
  terms: termFilters.value,
  date: date.value,
  sort: sort.value
}))

const posts = computed(() => error.value ? [] : data.value?.posts ?? [])
const total = computed(() => error.value ? 0 : data.value?.total ?? 0)
const fullAccess = computed(() => data.value?.fullAccess ?? true)
const loading = computed(() => asyncStatus.value === 'loading')
const errorMessage = computed(() => {
  if (!error.value) return null
  return error.value instanceof WpError ? error.value.message : 'Couldn\'t load posts.'
})

const typeName = computed(() => currentType.value?.name ?? 'Posts')
useHead({ title: typeName })

const rangeLabel = computed(() => {
  if (!total.value) return ''
  const from = (page.value - 1) * PER_PAGE + 1
  const to = Math.min(page.value * PER_PAGE, total.value)
  return `Showing ${from}–${to} of ${new Intl.NumberFormat().format(total.value)}`
})

// --- Filter menus --------------------------------------------------------------

const authorsKey = computed(() => [...siteKey(), 'authors'])

async function authorItems(term: string): Promise<RemoteSelectItem[]> {
  const users = await fetchAuthors(term)
  return users.map(u => ({ label: u.name, value: u.id, avatar: { src: u.avatar_urls?.['24'], alt: u.name } }))
}

function termItems(taxonomy: WpTaxonomy) {
  return async (term: string): Promise<RemoteSelectItem[]> => {
    const list = await fetchTerms(taxonomy, term)
    return list.map(t => ({ label: stripTags(t.name), value: t.id }))
  }
}

// --- Selection & actions -------------------------------------------------------

const rowSelection = ref<Record<string, boolean>>({})
watch(posts, () => {
  rowSelection.value = {}
})

const selectedPosts = computed(() => Object.entries(rowSelection.value)
  .filter(([, selected]) => selected)
  .map(([index]) => posts.value[Number(index)])
  .filter((post): post is WpPost => !!post)
)

const confirmDelete = ref<WpPost[] | null>(null)
const confirmOpen = computed({
  get: () => !!confirmDelete.value,
  set: (open) => {
    if (!open) confirmDelete.value = null
  }
})

async function act(action: 'trash' | 'restore' | 'publish' | 'delete', targets: WpPost[]) {
  if (!currentType.value || !targets.length) return
  await runAction(action, restPath(currentType.value), targets)
}

async function deleteConfirmed() {
  const targets = confirmDelete.value ?? []
  confirmDelete.value = null
  await act('delete', targets)
}

const canPublishSelection = computed(() => selectedPosts.value.some(p => p.status === 'draft' || p.status === 'pending'))

// --- Table -----------------------------------------------------------------------

const STATUS_BADGES: Record<string, { label: string, color: 'success' | 'info' | 'neutral' | 'warning' | 'secondary' | 'error' }> = {
  publish: { label: 'Published', color: 'success' },
  future: { label: 'Scheduled', color: 'info' },
  draft: { label: 'Draft', color: 'neutral' },
  pending: { label: 'Pending', color: 'warning' },
  private: { label: 'Private', color: 'secondary' },
  trash: { label: 'Trash', color: 'error' }
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function formatDate(value: string) {
  // WordPress returns `date`/`modified` in the site's timezone without an offset; show them as-is.
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed)
}

function postTitle(post: WpPost) {
  // Even `raw` titles can contain entities (WordPress encodes & for users without unfiltered_html).
  return stripTags(post.title.raw ?? post.title.rendered) || '(no title)'
}

function editUrl(post: WpPost) {
  return wpAdminUrl(siteUrl.value, `post.php?post=${post.id}&action=edit`)
}

function rowActions(post: WpPost): DropdownMenuItem[][] {
  if (post.status === 'trash') {
    return [[
      { label: 'Restore as draft', icon: 'i-lucide-undo-2', onSelect: () => act('restore', [post]) }
    ], [
      { label: 'Delete permanently', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { confirmDelete.value = [post] } }
    ]]
  }

  const isPublic = post.status === 'publish' || post.status === 'private'
  const main: DropdownMenuItem[] = [
    { label: 'Edit in WP Admin', icon: 'i-lucide-pencil', to: editUrl(post), target: '_blank' },
    isPublic
      ? { label: 'View', icon: 'i-lucide-external-link', to: post.link, target: '_blank' }
      : { label: 'Preview', icon: 'i-lucide-eye', to: `${post.link}${post.link.includes('?') ? '&' : '?'}preview=true`, target: '_blank' }
  ]
  if (post.status === 'draft' || post.status === 'pending') {
    main.push({ label: 'Publish', icon: 'i-lucide-send', onSelect: () => act('publish', [post]) })
  }
  return [main, [
    { label: 'Move to Trash', icon: 'i-lucide-trash', color: 'error', onSelect: () => act('trash', [post]) }
  ]]
}

const UAvatar = resolveComponent('UAvatar')
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const ULink = resolveComponent('ULink')

// At most two taxonomy columns (e.g. Categories and Tags) to keep the table readable.
const taxonomyColumns = computed(() => (taxonomies.value ?? []).slice(0, 2))

const columns = computed<TableColumn<WpPost>[]>(() => {
  const cols: TableColumn<WpPost>[] = []

  if (fullAccess.value) {
    cols.push({
      id: 'select',
      header: ({ table }) => h(UCheckbox, {
        'modelValue': table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(!!value),
        'aria-label': 'Select all'
      }),
      cell: ({ row }) => h(UCheckbox, {
        'modelValue': row.getIsSelected(),
        'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
        'aria-label': 'Select row'
      })
    })
  }

  cols.push({
    id: 'title',
    header: 'Title',
    cell: ({ row }) => {
      const post = row.original
      const badges = []
      if (post.status !== 'publish' && STATUS_BADGES[post.status]) {
        badges.push(h(UBadge, { ...STATUS_BADGES[post.status], variant: 'subtle', size: 'sm' }))
      }
      if (post.sticky) badges.push(h(UBadge, { label: 'Sticky', color: 'neutral', variant: 'outline', size: 'sm' }))
      return h('div', { class: 'flex min-w-0 max-w-md flex-wrap items-center gap-2' }, [
        h(ULink, {
          to: fullAccess.value ? editUrl(post) : post.link,
          target: '_blank',
          class: 'truncate font-medium text-highlighted hover:text-primary'
        }, () => postTitle(post)),
        ...badges
      ])
    }
  }, {
    id: 'author',
    header: 'Author',
    cell: ({ row }) => {
      const author = row.original._embedded?.author?.[0]
      if (!author) return h('span', { class: 'text-dimmed' }, '—')
      return h('div', { class: 'flex items-center gap-2' }, [
        h(UAvatar, { src: author.avatar_urls?.['24'], alt: author.name, size: '2xs' }),
        h('span', { class: 'truncate' }, author.name)
      ])
    }
  })

  for (const taxonomy of taxonomyColumns.value) {
    cols.push({
      id: `tax-${taxonomy.slug}`,
      header: taxonomy.name,
      cell: ({ row }) => {
        const names = (row.original._embedded?.['wp:term'] ?? [])
          .flat()
          .filter(term => term.taxonomy === taxonomy.slug)
          .map(term => stripTags(term.name))
        if (!names.length) return h('span', { class: 'text-dimmed' }, '—')
        const shown = names.slice(0, 3).join(', ')
        return h('span', { class: 'text-sm', title: names.join(', ') }, names.length > 3 ? `${shown} +${names.length - 3}` : shown)
      }
    })
  }

  cols.push({
    id: 'date',
    header: 'Date',
    cell: ({ row }) => {
      const post = row.original
      const [label, value] = post.status === 'publish' || post.status === 'private'
        ? ['Published', post.date]
        : post.status === 'future' ? ['Scheduled', post.date] : ['Last modified', post.modified]
      return h('div', { class: 'text-sm' }, [
        h('p', { class: 'text-xs text-muted' }, label),
        h('p', { class: 'whitespace-nowrap' }, formatDate(value))
      ])
    }
  }, {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const post = row.original
      if (!fullAccess.value) {
        return h('div', { class: 'flex justify-end' }, h(UButton, {
          to: post.link, target: '_blank', icon: 'i-lucide-external-link', label: 'View', color: 'neutral', variant: 'ghost', size: 'sm'
        }))
      }
      return h('div', { class: 'flex justify-end' }, h(UDropdownMenu, {
        items: rowActions(post),
        content: { align: 'end' }
      }, () => h(UButton, {
        'icon': 'i-lucide-ellipsis-vertical',
        'color': 'neutral',
        'variant': 'ghost',
        'size': 'sm',
        'aria-label': 'Actions'
      })))
    }
  })

  return cols
})
</script>

<template>
  <UDashboardPanel id="posts">
    <template #header>
      <UDashboardNavbar :title="typeName">
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
            @click="refetch()"
          />
          <UButton
            v-if="currentType"
            :to="wpAdminUrl(siteUrl, `post-new.php?post_type=${currentType.slug}`)"
            target="_blank"
            icon="i-lucide-plus"
            label="Add new"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <template #left>
          <USelect
            v-model="type"
            :items="typeOptions"
            :loading="!postTypes"
            icon="i-lucide-files"
            class="w-44"
            aria-label="Post type"
          />
          <USelect
            v-model="status"
            :items="statusOptions"
            :disabled="!fullAccess"
            class="w-40"
            aria-label="Status"
          />
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search..."
            class="w-full sm:w-56"
          />
        </template>
        <template #right>
          <USelect
            v-model="sort"
            :items="sortOptions"
            class="w-44"
            aria-label="Sort"
          />
        </template>
      </UDashboardToolbar>

      <UDashboardToolbar>
        <template #left>
          <RemoteSelectMenu
            v-model="author"
            :query-key="authorsKey"
            :fetch-items="authorItems"
            placeholder="All authors"
            icon="i-lucide-user"
          />
          <RemoteSelectMenu
            v-for="taxonomy in taxonomies ?? []"
            :key="taxonomy.slug"
            v-model="terms[taxonomy.rest_base]"
            :query-key="[...siteKey(), 'terms', taxonomy.slug]"
            :fetch-items="termItems(taxonomy)"
            :placeholder="`All ${taxonomy.name.toLowerCase()}`"
            :icon="taxonomy.hierarchical ? 'i-lucide-folder' : 'i-lucide-tag'"
          />
          <USelect
            v-model="date"
            :items="dateOptions"
            icon="i-lucide-calendar"
            class="w-40"
            aria-label="Date"
          />
          <UButton
            v-if="hasFilters"
            label="Clear filters"
            icon="i-lucide-x"
            color="neutral"
            variant="link"
            @click="clearFilters"
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
          :description="`Your role can't edit ${typeName.toLowerCase()}, so only published items are shown.`"
          color="info"
          variant="subtle"
          icon="i-lucide-info"
        />

        <div
          v-if="selectedPosts.length"
          class="flex flex-wrap items-center gap-2 rounded-md border border-default bg-elevated/50 px-3 py-2"
        >
          <span class="me-2 text-sm text-highlighted">{{ selectedPosts.length }} selected</span>
          <template v-if="status === 'trash'">
            <UButton
              label="Restore"
              icon="i-lucide-undo-2"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="running"
              @click="act('restore', selectedPosts)"
            />
            <UButton
              label="Delete permanently"
              icon="i-lucide-trash-2"
              color="error"
              variant="soft"
              size="sm"
              :disabled="running"
              @click="confirmDelete = [...selectedPosts]"
            />
          </template>
          <template v-else>
            <UButton
              v-if="canPublishSelection"
              label="Publish"
              icon="i-lucide-send"
              color="neutral"
              variant="outline"
              size="sm"
              :loading="running"
              @click="act('publish', selectedPosts.filter(p => p.status === 'draft' || p.status === 'pending'))"
            />
            <UButton
              label="Move to Trash"
              icon="i-lucide-trash"
              color="error"
              variant="soft"
              size="sm"
              :loading="running"
              @click="act('trash', selectedPosts)"
            />
          </template>
          <UButton
            label="Clear selection"
            color="neutral"
            variant="link"
            size="sm"
            @click="rowSelection = {}"
          />
        </div>

        <UTable
          v-model:row-selection="rowSelection"
          :data="posts"
          :columns="columns"
          :loading="loading"
          :empty="hasFilters ? 'Nothing matches your filters.' : `No ${typeName.toLowerCase()} found.`"
        />

        <div
          v-if="rangeLabel"
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

      <UModal
        v-model:open="confirmOpen"
        title="Delete permanently?"
        :description="`${confirmDelete?.length ?? 0} ${(confirmDelete?.length ?? 0) === 1 ? 'item' : 'items'} will be deleted from WordPress. This can't be undone.`"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              @click="confirmOpen = false"
            />
            <UButton
              label="Delete permanently"
              color="error"
              :loading="running"
              @click="deleteConfirmed"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
