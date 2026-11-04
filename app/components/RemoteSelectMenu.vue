<script setup lang="ts">
import { useQuery, type EntryKey } from '@pinia/colada'

export interface RemoteSelectItem {
  label: string
  value: number
  avatar?: { src?: string, alt?: string }
}

// A filter menu whose options are searched on the server (authors, terms, ...).
const props = defineProps<{
  placeholder: string
  icon?: string
  /** Base cache key; the search term is appended. */
  queryKey: EntryKey
  fetchItems: (search: string) => Promise<RemoteSelectItem[]>
  disabled?: boolean
}>()

const model = defineModel<number | undefined>()

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
watchImmediate(data, (items) => {
  for (const item of items ?? []) known.value.set(item.value, item)
})

const items = computed(() => {
  const list = data.value ?? []
  const selected = model.value !== undefined ? known.value.get(model.value) : undefined
  return selected && !list.some(i => i.value === selected.value) ? [selected, ...list] : list
})
</script>

<template>
  <USelectMenu
    v-model="model"
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
