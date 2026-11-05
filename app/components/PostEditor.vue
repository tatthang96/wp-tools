<script setup lang="ts">
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import {
  fetchTerms,
  postEditQuery,
  postsKey,
  restPath,
  savePost,
  siteKey,
  type WpMetaField,
  type WpPostEdit,
  type WpPostType,
  type WpTaxonomy
} from '~/queries/wordpress'
import type { RemoteSelectItem } from '~/components/RemoteSelectMenu.vue'

// Drawer that edits a post's raw fields directly through the REST API.
const props = defineProps<{
  postId: number | null
  postType?: WpPostType
  taxonomies: WpTaxonomy[]
  metaFields: WpMetaField[]
}>()

const open = defineModel<boolean>('open', { default: false })

const { siteUrl } = storeToRefs(useAuthStore())
const queryCache = useQueryCache()
const toast = useToast()

const path = computed(() => props.postType ? restPath(props.postType) : '')

const { data: post, error: loadError, asyncStatus: loadStatus, refetch } = useQuery(() => ({
  ...postEditQuery({ path: path.value, id: open.value ? props.postId : null }),
  // Don't refetch behind the user's back while they're editing.
  refetchOnWindowFocus: false,
  refetchOnReconnect: false
}))

// --- Form ----------------------------------------------------------------------

type MetaValue = string | number | boolean | null

interface EditForm {
  title: string
  slug: string
  status: string
  sticky: boolean
  excerpt: string
  content: string
  /** Term IDs keyed by taxonomy rest_base. */
  terms: Record<string, number[]>
  /** Editable (scalar) meta fields only. */
  meta: Record<string, MetaValue>
}

const EDITABLE_META_TYPES = new Set(['string', 'boolean', 'number', 'integer'])
const editableMeta = computed(() => props.metaFields.filter(f => EDITABLE_META_TYPES.has(f.type)))
const readOnlyMeta = computed(() => props.metaFields.filter(f => !EDITABLE_META_TYPES.has(f.type)))

function toForm(p: WpPostEdit): EditForm {
  return {
    title: p.title.raw,
    slug: p.slug,
    status: p.status,
    sticky: !!p.sticky,
    excerpt: p.excerpt.raw,
    content: p.content.raw,
    terms: Object.fromEntries(props.taxonomies.map((t) => {
      const ids = p[t.rest_base]
      return [t.rest_base, Array.isArray(ids) ? ids.filter((id): id is number => typeof id === 'number') : []]
    })),
    meta: Object.fromEntries(editableMeta.value.map((f) => {
      const value = p.meta?.[f.key]
      return [f.key, (value ?? (f.type === 'boolean' ? false : '')) as MetaValue]
    }))
  }
}

function cloneForm(f: EditForm): EditForm {
  return { ...f, terms: Object.fromEntries(Object.entries(f.terms).map(([k, v]) => [k, [...v]])), meta: { ...f.meta } }
}

const form = ref<EditForm | null>(null)
const initial = ref<EditForm | null>(null)

function load(p: WpPostEdit) {
  initial.value = toForm(p)
  form.value = cloneForm(initial.value)
}

function sameIds(a: number[] = [], b: number[] = []) {
  return a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i])
}

/** Only the fields that differ from what was loaded, shaped for the REST API. */
const changes = computed<Record<string, unknown>>(() => {
  const f = form.value
  const i = initial.value
  if (!f || !i) return {}
  const out: Record<string, unknown> = {}
  for (const key of ['title', 'slug', 'status', 'excerpt', 'content'] as const) {
    if (f[key] !== i[key]) out[key] = f[key]
  }
  if (post.value?.sticky !== undefined && f.sticky !== i.sticky) out.sticky = f.sticky
  for (const [base, ids] of Object.entries(f.terms)) {
    if (!sameIds(ids, i.terms[base])) out[base] = ids
  }
  const meta: Record<string, MetaValue> = {}
  for (const [key, value] of Object.entries(f.meta)) {
    // An emptied number input sends null, which deletes the meta value.
    if (value !== i.meta[key]) meta[key] = value === '' && typeof i.meta[key] === 'number' ? null : value
  }
  if (Object.keys(meta).length) out.meta = meta
  return out
})
const dirty = computed(() => Object.keys(changes.value).length > 0)

// (Re)load the form when the post arrives, unless the user has unsaved edits to it.
watch([post, () => props.taxonomies, () => props.metaFields], ([p]) => {
  if (!p) return
  if (!dirty.value || form.value === null) load(p)
}, { immediate: true })

// Every time the drawer opens (or switches post), start from WordPress's copy;
// leftovers from an earlier session must never be saved by accident.
watch([open, () => props.postId], ([isOpen]) => {
  if (!isOpen) return
  form.value = null
  initial.value = null
  confirmDiscard.value = false
  resetSave()
  if (post.value && post.value.id === props.postId) load(post.value)
})

