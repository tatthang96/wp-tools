/**
 * Switching the active site. The current page stays, but its URL filters are dropped
 * (term/author IDs belong to the old site); app.vue keys pages by the active session,
 * so the page remounts with fresh state.
 */
export function useSiteSwitch() {
  const auth = useAuthStore()
  const route = useRoute()

  async function switchSite(id: string) {
    if (id === auth.currentId) return
    await navigateTo({ path: route.path }, { replace: true })
    auth.switchTo(id)
  }

  /** Signs out of the active site, moving to the next saved one (or the login page). */
  async function signOutCurrent() {
    auth.logout()
    await navigateTo(auth.loggedIn ? { path: route.path } : '/', { replace: true })
  }

  async function signOutAll() {
    auth.logoutAll()
    await navigateTo('/')
  }

  return { switchSite, signOutCurrent, signOutAll }
}
