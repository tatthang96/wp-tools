<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useQuery } from '@pinia/colada'
import {
  PATTERN_POST_TYPE,
  patternsListQuery,
  postMetaKeysQuery,
  restPath,
  taxonomiesQuery,
  type PatternsListParams,
  type WpPattern
} from '~/queries/wordpress'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Patterns' })

const PER_PAGE = 20
const PATH = restPath(PATTERN_POST_TYPE)

const { siteUrl } = storeToRefs(useAuthStore())
const { runAction, running } = usePostActions()

const search = ref('')
const debouncedSearch = refDebounced(computed(() => search.value.trim()), 300)
const status = ref<PatternsListParams['status']>('all')
const sync = ref<PatternsListParams['sync']>('all')
const page = ref(1)

const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Published', value: 'publish' },
  { label: 'Drafts', value: 'draft' },
  { label: 'Trash', value: 'trash' }
]

const syncOptions = [
  { label: 'Synced and not synced', value: 'all' },
  { label: 'Synced', value: 'synced' },
  { label: 'Not synced', value: 'unsynced' }
]

watch([debouncedSearch, status, sync], () => {
  page.value = 1
}, { flush: 'sync' })

const { data, error, asyncStatus, refetch } = useQuery(() => patternsListQuery({
  search: debouncedSearch.value,
  status: status.value,
  sync: sync.value,
  page: page.value,
  perPage: PER_PAGE
}))

const patterns = computed(() => error.value ? [] : data.value?.patterns ?? [])
const total = computed(() => error.value ? 0 : data.value?.total ?? 0)
const loading = computed(() => asyncStatus.value === 'loading')
const errorMessage = computed(() => {
  if (!error.value) return null
  return error.value instanceof WpError ? error.value.message : 'Couldn\'t load patterns.'
})

const hasFilters = computed(() => !!debouncedSearch.value || status.value !== 'all' || sync.value !== 'all')

const rangeLabel = computed(() => {
  if (!total.value) return ''
  const from = (page.value - 1) * PER_PAGE + 1
  const to = Math.min(page.value * PER_PAGE, total.value)
  return `Showing ${from}–${to} of ${new Intl.NumberFormat().format(total.value)} patterns`
})

// --- Editing -------------------------------------------------------------------

const { data: taxonomies } = useQuery(() => taxonomiesQuery(PATTERN_POST_TYPE.slug))
const { data: metaKeys } = useQuery(() => postMetaKeysQuery(PATH))
// WordPress moves the sync status out of `meta` in responses, so it can't be edited as a meta field.
const editableMeta = computed(() => (metaKeys.value ?? []).filter(f => f.key !== 'wp_pattern_sync_status'))

const editingId = ref<number | null>(null)
const editorOpen = ref(false)

function editPattern(pattern: WpPattern) {
  editingId.value = pattern.id
  editorOpen.value = true
}

const confirmDelete = ref<WpPattern | null>(null)
const confirmOpen = computed({
  get: () => !!confirmDelete.value,
  set: (open) => {
    if (!open) confirmDelete.value = null
  }
})

async function deleteConfirmed() {
  const target = confirmDelete.value
  confirmDelete.value = null
  if (target) await runAction('delete', PATH, [target])
}

function rowActions(pattern: WpPattern): DropdownMenuItem[][] {
  if (pattern.status === 'trash') {
    return [[
      { label: 'Restore as draft', icon: 'i-lucide-undo-2', onSelect: () => runAction('restore', PATH, [pattern]) }
    ], [
      { label: 'Delete permanently', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => (confirmDelete.value = pattern) }
    ]]
  }
  return [[
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => editPattern(pattern) },
    {
      label: 'Edit in WP Admin',
      icon: 'i-lucide-external-link',
      to: wpAdminUrl(siteUrl.value, `post.php?post=${pattern.id}&action=edit`),
      target: '_blank'
    }
  ], [
    { label: 'Move to Trash', icon: 'i-lucide-trash', color: 'error', onSelect: () => runAction('trash', PATH, [pattern]) }
  ]]
}

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function patternTitle(pattern: WpPattern) {
  return stripTags(pattern.title.raw ?? pattern.title.rendered ?? '') || '(no title)'
}

