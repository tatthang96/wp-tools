import { useQueryCache } from '@pinia/colada'
import { StorageSerializers } from '@vueuse/core'

// Signs in to one or more WordPress sites with application passwords and tracks which
// one is active. Sessions (including the application passwords) stay in this browser:
//  - "Remember me" sessions live in localStorage (shared by all tabs, synced across them)
//  - other sessions live in sessionStorage (this tab only, gone when it closes)
//  - the active site is per tab (sessionStorage), so two tabs can work on two sites.
const REMEMBERED_KEY = 'wp-tools-sessions'
const TAB_KEY = 'wp-tools-tab-sessions'
const ACTIVE_KEY = 'wp-tools-active-session'
/** Storage key used before multi-site support; migrated on load. */
const LEGACY_KEY = 'wp-tools-session'

function isSession(value: unknown): value is WpSession {
  const s = value as WpSession | null
  return !!s?.root?.siteUrl && !!s.username && !!s.appPassword && !!s.user?.id
}

/** One session per site + WordPress user. */
export function sessionId(session: WpSession): string {
  return `${session.root.siteUrl}#${session.user.id}`
}

function migrateLegacySession(storage: Storage, target: Ref<WpSession[]>) {
  const raw = storage.getItem(LEGACY_KEY)
  if (!raw) return
  storage.removeItem(LEGACY_KEY)
  try {
    const legacy: unknown = JSON.parse(raw)
    if (isSession(legacy) && !target.value.some(s => sessionId(s) === sessionId(legacy))) {
      target.value = [...target.value, legacy]
    }
  } catch {
    // ignore a corrupt entry
  }
}

export const useAuthStore = defineStore('auth', () => {
  const queryCache = useQueryCache()

  const listOptions = { serializer: StorageSerializers.object }
  const remembered = useLocalStorage<WpSession[]>(REMEMBERED_KEY, [], listOptions)
  const tabOnly = useSessionStorage<WpSession[]>(TAB_KEY, [], listOptions)
  const activeId = useSessionStorage<string | null>(ACTIVE_KEY, null)

  if (import.meta.client) {
    migrateLegacySession(localStorage, remembered)
    migrateLegacySession(sessionStorage, tabOnly)
  }

  /** All saved sessions; a tab-only session wins over a remembered copy of the same login. */
  const sessions = computed<WpSession[]>(() => {
    const byId = new Map<string, WpSession>()
    for (const s of [...(remembered.value ?? []), ...(tabOnly.value ?? [])]) {
      if (isSession(s)) byId.set(sessionId(s), s)
    }
    return [...byId.values()]
  })

  /** The active site; falls back to the first saved one (e.g. after it was removed in another tab). */
  const session = computed<WpSession | null>(() =>
    sessions.value.find(s => sessionId(s) === activeId.value) ?? sessions.value[0] ?? null
  )
  const currentId = computed(() => session.value ? sessionId(session.value) : null)

  const user = computed(() => session.value?.user ?? null)
  const siteUrl = computed(() => session.value?.root.siteUrl ?? '')
  const siteName = computed(() => session.value?.siteName ?? '')
  const loggedIn = computed(() => !!session.value)

  function isRemembered(id: string) {
    return (remembered.value ?? []).some(s => sessionId(s) === id)
  }

  /** Connects to a site (or refreshes an existing login) and makes it the active one. */
  async function login(credentials: WpCredentials & { remember?: boolean }) {
    const next = await connectWordPress(credentials)
    const id = sessionId(next)
    const others = (list: WpSession[] | null) => (list ?? []).filter(s => sessionId(s) !== id)
    remembered.value = credentials.remember ? [...others(remembered.value), next] : others(remembered.value)
    tabOnly.value = credentials.remember ? others(tabOnly.value) : [...others(tabOnly.value), next]
    activeId.value = id
  }

  function switchTo(id: string) {
    if (sessions.value.some(s => sessionId(s) === id)) activeId.value = id
  }

  function clearCacheFor(session: WpSession) {
    for (const entry of queryCache.getEntries({ key: ['wp', session.root.siteUrl, session.username] })) {
      queryCache.remove(entry)
    }
  }

  /** Signs out of one site. If it was active, another saved site (if any) becomes active. */
  function removeSession(id: string) {
    const target = sessions.value.find(s => sessionId(s) === id)
    remembered.value = (remembered.value ?? []).filter(s => sessionId(s) !== id)
    tabOnly.value = (tabOnly.value ?? []).filter(s => sessionId(s) !== id)
    if (activeId.value === id) activeId.value = sessions.value[0] ? sessionId(sessions.value[0]) : null
    if (target) clearCacheFor(target)
  }

  /** Signs out of the active site. */
  function logout() {
    if (currentId.value) removeSession(currentId.value)
  }

  function logoutAll() {
    remembered.value = []
    tabOnly.value = []
    activeId.value = null
  }

  // Drop every cached WordPress response once no session is left (including sign-outs
  // in another tab), so nothing leaks into the next one.
  whenever(() => !loggedIn.value, () => {
    for (const entry of queryCache.getEntries({ key: ['wp'] })) queryCache.remove(entry)
  })

  function request<T>(path: string, options?: WpRequestOptions) {
    if (!session.value) throw new WpError('not_signed_in', 'You are not signed in.')
    return wpRequest<T>(session.value, path, options)
  }

  function requestPage<T>(path: string, options?: WpRequestOptions) {
    if (!session.value) throw new WpError('not_signed_in', 'You are not signed in.')
    return wpRequestPage<T>(session.value, path, options)
  }

  return {
    sessions,
    session,
    currentId,
    user,
    siteUrl,
    siteName,
    loggedIn,
    isRemembered,
    login,
    switchTo,
    removeSession,
    logout,
    logoutAll,
    request,
    requestPage
  }
})
