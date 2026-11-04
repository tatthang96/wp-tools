import { useQueryCache } from '@pinia/colada'

// Signs in to a WordPress site with an application password.
// The session (including the application password) is kept in this browser only:
// sessionStorage by default, localStorage when "Remember me" is checked.
const STORAGE_KEY = 'wp-tools-session'

function isSession(value: unknown): value is WpSession {
  const s = value as WpSession | null
  return !!s?.root?.siteUrl && !!s.username && !!s.appPassword && !!s.user?.id
}

function readStoredSession(): WpSession | null {
  for (const storage of [sessionStorage, localStorage]) {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) continue
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isSession(parsed)) return parsed
    } catch {
      // fall through and drop the corrupt entry
    }
    storage.removeItem(STORAGE_KEY)
  }
  return null
}

function clearStoredSession() {
  sessionStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(STORAGE_KEY)
}

export const useAuthStore = defineStore('auth', () => {
  const queryCache = useQueryCache()

  const session = ref<WpSession | null>(import.meta.server ? null : readStoredSession())

  const user = computed(() => session.value?.user ?? null)
  const siteUrl = computed(() => session.value?.root.siteUrl ?? '')
  const siteName = computed(() => session.value?.siteName ?? '')
  const loggedIn = computed(() => !!session.value)

  async function login(credentials: WpCredentials & { remember?: boolean }) {
    const next = await connectWordPress(credentials)
    clearStoredSession()
    const storage = credentials.remember ? localStorage : sessionStorage
    storage.setItem(STORAGE_KEY, JSON.stringify(next))
    session.value = next
  }

  function logout() {
    clearStoredSession()
    session.value = null
    // Drop every cached WordPress response so nothing leaks into the next session.
    for (const entry of queryCache.getEntries({ key: ['wp'] })) queryCache.remove(entry)
  }

  function request<T>(path: string, options?: WpRequestOptions) {
    if (!session.value) throw new WpError('not_signed_in', 'You are not signed in.')
    return wpRequest<T>(session.value, path, options)
  }

  function requestPage<T>(path: string, options?: WpRequestOptions) {
    if (!session.value) throw new WpError('not_signed_in', 'You are not signed in.')
    return wpRequestPage<T>(session.value, path, options)
  }

  return { session, user, siteUrl, siteName, loggedIn, login, logout, request, requestPage }
})
