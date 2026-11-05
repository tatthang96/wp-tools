import { defineQueryOptions } from '@pinia/colada'

// Pinia Colada query definitions for the connected WordPress site.
// Keys start with ['wp', siteUrl, username] so cached data never mixes between
// sites or users, and logout can drop everything under ['wp'].

export interface WpPlugin {
  plugin: string
  name: string
  status: 'active' | 'inactive' | 'network-active'
}

export interface WpListUser {
  id: number
  name: string
  slug: string
  // Only present with context=edit (needs the list_users capability).
  username?: string
  email?: string
  roles?: string[]
  registered_date?: string
  avatar_urls?: Record<string, string>
}

export type UsersSort = 'newest' | 'oldest' | 'name'

export interface UsersListParams {
  page: number
  perPage: number
  search: string
  role: string
  sort: UsersSort
}

export interface UsersList {
  users: WpListUser[]
  total: number
  /** false when the signed-in role can't list all users (no list_users capability). */
  fullAccess: boolean
}

export interface UsersStats {
  total: number
  newestName: string | null
  /** true when only authors with published posts could be counted. */
  limited: boolean
}

const USERS_SORT: Record<UsersSort, { orderby: string, order: 'asc' | 'desc' }> = {
  newest: { orderby: 'registered_date', order: 'desc' },
  oldest: { orderby: 'registered_date', order: 'asc' },
  name: { orderby: 'name', order: 'asc' }
}

// Errors WordPress returns when a role without list_users asks for admin-only data.
const LIMITED_ACCESS_CODES = ['rest_forbidden_context', 'rest_forbidden_orderby', 'rest_user_cannot_view', 'rest_forbidden_status']

function isLimitedAccessError(error: unknown) {
  return error instanceof WpError && LIMITED_ACCESS_CODES.includes(error.code)
}

export function siteKey() {
  const auth = useAuthStore()
  return ['wp', auth.siteUrl, auth.session?.username ?? ''] as const
}

/** Every installed plugin (this endpoint isn't paginated). Needs the activate_plugins capability. */
export const pluginsQuery = defineQueryOptions(() => {
  const auth = useAuthStore()
  return {
    key: [...siteKey(), 'plugins'],
    query: () => auth.request<WpPlugin[]>('/wp/v2/plugins'),
    enabled: auth.loggedIn
  }
})

/** Total user count plus the newest user, for the dashboard. */
export const usersStatsQuery = defineQueryOptions(() => {
  const auth = useAuthStore()
  return {
    key: [...siteKey(), 'users', 'stats'],
    enabled: auth.loggedIn,
    async query(): Promise<UsersStats> {
      // One user is enough: the total comes from the X-WP-Total header.
      try {
        // Sorting by registration date needs list_users (administrators).
        const { data, total } = await auth.requestPage<WpListUser>('/wp/v2/users', {
          query: { per_page: 1, ...USERS_SORT.newest }
        })
        return { total, newestName: data[0]?.name ?? null, limited: false }
      } catch (error) {
        if (!isLimitedAccessError(error)) throw error
        // Without list_users, WordPress only lists authors who have published posts.
        const { total } = await auth.requestPage<WpListUser>('/wp/v2/users', { query: { per_page: 1 } })
        return { total, newestName: null, limited: true }
      }
    }
  }
})

/** One page of users with search, role filter and sorting done by WordPress. */
export const usersListQuery = defineQueryOptions((params: UsersListParams) => {
  const auth = useAuthStore()
  return {
    key: [...siteKey(), 'users', 'list', { ...params }],
    enabled: auth.loggedIn,
    // Keep showing the current page while the next one loads.
    placeholderData: (previous: UsersList | undefined) => previous,
    async query(): Promise<UsersList> {
      const base = {
        page: params.page,
        per_page: params.perPage,
        search: params.search || undefined
      }

      try {
        const { data, total } = await auth.requestPage<WpListUser>('/wp/v2/users', {
          query: {
            ...base,
            ...USERS_SORT[params.sort],
            roles: params.role === 'all' ? undefined : params.role,
            context: 'edit'
          }
        })
        return { users: data, total, fullAccess: true }
      } catch (error) {
        if (!isLimitedAccessError(error)) throw error
        // Limited roles: public fields only, and WordPress only returns authors with published posts.
        const { data, total } = await auth.requestPage<WpListUser>('/wp/v2/users', {
          query: {
            ...base,
            orderby: params.sort === 'name' ? 'name' : 'id',
            order: USERS_SORT[params.sort].order
          }
        })
        return { users: data, total, fullAccess: false }
      }
    }
  }
})

