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
const LIMITED_ACCESS_CODES = ['rest_forbidden_context', 'rest_forbidden_orderby', 'rest_user_cannot_view']

function isLimitedAccessError(error: unknown) {
  return error instanceof WpError && LIMITED_ACCESS_CODES.includes(error.code)
}

function siteKey() {
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
