<script setup lang="ts">
import { SCAN_MAX_POSTS, type MetaCompare, type MetaFilter } from '~/queries/wordpress'

const props = defineProps<{
  /** Meta keys the post type exposes to the REST API. */
  keys: string[]
  loadingKeys?: boolean
}>()

const model = defineModel<MetaFilter | null>({ default: null })

const compareOptions: { label: string, value: MetaCompare }[] = [
  { label: 'has a value', value: 'exists' },
  { label: 'is empty', value: 'empty' },
  { label: 'equals', value: 'equals' },
  { label: 'contains', value: 'contains' },
  { label: 'does not contain', value: 'not_contains' }
]

const open = ref(false)
const draft = reactive<MetaFilter>({ key: '', compare: 'exists', value: '' })

// Start each edit from the applied filter (or a sensible default).
whenever(open, () => {
  Object.assign(draft, model.value ?? { key: props.keys[0] ?? '', compare: 'exists', value: '' })
})

function needsValue(compare: MetaCompare) {
  return compare !== 'exists' && compare !== 'empty'
}

const canApply = computed(() => !!draft.key && (!needsValue(draft.compare) || !!draft.value.trim()))

function apply() {
  if (!canApply.value) return
  model.value = { key: draft.key, compare: draft.compare, value: needsValue(draft.compare) ? draft.value.trim() : '' }
  open.value = false
}

function remove() {
  model.value = null
  open.value = false
}

const label = computed(() => {
  const filter = model.value
  if (!filter) return 'Add meta condition'
  const condition = compareOptions.find(o => o.value === filter.compare)?.label ?? filter.compare
  return needsValue(filter.compare) ? `${filter.key} ${condition} "${filter.value}"` : `${filter.key} ${condition}`
})
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'start' }"
  >
    <UButton
      :label="label"
      :icon="model ? 'i-lucide-filter' : 'i-lucide-plus'"
      :color="model ? 'primary' : 'neutral'"
      :variant="model ? 'soft' : 'outline'"
      class="max-w-72"
      :ui="{ label: 'truncate' }"
    />

    <template #content>
      <form
        class="w-80 space-y-3 p-4"
        @submit.prevent="apply"
      >
        <div>
          <p class="text-sm font-medium text-highlighted">
            Search by meta field
          </p>
          <p class="mt-1 text-xs text-muted">
            Only meta fields registered for the REST API can be searched. Posts are scanned in your browser, up to {{ new Intl.NumberFormat().format(SCAN_MAX_POSTS) }} at a time.
          </p>
        </div>

        <UFormField label="Meta key">
          <USelectMenu
            v-if="keys.length"
            v-model="draft.key"
            :items="keys"
            placeholder="Choose a key"
            class="w-full"
          />
          <p
            v-else
            class="text-sm text-muted"
          >
            {{ loadingKeys ? 'Loading meta keys…' : 'This post type exposes no meta fields to the REST API.' }}
          </p>
        </UFormField>

        <UFormField label="Condition">
          <USelect
            v-model="draft.compare"
            :items="compareOptions"
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-if="needsValue(draft.compare)"
          label="Value"
        >
          <UInput
            v-model="draft.value"
            placeholder="Value to match"
            class="w-full"
          />
        </UFormField>

        <div class="flex items-center justify-between gap-2 pt-1">
          <UButton
            v-if="model"
            label="Remove"
            color="neutral"
            variant="ghost"
            @click="remove"
          />
          <span v-else />
          <UButton
            type="submit"
            label="Search"
            icon="i-lucide-search"
            :disabled="!canApply"
          />
        </div>
      </form>
    </template>
  </UPopover>
</template>