// ---------------------------------------------------------------------------
// Posts (any post type)
// ---------------------------------------------------------------------------

export interface WpRestResource {
  rest_base: string
  rest_namespace?: string
}

export interface WpPostType extends WpRestResource {
  slug: string
  name: string
  hierarchical: boolean
  taxonomies: string[]
}

export interface WpTaxonomy extends WpRestResource {
  slug: string
  name: string
  hierarchical: boolean
}

export interface WpTerm {
  id: number
  name: string
  slug: string
  taxonomy?: string
  count?: number
}

export type WpPostStatus = 'publish' | 'future' | 'draft' | 'pending' | 'private' | 'trash'

export interface WpPost {
  id: number
  type: string
  status: WpPostStatus | string
  date: string
  modified: string
  link: string
  title: { raw?: string, rendered: string }
  author: number
  sticky?: boolean
  _embedded?: {
    'author'?: { id: number, name: string, avatar_urls?: Record<string, string> }[]
    'wp:term'?: WpTerm[][]
  }
}

export type PostStatusFilter = 'all' | WpPostStatus
export type PostsSort = 'newest' | 'oldest' | 'modified' | 'title'
export type PostsDateFilter = 'any' | '7d' | '30d' | '12m'

export interface PostsListParams {
  /** Set to false to pause the query (e.g. while a meta search is active). Not part of the key. */
  enabled?: boolean
  /** REST collection path, e.g. /wp/v2/posts — from restPath(postType). */
  path: string
  page: number
  perPage: number
  search: string
  status: PostStatusFilter
  author: number | null
  /** Term filters keyed by taxonomy rest_base, e.g. { categories: 5 }. */
  terms: Record<string, number>
  date: PostsDateFilter
  sort: PostsSort
}

export interface PostsList {
  posts: WpPost[]
  total: number
  /** false when the role can't use context=edit / non-public statuses: only published posts are shown. */
  fullAccess: boolean
}

// Post types that aren't regular content (or are managed elsewhere, like media).
const HIDDEN_POST_TYPES = new Set([
  'attachment', 'nav_menu_item', 'wp_block', 'wp_template', 'wp_template_part',
  'wp_navigation', 'wp_global_styles', 'wp_font_family', 'wp_font_face'
])

// What the "All" status means in WP Admin: everything except trash (and auto-drafts).
const ALL_STATUSES = 'publish,future,draft,pending,private'

const POSTS_SORT: Record<PostsSort, { orderby: string, order: 'asc' | 'desc' }> = {
  newest: { orderby: 'date', order: 'desc' },
  oldest: { orderby: 'date', order: 'asc' },
  modified: { orderby: 'modified', order: 'desc' },
  title: { orderby: 'title', order: 'asc' }
}

const DATE_RANGE_DAYS: Record<Exclude<PostsDateFilter, 'any'>, number> = { '7d': 7, '30d': 30, '12m': 365 }

/** REST path for a post type or taxonomy, e.g. /wp/v2/posts or /wp/v2/product_cat. */
export function restPath(resource: WpRestResource, suffix = ''): string {
  return `/${resource.rest_namespace || 'wp/v2'}/${resource.rest_base}${suffix}`
}

export function postsKey() {
  return [...siteKey(), 'posts'] as const
}

const FIVE_MINUTES = 5 * 60_000

/** Content post types exposed in the REST API (posts, pages, custom types such as products). */
export const postTypesQuery = defineQueryOptions(() => {
  const auth = useAuthStore()
  return {
    key: [...siteKey(), 'types'],
    enabled: auth.loggedIn,
    staleTime: FIVE_MINUTES,
    async query(): Promise<WpPostType[]> {
      const types = await auth.request<Record<string, WpPostType>>('/wp/v2/types')
      return Object.values(types).filter(t => t.rest_base && !HIDDEN_POST_TYPES.has(t.slug))
    }
  }
})

