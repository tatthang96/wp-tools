<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import {
  blockTypesQuery,
  editorPreferencesQuery,
  hiddenBlockTypes,
  setBlockTypesHidden,
  type WpBlockType
} from '~/queries/wordpress'

definePageMeta({ layout: 'dashboard' })
useHead({ title: 'Blocks' })

const PER_PAGE = 25

const queryCache = useQueryCache()
const toast = useToast()

const { data: blockTypes, error, asyncStatus, refetch } = useQuery(blockTypesQuery)
const prefsQuery = useQuery(editorPreferencesQuery)

const blocks = computed(() => error.value ? [] : blockTypes.value ?? [])
const loading = computed(() => asyncStatus.value === 'loading')
const errorMessage = computed(() => {
  if (!error.value) return null
  if (error.value instanceof WpError && error.value.status === 403) {
    return 'Your role can\'t view block types. WordPress only lists them to users who can edit posts.'
  }
  return error.value instanceof WpError ? error.value.message : 'Couldn\'t load block types.'
})

/** `null` while loading or when the site doesn't expose editor preferences. */
const prefs = computed(() => prefsQuery.data.value ?? null)
const prefsAvailable = computed(() => prefs.value !== null)
const hidden = computed(() => new Set(hiddenBlockTypes(prefs.value)))

function refresh() {
  refetch()
  prefsQuery.refetch()
}

// --- Filters -------------------------------------------------------------------

const search = ref('')
const debouncedSearch = refDebounced(computed(() => search.value.trim().toLowerCase()), 200)
const category = ref('all')
const provider = ref('all')
const visibility = ref<'all' | 'shown' | 'hidden'>('all')
const page = ref(1)
const rowSelection = ref<Record<string, boolean>>({})

function countBy(key: (block: WpBlockType) => string) {
  const counts = new Map<string, number>()
  for (const block of blocks.value) counts.set(key(block), (counts.get(key(block)) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])
}

const categoryOptions = computed(() => [
  { label: 'All categories', value: 'all' },
  ...countBy(b => b.category ?? '').map(([value, count]) => ({ label: `${blockCategoryLabel(value)} (${count})`, value }))
])

const providerOptions = computed(() => [
  { label: 'All providers', value: 'all' },
  ...countBy(b => blockProvider(b.name)).map(([value, count]) => ({ label: `${value} (${count})`, value }))
])

const visibilityOptions = [
  { label: 'Shown and hidden', value: 'all' },
  { label: 'Shown in my editor', value: 'shown' },
  { label: 'Hidden in my editor', value: 'hidden' }
]

const filtered = computed(() => blocks.value
  .filter((block) => {
    if (category.value !== 'all' && (block.category ?? '') !== category.value) return false
    if (provider.value !== 'all' && blockProvider(block.name) !== provider.value) return false
    if (visibility.value === 'shown' && hidden.value.has(block.name)) return false
    if (visibility.value === 'hidden' && !hidden.value.has(block.name)) return false
    const q = debouncedSearch.value
    if (!q) return true
    return block.name.toLowerCase().includes(q)
      || stripTags(block.title).toLowerCase().includes(q)
      || block.keywords.some(k => k.toLowerCase().includes(q))
  })
  .sort((a, b) => stripTags(a.title).localeCompare(stripTags(b.title))))

const hasFilters = computed(() =>
  !!debouncedSearch.value || category.value !== 'all' || provider.value !== 'all' || visibility.value !== 'all')

function clearFilters() {
  search.value = ''
  category.value = 'all'
  provider.value = 'all'
  visibility.value = 'all'
}

watch([debouncedSearch, category, provider, visibility], () => {
  page.value = 1
  rowSelection.value = {}
}, { flush: 'sync' })

const pageRows = computed(() => filtered.value.slice((page.value - 1) * PER_PAGE, page.value * PER_PAGE))

const rangeLabel = computed(() => {
  const total = filtered.value.length
  if (!total) return ''
  const from = (page.value - 1) * PER_PAGE + 1
  const to = Math.min(page.value * PER_PAGE, total)
  return `Showing ${from}–${to} of ${total} block types${hasFilters.value ? ` (${blocks.value.length} registered)` : ''}`
})

