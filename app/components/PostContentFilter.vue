<script setup lang="ts">
import { SCAN_MAX_POSTS, type ContentFilter } from '~/queries/wordpress'

const model = defineModel<ContentFilter | null>({ default: null })

const open = ref(false)
const draft = reactive<ContentFilter>({ text: '', matchCase: false })

// Start each edit from the applied filter.
whenever(open, () => {
  Object.assign(draft, model.value ?? { text: '', matchCase: false })
})

const canApply = computed(() => draft.text.trim().length > 0)

function apply() {
  if (!canApply.value) return
  // Keep inner spaces (they're part of the text); only trim the ends.
  model.value = { text: draft.text.trim(), matchCase: draft.matchCase }
  open.value = false
}

function remove() {
  model.value = null
  open.value = false
}

const label = computed(() => {
  const filter = model.value
  if (!filter) return 'Add content text'
  return `content contains "${filter.text}"${filter.matchCase ? ' (match case)' : ''}`
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
      class="max-w-96"
      :ui="{ label: 'truncate' }"
    />

    <template #content>
      <form
        class="w-80 space-y-3 p-4"
        @submit.prevent="apply"
      >
        <div>
          <p class="text-sm font-medium text-highlighted">
            Search in post content
          </p>
          <p class="mt-1 text-xs text-muted">
            Finds posts whose <code>post_content</code> contains the exact text, including block markup and shortcodes (e.g. <code>wp:gallery</code>). WordPress narrows the candidates first; your browser checks up to {{ new Intl.NumberFormat().format(SCAN_MAX_POSTS) }} of them.
          </p>
        </div>

        <UFormField label="Text">
          <UInput
            v-model="draft.text"
            placeholder="Text to find"
            autofocus
            class="w-full"
          />
        </UFormField>

        <UCheckbox
          v-model="draft.matchCase"
          label="Match case"
        />

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
