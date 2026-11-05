<script setup lang="ts">
import { SCAN_MAX_POSTS, type MetaCompare, type MetaFilter, type WpMetaField } from '~/queries/wordpress'

const props = defineProps<{
  /** Meta fields the post type exposes to the REST API. */
  fields: WpMetaField[]
  loadingKeys?: boolean
}>()

const model = defineModel<MetaFilter | null>({ default: null })

const ALL_COMPARES: { label: string, value: MetaCompare }[] = [
  { label: 'is true', value: 'is_true' },
  { label: 'is false', value: 'is_false' },
  { label: 'has a value', value: 'exists' },
  { label: 'is empty', value: 'empty' },
  { label: 'equals', value: 'equals' },
  { label: 'contains', value: 'contains' },
  { label: 'does not contain', value: 'not_contains' }
]

// REST returns boolean meta as true/false on every post, so "has a value"/"is empty"
// would be meaningless: booleans only get is true / is false.
function comparesFor(type: string | undefined): MetaCompare[] {
  if (type === 'boolean') return ['is_true', 'is_false']
  if (type === 'number' || type === 'integer') return ['exists', 'empty', 'equals']
  return ['exists', 'empty', 'equals', 'contains', 'not_contains']
}

const keyItems = computed(() => props.fields.map(f => ({ label: f.key, value: f.key, description: f.type })))

const open = ref(false)
const draft = reactive<MetaFilter>({ key: '', compare: 'exists', value: '' })

const draftType = computed(() => props.fields.find(f => f.key === draft.key)?.type)
const compareOptions = computed(() => {
  const allowed = comparesFor(draftType.value)
  return ALL_COMPARES.filter(o => allowed.includes(o.value))
})

// Start each edit from the applied filter (or a sensible default).
whenever(open, () => {
  const key = model.value?.key ?? props.fields[0]?.key ?? ''
  const type = props.fields.find(f => f.key === key)?.type
  Object.assign(draft, model.value ?? { key, compare: comparesFor(type)[0], value: '' })
})

// Switching to a key of another type: keep the condition only if it still applies.
watch(() => draft.key, () => {
  const allowed = comparesFor(draftType.value)
  if (!allowed.includes(draft.compare)) draft.compare = allowed[0]!
})

function needsValue(compare: MetaCompare) {
  return compare === 'equals' || compare === 'contains' || compare === 'not_contains'
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
  const condition = ALL_COMPARES.find(o => o.value === filter.compare)?.label ?? filter.compare
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
            v-if="fields.length"
            v-model="draft.key"
            :items="keyItems"
            value-key="value"
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
            :placeholder="draftType === 'number' || draftType === 'integer' ? 'Number to match' : 'Value to match'"
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