/** Taxonomies attached to a post type (categories, tags, product categories, ...). */
export const taxonomiesQuery = defineQueryOptions((type: string) => {
  const auth = useAuthStore()
  return {
    key: [...siteKey(), 'taxonomies', type],
    enabled: auth.loggedIn && !!type,
    staleTime: FIVE_MINUTES,
    async query(): Promise<WpTaxonomy[]> {
      const taxonomies = await auth.request<Record<string, WpTaxonomy>>('/wp/v2/taxonomies', { query: { type } })
      return Object.values(taxonomies).filter(t => t.rest_base)
    }
  }
})

/** Fetches terms of a taxonomy for a filter menu (most used first). */
export function fetchTerms(taxonomy: WpRestResource, search: string) {
  const auth = useAuthStore()
  return auth.request<WpTerm[]>(restPath(taxonomy), {
    query: {
      per_page: 50,
      search: search || undefined,
      orderby: search ? 'name' : 'count',
      order: search ? 'asc' : 'desc',
      _fields: 'id,name,slug,count'
    }
  })
}

/** Fetches users for an author filter menu. */
export function fetchAuthors(search: string) {
  const auth = useAuthStore()
  return auth.request<WpListUser[]>('/wp/v2/users', {
    query: {
      per_page: 50,
      search: search || undefined,
      orderby: 'name',
      order: 'asc',
      _fields: 'id,name,slug,avatar_urls'
    }
  })
}

type PostsFilters = Omit<PostsListParams, 'page' | 'perPage' | 'enabled'>
type RequestQuery = Record<string, string | number | boolean | undefined>

/** REST query parameters for the list filters (everything except paging and status). */
function postsFilterQuery(filters: PostsFilters): RequestQuery {
  const days = filters.date === 'any' ? 0 : DATE_RANGE_DAYS[filters.date]
  return {
    search: filters.search || undefined,
    author: filters.author ?? undefined,
    after: days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined,
    ...POSTS_SORT[filters.sort],
    ...filters.terms
  }
}

/**
 * Requests a page of posts with edit access (all statuses, raw fields). Roles without
 * edit_posts for the type get published posts only; pass `limited` to skip the first try.
 */
async function requestPosts<T>(
  path: string,
  query: RequestQuery,
  status: PostStatusFilter,
  options: { limited?: boolean, signal?: AbortSignal } = {}
): Promise<WpPage<T> & { fullAccess: boolean }> {
  const auth = useAuthStore()
  if (!options.limited) {
    try {
      const page = await auth.requestPage<T>(path, {
        query: { ...query, status: status === 'all' ? ALL_STATUSES : status, context: 'edit' },
        signal: options.signal
      })
      return { ...page, fullAccess: true }
    } catch (error) {
      if (!isLimitedAccessError(error)) throw error
    }
  }
  const page = await auth.requestPage<T>(path, { query, signal: options.signal })
  return { ...page, fullAccess: false }
}

/** One page of posts of any type, with status, author, term, date, search and sort filters. */
export const postsListQuery = defineQueryOptions(({ enabled = true, ...params }: PostsListParams) => {
  const auth = useAuthStore()
  return {
    key: [...postsKey(), { ...params, terms: { ...params.terms } }],
    enabled: enabled && auth.loggedIn && !!params.path,
    placeholderData: (previous: PostsList | undefined) => previous,
    async query({ signal }): Promise<PostsList> {
      const { data, total, fullAccess } = await requestPosts<WpPost>(params.path, {
        ...postsFilterQuery(params),
        page: params.page,
        per_page: params.perPage,
        _embed: 'author,wp:term'
      }, params.status, { signal })
      return { posts: data, total, fullAccess }
    }
  }
})

// ---------------------------------------------------------------------------
// Meta & content search (scanned in the browser)
// ---------------------------------------------------------------------------
// The REST API can't filter by meta, and its `search` matches title, excerpt and
// content together (word by word). So for these searches we download only the
// fields we need for every post matching the other filters, match in the browser,
// then load full rows for the matching IDs one page at a time.
//  - Meta: only keys registered with show_in_rest are visible. The meta condition
//    isn't part of the scan key, so editing it re-matches the cached scan.
//  - Content: the text is also sent as a quoted `search` phrase so WordPress
//    narrows the candidates server-side; the browser then checks post_content.

