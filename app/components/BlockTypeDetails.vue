<script setup lang="ts">
import type { WpBlockType } from '~/queries/wordpress'

// Read-only details of a registered block type.
const props = defineProps<{
  block: WpBlockType | null
  hidden: boolean
}>()

const open = defineModel<boolean>('open', { default: false })

const attributes = computed(() => Object.entries(props.block?.attributes ?? {}).map(([name, attr]) => ({
  name,
  type: Array.isArray(attr.type) ? attr.type.join(' | ') : attr.type ?? (attr.enum ? 'enum' : '—'),
  default: attr.default === undefined ? '' : JSON.stringify(attr.default)
})))

/** Supports that are switched on (`true` or a settings object). */
const supports = computed(() => Object.entries(props.block?.supports ?? {})
  .filter(([, value]) => value !== false && value !== null)
  .map(([key]) => key))
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="block ? stripTags(block.title) : ''"
    :description="block?.name"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div
        v-if="block"
        class="space-y-6 text-sm"
      >
        <p
          v-if="block.description"
          class="text-muted"
        >
          {{ stripTags(block.description) }}
        </p>

        <div class="flex flex-wrap gap-1.5">
          <UBadge
            :label="blockCategoryLabel(block.category)"
            color="neutral"
            variant="subtle"
          />
          <UBadge
            :label="block.is_dynamic ? 'Dynamic (rendered in PHP)' : 'Static (saved as HTML)'"
            color="neutral"
            variant="outline"
          />
          <UBadge
            :label="`API v${block.api_version}`"
            color="neutral"
            variant="outline"
          />
          <UBadge
            v-if="hidden"
            label="Hidden in my editor"
            color="warning"
            variant="subtle"
          />
          <UBadge
            v-if="block.supports?.inserter === false"
            label="Not in the inserter"
            color="neutral"
            variant="subtle"
          />
        </div>

        <dl class="grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2">
          <dt class="text-muted">
            Provider
          </dt>
          <dd class="text-highlighted">
            {{ blockProvider(block.name) }}<span
              v-if="block.textdomain && block.textdomain !== blockProvider(block.name)"
              class="text-muted"
            > ({{ block.textdomain }})</span>
          </dd>
          <template v-if="block.parent?.length">
            <dt class="text-muted">
              Only inside
            </dt>
            <dd class="font-mono text-xs text-highlighted">
              {{ block.parent.join(', ') }}
            </dd>
          </template>
          <template v-if="block.ancestor?.length">
            <dt class="text-muted">
              Somewhere inside
            </dt>
            <dd class="font-mono text-xs text-highlighted">
              {{ block.ancestor.join(', ') }}
            </dd>
          </template>
          <template v-if="block.keywords.length">
            <dt class="text-muted">
              Keywords
            </dt>
            <dd class="text-highlighted">
              {{ block.keywords.join(', ') }}
            </dd>
          </template>
        </dl>

        <section v-if="block.styles.length">
          <h3 class="mb-2 font-medium text-highlighted">
            Styles
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="style in block.styles"
              :key="style.name"
              :label="style.isDefault ? `${style.label} (default)` : style.label"
              color="neutral"
              variant="outline"
            />
          </div>
        </section>

        <section v-if="block.variations.length">
          <h3 class="mb-2 font-medium text-highlighted">
            Variations ({{ block.variations.length }})
          </h3>
          <ul class="space-y-1">
            <li
              v-for="variation in block.variations"
              :key="variation.name"
            >
              <span class="text-highlighted">{{ stripTags(variation.title) }}</span>
              <span class="ml-2 font-mono text-xs text-muted">{{ variation.name }}</span>
            </li>
          </ul>
        </section>

        <section v-if="supports.length">
          <h3 class="mb-2 font-medium text-highlighted">
            Supports
          </h3>
          <div class="flex flex-wrap gap-1.5">
            <UBadge
              v-for="key in supports"
              :key="key"
              :label="key"
              color="neutral"
              variant="soft"
            />
          </div>
        </section>

        <section v-if="attributes.length">
          <h3 class="mb-2 font-medium text-highlighted">
            Attributes ({{ attributes.length }})
          </h3>
          <div class="overflow-hidden rounded-md border border-default">
            <table class="w-full text-left text-xs">
              <thead class="bg-elevated text-muted">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    Name
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Type
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Default
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="attr in attributes"
                  :key="attr.name"
                >
                  <td class="px-3 py-1.5 font-mono text-highlighted">
                    {{ attr.name }}
                  </td>
                  <td class="px-3 py-1.5 text-muted">
                    {{ attr.type }}
                  </td>
                  <td class="max-w-48 truncate px-3 py-1.5 font-mono text-muted">
                    {{ attr.default }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </USlideover>
</template>