/** Top-level block names used in the pattern, e.g. "Group, Heading, Paragraph". */
function blockSummary(pattern: WpPattern) {
  const names = new Set<string>()
  for (const match of (pattern.content?.raw ?? '').matchAll(/<!-- wp:([a-z0-9-]+(?:\/[a-z0-9-]+)?)/g)) {
    names.add(match[1]!)
  }
  return [...names].slice(0, 4).join(', ') + (names.size > 4 ? ` +${names.size - 4}` : '')
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const columns: TableColumn<WpPattern>[] = [{
  id: 'title',
  header: 'Pattern',
  cell: ({ row }) => {
    const pattern = row.original
    const summary = blockSummary(pattern)
    return h('div', { class: 'min-w-0 max-w-md' }, [
      h('button', {
        type: 'button',
        class: 'truncate text-left font-medium text-highlighted hover:underline disabled:no-underline',
        disabled: pattern.status === 'trash',
        onClick: () => editPattern(pattern)
      }, patternTitle(pattern)),
      summary ? h('p', { class: 'truncate font-mono text-xs text-muted' }, summary) : null
    ])
  }
}, {
  id: 'sync',
  header: 'Sync',
  cell: ({ row }) => {
    const synced = row.original.wp_pattern_sync_status !== 'unsynced'
    return h(UBadge, {
      label: synced ? 'Synced' : 'Not synced',
      icon: synced ? 'i-lucide-refresh-cw' : 'i-lucide-copy',
      color: synced ? 'primary' : 'neutral',
      variant: 'subtle'
    })
  }
}, {
  id: 'status',
  header: 'Status',
  cell: ({ row }) => {
    const value = row.original.status
    const label = value === 'publish' ? 'Published' : value.replace(/^\w/, c => c.toUpperCase())
    return h(UBadge, {
      label,
      color: value === 'publish' ? 'success' : value === 'trash' ? 'error' : 'neutral',
      variant: 'outline'
    })
  }
}, {
  id: 'modified',
  header: 'Modified',
  cell: ({ row }) => {
    const date = new Date(row.original.modified)
    return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date)
  }
}, {
  id: 'actions',
  header: '',
  cell: ({ row }) => h('div', { class: 'flex justify-end' }, h(UDropdownMenu, {
    items: rowActions(row.original),
    content: { align: 'end' }
  }, () => h(UButton, {
    'icon': 'i-lucide-ellipsis-vertical',
    'color': 'neutral',
    'variant': 'ghost',
    'size': 'sm',
    'aria-label': 'Actions'
  })))
}]
</script>

<template>
  <UDashboardPanel id="patterns">
    <template #header>
      <UDashboardNavbar title="Blocks">
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
            :to="wpAdminUrl(siteUrl, 'post-new.php?post_type=wp_block')"
            target="_blank"
            icon="i-lucide-plus"
            label="New pattern"
          />
        </template>
      </UDashboardNavbar>

      <BlocksTabs />
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

        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search patterns..."
            class="w-full sm:w-64"
          />
          <USelect
            v-model="status"
            :items="statusOptions"
            class="w-40"
          />
          <USelect
            v-model="sync"
            :items="syncOptions"
            class="w-52"
          />
        </div>

        <UTable
          :data="patterns"
          :columns="columns"
          :loading="loading"
          :empty="hasFilters ? 'No patterns match your filters.' : 'No patterns yet. Patterns you save in the block editor appear here.'"
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

      <PostEditor
        v-model:open="editorOpen"
        :post-id="editingId"
        :post-type="PATTERN_POST_TYPE"
        :taxonomies="taxonomies ?? []"
        :meta-fields="editableMeta"
      />

      <UModal
        v-model:open="confirmOpen"
        title="Delete pattern permanently?"
        :description="`“${confirmDelete ? patternTitle(confirmDelete) : ''}” will be deleted from WordPress. Synced copies of it in posts will stop rendering. This can't be undone.`"
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