// --- Selection -----------------------------------------------------------------

watch(page, () => {
  rowSelection.value = {}
})

const selectedBlocks = computed(() => Object.entries(rowSelection.value)
  .filter(([, selected]) => selected)
  .map(([index]) => pageRows.value[Number(index)])
  .filter((block): block is WpBlockType => !!block))

// --- Hide / show in the inserter ------------------------------------------------

const { mutate: setHidden, isLoading: savingPrefs } = useMutation({
  mutation: ({ names, hide }: { names: string[], hide: boolean }) => setBlockTypesHidden(names, hide),
  onSuccess(saved, { names, hide }) {
    queryCache.setQueryData(editorPreferencesQuery().key, saved)
    rowSelection.value = {}
    toast.add({
      title: `${names.length === 1 ? '1 block' : `${names.length} blocks`} ${hide ? 'hidden from' : 'shown in'} your block editor`,
      description: 'Applies to your WordPress user only. Reload any open editor to see it.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  },
  onError(err) {
    toast.add({
      title: 'Couldn\'t update your editor preferences',
      description: err instanceof WpError ? err.message : 'The site returned an error.',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  }
})

// --- Details and row actions ----------------------------------------------------

const detailsBlock = ref<WpBlockType | null>(null)
const detailsOpen = ref(false)

function showDetails(block: WpBlockType) {
  detailsBlock.value = block
  detailsOpen.value = true
}

function usageLink(block: WpBlockType) {
  return { path: '/admin/posts', query: { content_q: blockCommentText(block.name) } }
}

function inInserter(block: WpBlockType) {
  return block.supports?.inserter !== false
}

function rowActions(block: WpBlockType): DropdownMenuItem[][] {
  const isHidden = hidden.value.has(block.name)
  return [[
    { label: 'Details', icon: 'i-lucide-info', onSelect: () => showDetails(block) },
    { label: 'Find posts using it', icon: 'i-lucide-search', to: usageLink(block) }
  ], [{
    label: isHidden ? 'Show in my editor' : 'Hide in my editor',
    icon: isHidden ? 'i-lucide-eye' : 'i-lucide-eye-off',
    disabled: !prefsAvailable.value || savingPrefs.value,
    onSelect: () => setHidden({ names: [block.name], hide: !isHidden })
  }]]
}

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UCheckbox = resolveComponent('UCheckbox')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const USwitch = resolveComponent('USwitch')
const UTooltip = resolveComponent('UTooltip')

const columns = computed<TableColumn<WpBlockType>[]>(() => [{
  id: 'select',
  header: ({ table }) => h(UCheckbox, {
    'modelValue': table.getIsSomePageRowsSelected() ? 'indeterminate' : table.getIsAllPageRowsSelected(),
    'onUpdate:modelValue': (value: boolean | 'indeterminate') => table.toggleAllPageRowsSelected(!!value),
    'aria-label': 'Select all'
  }),
  cell: ({ row }) => h(UCheckbox, {
    'modelValue': row.getIsSelected(),
    'onUpdate:modelValue': (value: boolean | 'indeterminate') => row.toggleSelected(!!value),
    'aria-label': 'Select block'
  })
}, {
  id: 'block',
  header: 'Block',
  cell: ({ row }) => {
    const block = row.original
    return h('div', { class: 'min-w-0 max-w-md' }, [
      h('button', {
        type: 'button',
        class: 'truncate text-left font-medium text-highlighted hover:underline',
        onClick: () => showDetails(block)
      }, stripTags(block.title) || block.name),
      h('p', { class: 'truncate font-mono text-xs text-muted' }, block.name),
      block.description ? h('p', { class: 'truncate text-xs text-dimmed' }, stripTags(block.description)) : null
    ])
  }
}, {
  id: 'category',
  header: 'Category',
  cell: ({ row }) => h(UBadge, { label: blockCategoryLabel(row.original.category), color: 'neutral', variant: 'subtle' })
}, {
  id: 'provider',
  header: 'Provider',
  cell: ({ row }) => h('span', { class: 'font-mono text-xs' }, blockProvider(row.original.name))
}, {
  id: 'kind',
  header: 'Rendering',
  cell: ({ row }) => {
    const block = row.original
    const badges = [h(UBadge, {
      label: block.is_dynamic ? 'Dynamic' : 'Static',
      color: block.is_dynamic ? 'info' : 'neutral',
      variant: 'outline'
    })]
    if (block.parent?.length || block.ancestor?.length) {
      badges.push(h(UBadge, { label: 'Nested only', color: 'neutral', variant: 'soft' }))
    }
    return h('div', { class: 'flex flex-wrap gap-1' }, badges)
  }
}, {
  id: 'inserter',
  header: 'In my editor',
  cell: ({ row }) => {
    const block = row.original
    if (!inInserter(block)) {
      return h(UTooltip, { text: 'This block opts out of the inserter; it is only added by code or other blocks.' },
        () => h('span', { class: 'text-xs text-dimmed' }, 'Not insertable'))
    }
    return h(USwitch, {
      'modelValue': !hidden.value.has(block.name),
      'disabled': !prefsAvailable.value || savingPrefs.value,
      'aria-label': `Show ${stripTags(block.title)} in my editor`,
      'onUpdate:modelValue': (show: boolean) => setHidden({ names: [block.name], hide: !show })
    })
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
}])
</script>

<template>
  <UDashboardPanel id="blocks">
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
            @click="refresh"
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
        <UAlert
          v-else-if="prefsQuery.status.value === 'success' && !prefsAvailable"
          description="This site doesn't expose block editor preferences, so blocks can't be hidden from here (WordPress 6.1 or later is required)."
          color="info"
          variant="subtle"
          icon="i-lucide-info"
        />

        <div class="flex flex-wrap items-center gap-2">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search blocks..."
            class="w-full sm:w-64"
          />
          <USelect
            v-model="category"
            :items="categoryOptions"
            class="w-44"
          />
          <USelect
            v-model="provider"
            :items="providerOptions"
            class="w-44"
          />
          <USelect
            v-model="visibility"
            :items="visibilityOptions"
            :disabled="!prefsAvailable"
            class="w-48"
          />
          <UButton
            v-if="hasFilters"
            label="Clear"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            @click="clearFilters"
          />
        </div>

        <div
          v-if="selectedBlocks.length"
          class="flex flex-wrap items-center gap-2 rounded-md bg-elevated px-3 py-2"
        >
          <span class="text-sm text-muted">{{ selectedBlocks.length }} selected</span>
          <UButton
            label="Hide in my editor"
            icon="i-lucide-eye-off"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!prefsAvailable"
            :loading="savingPrefs"
            @click="setHidden({ names: selectedBlocks.map(b => b.name), hide: true })"
          />
          <UButton
            label="Show in my editor"
            icon="i-lucide-eye"
            color="neutral"
            variant="outline"
            size="sm"
            :disabled="!prefsAvailable"
            :loading="savingPrefs"
            @click="setHidden({ names: selectedBlocks.map(b => b.name), hide: false })"
          />
        </div>

        <UTable
          v-model:row-selection="rowSelection"
          :data="pageRows"
          :columns="columns"
          :loading="loading"
          :empty="hasFilters ? 'No block types match your filters.' : 'No block types found.'"
        />

        <div
          v-if="rangeLabel"
          class="flex flex-wrap items-center justify-between gap-3"
        >
          <p class="text-sm text-muted">
            {{ rangeLabel }}
          </p>
          <UPagination
            v-if="filtered.length > PER_PAGE"
            v-model:page="page"
            :total="filtered.length"
            :items-per-page="PER_PAGE"
          />
        </div>

        <p class="text-xs text-dimmed">
          Lists blocks registered in PHP. Blocks registered only in JavaScript don't appear in the REST API. Hiding a block removes it from your own inserter; posts that already use it keep working.
        </p>
      </div>

      <BlockTypeDetails
        v-model:open="detailsOpen"
        :block="detailsBlock"
        :hidden="!!detailsBlock && hidden.has(detailsBlock.name)"
      />
    </template>
  </UDashboardPanel>
</template>