export type MetaCompare = 'exists' | 'empty' | 'equals' | 'contains' | 'not_contains' | 'is_true' | 'is_false'

/** A meta key the post type exposes over REST, with its schema type (string, boolean, number, ...). */
export interface WpMetaField {
  key: string
  type: string
}

export interface MetaFilter {
  key: string
  compare: MetaCompare
  value: string
}

export interface ContentFilter {
  text: string
  matchCase: boolean
}

export interface PostsScanParams {
  filters: PostsFilters
  /** Download meta for matching in the browser. */
  meta: boolean
  /** Content text to search for (server pre-filter + browser check), or null. */
  content: string | null
}

export interface WpPostScanItem {
  id: number
  meta?: Record<string, unknown>
  content?: { raw?: string, rendered?: string }
}

export interface PostsScanResult {
  /** Scanned posts with only the requested fields, in the server's sort order. */
  posts: WpPostScanItem[]
  scanned: number
  /** Posts matching the other filters (may be more than were scanned). */
  total: number
  truncated: boolean
  fullAccess: boolean
}

export interface ScanProgress {
  scanned: number
  total: number
}

const SCAN_PAGE_SIZE = 100
const SCAN_CONCURRENCY = 4
export const SCAN_MAX_POSTS = 5000

function metaValueToStrings(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value]
  return values
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(v => typeof v === 'object' ? JSON.stringify(v) : String(v))
}

const TRUTHY = new Set(['true', '1', 'yes', 'on'])

/** Boolean meta comes back from REST as true/false, but stored values like "1" or "yes" count too. */
function isTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return typeof value === 'string' && TRUTHY.has(value.trim().toLowerCase())
}

function sameValue(value: string, needle: string): boolean {
  if (value === needle) return true
  // Numbers compare numerically, so "19.990" equals "19.99".
  const a = Number(value)
  const b = Number(needle)
  return value.trim() !== '' && needle !== '' && Number.isFinite(a) && Number.isFinite(b) && a === b
}

/**
 * Registered meta comes back for every post (with its default), so "exists" means "has a
 * value". Booleans are always true/false, so they use is_true / is_false instead.
 */
export function metaMatches(meta: Record<string, unknown> | undefined, filter: MetaFilter): boolean {
  const raw = meta?.[filter.key]
  const values = metaValueToStrings(raw)
  const needle = filter.value.trim()
  switch (filter.compare) {
    case 'is_true': return (Array.isArray(raw) ? raw : [raw]).some(isTruthy)
    case 'is_false': return !(Array.isArray(raw) ? raw : [raw]).some(isTruthy)
    case 'exists': return values.length > 0
    case 'empty': return values.length === 0
    case 'equals': return values.some(v => sameValue(v, needle))
    case 'contains': return values.some(v => v.toLowerCase().includes(needle.toLowerCase()))
    case 'not_contains': return !values.some(v => v.toLowerCase().includes(needle.toLowerCase()))
  }
}

/**
 * Checks the raw post_content (block markup and shortcodes included). Roles without
 * edit access only get rendered HTML, which is matched as plain text instead.
 */
export function contentMatches(content: WpPostScanItem['content'], filter: ContentFilter): boolean {
  const haystack = content?.raw ?? stripTags(content?.rendered ?? '')
  return filter.matchCase
    ? haystack.includes(filter.text)
    : haystack.toLowerCase().includes(filter.text.toLowerCase())
}

/**
 * The `search` value for a scan. Quoting makes WordPress treat the content text as one
 * phrase (LIKE on title, excerpt and content), so results are a superset of real
 * content matches. Text containing `"` can't be quoted, so it isn't pre-filtered.
 */
function scanSearch(filters: PostsFilters, content: string | null): string | undefined {
  const phrase = content && !content.includes('"') ? `"${content}"` : ''
  return [filters.search, phrase].filter(Boolean).join(' ') || undefined
}

