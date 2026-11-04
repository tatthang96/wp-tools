import { useMutation, useQueryCache } from '@pinia/colada'
import { postsKey, type WpPost } from '~/queries/wordpress'

export type PostAction = 'trash' | 'restore' | 'delete' | 'publish'

interface PostActionVars {
  action: PostAction
  /** REST collection path of the post type, e.g. /wp/v2/posts. */
  path: string
  posts: Pick<WpPost, 'id'>[]
}

const DONE_MESSAGES: Record<PostAction, string> = {
  trash: 'moved to Trash',
  restore: 'restored as draft',
  delete: 'permanently deleted',
  publish: 'published'
}

/** Single and bulk post actions. Refreshes every posts query when done. */
export function usePostActions() {
  const auth = useAuthStore()
  const queryCache = useQueryCache()
  const toast = useToast()

  function run(action: PostAction, path: string, id: number) {
    const itemPath = `${path}/${id}`
    switch (action) {
      case 'trash':
        return auth.request(itemPath, { method: 'DELETE' })
      case 'delete':
        return auth.request(itemPath, { method: 'DELETE', query: { force: true } })
      case 'restore':
        // The REST API has no "untrash"; setting a status takes the post out of the trash.
        return auth.request(itemPath, { method: 'POST', body: { status: 'draft' } })
      case 'publish':
        return auth.request(itemPath, { method: 'POST', body: { status: 'publish' } })
    }
  }

  const { mutateAsync, isLoading } = useMutation({
    async mutation({ action, path, posts }: PostActionVars) {
      const results = await Promise.allSettled(posts.map(post => run(action, path, post.id)))
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      return { action, done: results.length - failures.length, failures }
    },
    onSuccess({ action, done, failures }) {
      if (done) {
        toast.add({
          title: `${done} ${done === 1 ? 'item' : 'items'} ${DONE_MESSAGES[action]}`,
          icon: 'i-lucide-check',
          color: 'success'
        })
      }
      if (failures.length) {
        const reason = failures[0]!.reason
        toast.add({
          title: `${failures.length} ${failures.length === 1 ? 'item' : 'items'} failed`,
          description: reason instanceof WpError ? reason.message : 'The site returned an error.',
          icon: 'i-lucide-circle-alert',
          color: 'error'
        })
      }
    },
    onSettled() {
      return queryCache.invalidateQueries({ key: [...postsKey()] })
    }
  })

  return {
    runAction: (action: PostAction, path: string, posts: Pick<WpPost, 'id'>[]) => mutateAsync({ action, path, posts }),
    running: isLoading
  }
}
