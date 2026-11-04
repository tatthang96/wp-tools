export default defineNuxtRouteMiddleware((to) => {
  const auth = useAuthStore()
  const isAdminRoute = to.path === '/admin' || to.path.startsWith('/admin/')

  if (isAdminRoute && !auth.loggedIn) {
    return navigateTo({ path: '/', query: { redirect: to.fullPath } })
  }

  if (to.path === '/' && auth.loggedIn) {
    return navigateTo('/admin')
  }
})