// --- Options -------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  publish: 'Published',
  draft: 'Draft',
  pending: 'Pending review',
  private: 'Private',
  future: 'Scheduled'
}

const statusOptions = computed(() => {
  const values = ['publish', 'draft', 'pending', 'private']
  const current = initial.value?.status
  if (current && !values.includes(current)) values.push(current)
  return values.map(value => ({ label: STATUS_LABELS[value] ?? value, value }))
})

function termKey(taxonomy: WpTaxonomy) {
  return [...siteKey(), 'terms', taxonomy.slug]
}

function termItems(taxonomy: WpTaxonomy) {
  return async (search: string): Promise<RemoteSelectItem[]> => {
    const list = await fetchTerms(taxonomy, search)
    return list.map(t => ({ label: stripTags(t.name), value: t.id }))
  }
}

/** Labels for the post's current terms, so the menus show names before any search. */
function initialTerms(taxonomy: WpTaxonomy): RemoteSelectItem[] {
  return (post.value?._embedded?.['wp:term'] ?? [])
    .flat()
    .filter(t => t.taxonomy === taxonomy.slug)
    .map(t => ({ label: stripTags(t.name), value: t.id }))
}

const contentStats = computed(() => {
  const text = form.value?.content ?? ''
  const number = new Intl.NumberFormat()
  const lines = text.split('\n').length
  return `${number.format(text.length)} characters · ${number.format(lines)} ${lines === 1 ? 'line' : 'lines'}`
})

// --- Saving --------------------------------------------------------------------

const { mutateAsync: save, isLoading: saving, error: saveError, reset: resetSave } = useMutation({
  mutation: ({ force }: { force: boolean }) => savePost(path.value, post.value!, changes.value, force),
  onSuccess(updated) {
    load(updated)
    toast.add({ title: 'Post saved', icon: 'i-lucide-check', color: 'success' })
    // Refresh the table (and any cached copy of this post).
    queryCache.invalidateQueries({ key: [...postsKey()] })
  }
})

const conflict = computed(() => saveError.value instanceof WpError && saveError.value.code === 'edit_conflict')
const saveErrorMessage = computed(() => {
  const error = saveError.value
  if (!error) return null
  return error instanceof WpError ? error.message : 'Couldn\'t save the post.'
})

async function submit(force = false) {
  if (!dirty.value || !post.value) return
  try {
    await save({ force })
  } catch {
    // shown via saveErrorMessage
  }
}

async function reloadFromWordPress() {
  resetSave()
  const result = await refetch()
  if (result.data) load(result.data)
}

// --- Closing -------------------------------------------------------------------

const confirmDiscard = ref(false)

function requestClose() {
  if (dirty.value) confirmDiscard.value = true
  else open.value = false
}

