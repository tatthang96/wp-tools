import { useQueryCache } from '@pinia/colada'
import { StorageSerializers } from '@vueuse/core'

// Signs in to a WordPress site with an application password.
// The session (including the application password) is kept in this browser only:
// sessionStorage by default, localStorage when "Remember me" is checked.
const STORAGE_KEY = 'wp-tools-session'

function isSession(value: unknown): value is WpSession {
  const s = value as WpSession | null
  return !!s?.root?.siteUrl && !!s.username && !!s.appPassword && !!s.user?.id
}

export const useAuthStore = defineStore('auth', () => {
  const queryCache = useQueryCache()

  // Reactive storage refs: `null` removes the key. The localStorage copy also syncs
  // across tabs, so signing out in one tab signs out the others.
  const storageOptions = { serializer: StorageSerializers.object }
  const tabSession = useSessionStorage<WpSession | null>(STORAGE_KEY, null, storageOptions)
  const rememberedSession = useLocalStorage<WpSession | null>(STORAGE_KEY, null, storageOptions)

  const session = computed<WpSession | null>(() => {
    if (isSession(tabSession.value)) return tabSession.value
    if (isSession(rememberedSession.value)) return rememberedSession.value
    return null
  })

  const user = computed(() => session.value?.user ?? null)
  const siteUrl = computed(() => session.value?.root.siteUrl ?? '')
  const siteName = computed(() => session.value?.siteName ?? '')
  const loggedIn = computed(() => !!session.value)

  async function login(credentials: WpCredentials & { remember?: boolean }) {
    const next = await connectWordPress(credentials)
    tabSession.value = credentials.remember ? null : next
    rememberedSession.value = credentials.remember ? next : null
  }

  function logout() {
    tabSession.value = null
    rememberedSession.value = null
  }

  // Drop every cached WordPress response whenever the session ends (including a
  // sign-out in another tab), so nothing leaks into the next session.
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

  return { session, user, siteUrl, siteName, loggedIn, login, logout, request, requestPage }
})
