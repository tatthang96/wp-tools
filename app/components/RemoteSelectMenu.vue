<script setup lang="ts">
import { useQuery, type EntryKey } from '@pinia/colada'

export interface RemoteSelectItem {
  label: string
  value: number
  avatar?: { src?: string, alt?: string }
}

// A menu whose options are searched on the server (authors, terms, ...).
// Single value (filters) or several values (`multiple`, e.g. a post's categories).
const props = defineProps<{
  placeholder: string
  icon?: string
  /** Base cache key; the search term is appended. */
  queryKey: EntryKey
  fetchItems: (search: string) => Promise<RemoteSelectItem[]>
  disabled?: boolean
  multiple?: boolean
  /** Labels for values that are already selected (e.g. a post's current terms). */
  initialItems?: RemoteSelectItem[]
}>()

const model = defineModel<number | number[] | undefined>()

const single = computed({
  get: () => typeof model.value === 'number' ? model.value : undefined,
  set: (value) => {
    model.value = value
  }
})
const several = computed({
  get: () => Array.isArray(model.value) ? model.value : [],
  set: (value) => {
    model.value = value
  }
})

const searchTerm = ref('')
const debouncedSearch = refDebounced(computed(() => searchTerm.value.trim()), 300)

const { data, asyncStatus } = useQuery(() => ({
  key: [...props.queryKey, debouncedSearch.value],
  query: () => props.fetchItems(debouncedSearch.value),
  placeholderData: (previous: RemoteSelectItem[] | undefined) => previous,
  staleTime: 60_000
}))

// Remember labels of selected values so the menu still shows the selection
// after a new search no longer contains it.
const known = ref(new Map<number, RemoteSelectItem>())
watchImmediate(() => props.initialItems, (items) => {
  for (const item of items ?? []) known.value.set(item.value, item)
})
watchImmediate(data, (items) => {
  for (const item of items ?? []) known.value.set(item.value, item)
})

const items = computed(() => {
  const list = data.value ?? []
  const selectedIds = Array.isArray(model.value) ? model.value : model.value !== undefined ? [model.value] : []
  const missing = selectedIds
    .filter(id => !list.some(i => i.value === id))
    .map(id => known.value.get(id) ?? { label: `#${id}`, value: id })
  return [...missing, ...list]
})
</script>

<template>
  <USelectMenu
    v-if="multiple"
    v-model="several"
    v-model:search-term="searchTerm"
    :items="items"
    value-key="value"
    :placeholder="placeholder"
    :icon="icon"
    :loading="asyncStatus === 'loading'"
    :disabled="disabled"
    multiple
    ignore-filter
    class="w-full"
  />
  <USelectMenu
    v-else
    v-model="single"
    v-model:search-term="searchTerm"
    :items="items"
    value-key="value"
    :placeholder="placeholder"
    :icon="icon"
    :loading="asyncStatus === 'loading'"
    :disabled="disabled"
    ignore-filter
    clear
    class="w-48"
  />
</template>