function discard() {
  confirmDiscard.value = false
  if (initial.value) form.value = cloneForm(initial.value)
  open.value = false
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="form ? (form.title || '(no title)') : 'Edit post'"
    :description="postType ? `${postType.name} #${postId}` : undefined"
    :dismissible="!dirty"
    :close="false"
    :ui="{ content: 'sm:max-w-3xl' }"
    @close:prevent="requestClose"
  >
    <!-- Own close button: the built-in one is a DialogClose and would skip the unsaved-changes check. -->
    <template #actions>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        aria-label="Close"
        class="-me-1.5"
        @click="requestClose"
      />
    </template>

    <template #body>
      <div
        v-if="loadError"
        class="space-y-3"
      >
        <UAlert
          :description="loadError instanceof WpError ? loadError.message : 'Couldn\'t load the post.'"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
        />
        <UButton
          label="Try again"
          color="neutral"
          variant="outline"
          @click="refetch()"
        />
      </div>

      <div
        v-else-if="!form"
        class="space-y-4"
      >
        <USkeleton class="h-9 w-full" />
        <USkeleton class="h-9 w-2/3" />
        <USkeleton class="h-64 w-full" />
      </div>

      <form
        v-else
        class="space-y-5"
        @submit.prevent="submit()"
      >
        <UFormField label="Title">
          <UInput
            v-model="form.title"
            size="lg"
            class="w-full"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
          <UFormField label="Status">
            <USelect
              v-model="form.status"
              :items="statusOptions"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Slug">
            <UInput
              v-model="form.slug"
              class="w-full"
            />
          </UFormField>
          <UFormField
            v-if="post?.sticky !== undefined"
            label="Sticky"
          >
            <USwitch
              v-model="form.sticky"
              class="h-9"
            />
          </UFormField>
        </div>

        <UFormField
          label="Content (raw HTML)"
          :hint="contentStats"
          description="Edits post_content exactly as stored, including block comments like <!-- wp:paragraph -->. Broken block markup shows as “unexpected content” in the block editor. Without the unfiltered_html capability, WordPress strips unsafe HTML on save."
        >
          <UTextarea
            v-model="form.content"
            :rows="18"
            :maxrows="40"
            autoresize
            spellcheck="false"
            class="w-full"
            :ui="{ base: 'font-mono text-xs leading-relaxed' }"
          />
        </UFormField>

        <UFormField label="Excerpt">
          <UTextarea
            v-model="form.excerpt"
            :rows="3"
            autoresize
            class="w-full"
          />
        </UFormField>

        <UFormField
          v-for="taxonomy in taxonomies"
          :key="taxonomy.slug"
          :label="taxonomy.name"
        >
          <RemoteSelectMenu
            v-model="form.terms[taxonomy.rest_base]"
            multiple
            :query-key="termKey(taxonomy)"
            :fetch-items="termItems(taxonomy)"
            :initial-items="initialTerms(taxonomy)"
            :placeholder="`Choose ${taxonomy.name.toLowerCase()}`"
            :icon="taxonomy.hierarchical ? 'i-lucide-folder' : 'i-lucide-tag'"
          />
        </UFormField>

        <div
          v-if="metaFields.length"
          class="space-y-4 rounded-md border border-default p-4"
        >
          <div>
            <p class="text-sm font-medium text-highlighted">
              Custom fields
            </p>
            <p class="text-xs text-muted">
              Meta fields registered for the REST API.
            </p>
          </div>

          <UFormField
            v-for="field in editableMeta"
            :key="field.key"
            :label="field.key"
            :hint="field.type"
          >
            <USwitch
              v-if="field.type === 'boolean'"
              :model-value="!!form.meta[field.key]"
              @update:model-value="form.meta[field.key] = $event"
            />
            <UInput
              v-else-if="field.type === 'number' || field.type === 'integer'"
              :model-value="String(form.meta[field.key] ?? '')"
              type="number"
              :step="field.type === 'integer' ? 1 : 'any'"
              class="w-full"
              @update:model-value="form.meta[field.key] = $event === '' ? '' : Number($event)"
            />
            <UInput
              v-else
              :model-value="String(form.meta[field.key] ?? '')"
              class="w-full"
              @update:model-value="form.meta[field.key] = $event"
            />
          </UFormField>

          <UFormField
            v-for="field in readOnlyMeta"
            :key="field.key"
            :label="field.key"
            :hint="`${field.type} · read-only`"
          >
            <pre class="max-h-32 overflow-auto rounded bg-elevated p-2 text-xs text-muted">{{ JSON.stringify(post?.meta?.[field.key] ?? null, null, 2) }}</pre>
          </UFormField>
        </div>
      </form>
    </template>

    <template #footer>
      <div class="w-full space-y-3">
        <UAlert
          v-if="confirmDiscard"
          title="Discard unsaved changes?"
          color="warning"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :actions="[
            { label: 'Keep editing', color: 'neutral', variant: 'outline', onClick: () => { confirmDiscard = false } },
            { label: 'Discard', color: 'warning', onClick: discard }
          ]"
        />
        <UAlert
          v-else-if="saveErrorMessage"
          :description="saveErrorMessage"
          :color="conflict ? 'warning' : 'error'"
          variant="subtle"
          icon="i-lucide-circle-alert"
          :actions="conflict
            ? [
              { label: 'Reload from WordPress', color: 'neutral', variant: 'outline', onClick: reloadFromWordPress },
              { label: 'Overwrite anyway', color: 'warning', onClick: () => submit(true) }
            ]
            : undefined"
        />

        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex gap-1">
            <UButton
              v-if="post && postType?.slug !== 'wp_block'"
              :to="post.link"
              target="_blank"
              icon="i-lucide-external-link"
              label="View"
              color="neutral"
              variant="ghost"
            />
            <UButton
              v-if="post"
              :to="wpAdminUrl(siteUrl, `post.php?post=${post.id}&action=edit`)"
              target="_blank"
              icon="i-simple-icons-wordpress"
              label="WP Admin"
              color="neutral"
              variant="ghost"
            />
          </div>
          <div class="flex items-center gap-2">
            <span
              v-if="dirty"
              class="text-xs text-muted"
            >Unsaved changes</span>
            <UButton
              label="Cancel"
              color="neutral"
              variant="outline"
              @click="requestClose"
            />
            <UButton
              label="Save"
              icon="i-lucide-save"
              :loading="saving"
              :disabled="!dirty || loadStatus === 'loading'"
              @click="submit()"
            />
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
