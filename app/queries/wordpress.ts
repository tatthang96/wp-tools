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

/** One page of posts of any type, with status, author, term, date, search and sort filters. */
export const postsListQuery = defineQueryOptions((params: PostsListParams) => {
  const auth = useAuthStore()
  return {
    key: [...postsKey(), { ...params, terms: { ...params.terms } }],
    enabled: auth.loggedIn && !!params.path,
    placeholderData: (previous: PostsList | undefined) => previous,
    async query(): Promise<PostsList> {
      const days = params.date === 'any' ? 0 : DATE_RANGE_DAYS[params.date]
      const base = {
        page: params.page,
        per_page: params.perPage,
        search: params.search || undefined,
        author: params.author ?? undefined,
        after: days ? new Date(Date.now() - days * 86_400_000).toISOString() : undefined,
        ...POSTS_SORT[params.sort],
        ...params.terms,
        _embed: 'author,wp:term'
      }

      try {
        const { data, total } = await auth.requestPage<WpPost>(params.path, {
          query: {
            ...base,
            status: params.status === 'all' ? ALL_STATUSES : params.status,
            context: 'edit'
          }
        })
        return { posts: data, total, fullAccess: true }
      } catch (error) {
        if (!isLimitedAccessError(error)) throw error
        // Roles without edit_posts for this type can only read published content.
        const { data, total } = await auth.requestPage<WpPost>(params.path, { query: base })
        return { posts: data, total, fullAccess: false }
      }
    }
  }
})