/** Meta keys the post type exposes to the REST API, read from the endpoint's schema. */
export const postMetaKeysQuery = defineQueryOptions((path: string) => {
  const auth = useAuthStore()
  return {
    key: [...siteKey(), 'meta-keys', path],
    enabled: auth.loggedIn && !!path,
    staleTime: FIVE_MINUTES,
    async query({ signal }): Promise<WpMetaField[]> {
      const options = await auth.request<{
        schema?: { properties?: { meta?: { properties?: Record<string, { type?: string | string[] }> } } }
      }>(path, { method: 'OPTIONS', signal })
      const properties = options?.schema?.properties?.meta?.properties ?? {}
      return Object.entries(properties)
        .map(([key, schema]) => {
          // Types can be a list like ["boolean", "null"]; use the first real one.
          const types = Array.isArray(schema?.type) ? schema.type : [schema?.type]
          return { key, type: types.find(t => t && t !== 'null') ?? 'string' }
        })
        .sort((a, b) => a.key.localeCompare(b.key))
    }
  }
})

/** Scans the requested fields of every post matching the filters (up to SCAN_MAX_POSTS). */
export const postsScanQuery = defineQueryOptions(({ params, onProgress }: {
  params: PostsScanParams | null
  onProgress?: (progress: ScanProgress) => void
}) => {
  const auth = useAuthStore()
  return {
    key: [...postsKey(), 'scan', params ? { ...params, filters: { ...params.filters, terms: { ...params.filters.terms } } } : null],
    enabled: auth.loggedIn && !!params?.filters.path && (params.meta || !!params.content),
    staleTime: 60_000,
    async query({ signal }): Promise<PostsScanResult> {
      const { filters, meta, content } = params!
      const fields = ['id', meta && 'meta', content && 'content'].filter(Boolean).join(',')
      const query: RequestQuery = {
        ...postsFilterQuery(filters),
        search: scanSearch(filters, content),
        // WordPress 6.4+ can limit the search to post_content; older versions ignore it.
        // Only safe when the search box is empty (it should keep searching all columns).
        search_columns: content && !filters.search ? 'post_content' : undefined,
        per_page: SCAN_PAGE_SIZE,
        _fields: fields
      }

      const first = await requestPosts<WpPostScanItem>(filters.path, { ...query, page: 1 }, filters.status, { signal })
      const limit = Math.min(first.total, SCAN_MAX_POSTS)
      const pageCount = Math.ceil(limit / SCAN_PAGE_SIZE)
      const pages: WpPostScanItem[][] = [first.data]
      let scanned = first.data.length
      onProgress?.({ scanned, total: limit })

      let nextPage = 2
      async function worker() {
        while (nextPage <= pageCount) {
          const page = nextPage++
          const result = await requestPosts<WpPostScanItem>(filters.path, { ...query, page }, filters.status, {
            limited: !first.fullAccess,
            signal
          })
          pages[page - 1] = result.data
          scanned += result.data.length
          onProgress?.({ scanned, total: limit })
        }
      }
      await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, pageCount - 1) }, worker))

      return {
        posts: pages.flat(),
        scanned,
        total: first.total,
        truncated: first.total > SCAN_MAX_POSTS,
        fullAccess: first.fullAccess
      }
    }
  }
})

/** Full table rows for specific post IDs, kept in the given order. */
export const postsByIdsQuery = defineQueryOptions(({ path, ids, status, fullAccess, enabled = true }: {
  path: string
  ids: number[]
  status: PostStatusFilter
  fullAccess: boolean
  enabled?: boolean
}) => {
  const auth = useAuthStore()
  return {
    key: [...postsKey(), 'by-ids', path, status, fullAccess, [...ids]],
    enabled: enabled && auth.loggedIn && !!path,
    placeholderData: (previous: WpPost[] | undefined) => previous,
    async query({ signal }): Promise<WpPost[]> {
      if (!ids.length) return []
      const { data } = await requestPosts<WpPost>(path, {
        include: ids.join(','),
        orderby: 'include',
        per_page: ids.length,
        _embed: 'author,wp:term'
      }, status, { limited: !fullAccess, signal })
      return data
    }
  }
})
