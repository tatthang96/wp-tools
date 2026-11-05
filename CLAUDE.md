# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WP Tools: a client-only Nuxt 4 SPA (`ssr: false`) admin dashboard that signs in to a WordPress site with an **application password** and calls that site's REST API directly from the browser. There is no backend; `pnpm generate` produces static files in `.output/public`.

Stack: Nuxt 4, Nuxt UI v4 (Tailwind v4), Pinia + Pinia Colada for state/data fetching, VueUse (`@vueuse/nuxt`) for composable utilities, Zod for form schemas. Package manager is pnpm.

## Commands

```bash
pnpm dev          # dev server on http://localhost:3000
pnpm generate     # static SPA build → .output/public (use this to deploy, not `pnpm build`)
pnpm preview      # preview the generated build
pnpm lint         # ESLint (@nuxt/eslint, stylistic: no trailing commas, 1tbs braces)
pnpm typecheck    # nuxt typecheck (vue-tsc)
```

There is no test suite. CI (`.github/workflows/ci.yml`) runs `lint` and `typecheck` on push. `pnpm exec eslint --fix <path>` fixes most lint errors, including the `nuxt/nuxt-config-keys-order` rule in `nuxt.config.ts`.

## Architecture

Data flow: page → Pinia Colada query (`app/queries/`) → auth store (`app/stores/auth.ts`) → REST helpers (`app/utils/wordpress.ts`) → WordPress site.

- **`app/utils/wordpress.ts`**: plain functions, no Vue state. Login (`connectWordPress`), authenticated requests (`wpRequest`, and `wpRequestPage`, which also returns the total from the `X-WP-Total` header), URL building, and `WpError` (keeps WordPress's error `code`).
  - **API discovery:** tries `/wp-json/` first, then falls back to `/?rest_route=` for sites with plain permalinks. Always build REST URLs with `wpRestUrl(session.root, path, query)`; never join `/wp-json` onto a URL by hand.
  - **Login check:** confirms the site advertises `application-passwords` in its index, then calls `/wp/v2/users/me?context=edit` with Basic auth.
  - **Error messages:** WordPress error codes such as `incorrect_password` and `rest_not_logged_in` become user-facing messages in `errorFromResponse`.
- **`app/stores/auth.ts`** (`useAuthStore`): several saved sessions (one per site + WordPress user, `sessionId()` = `siteUrl#userId`) plus one active site. Pages call the store's `request` / `requestPage` instead of the util functions directly; these use the active session.
  - **Storage:** VueUse storage refs. "Remember me" sessions go in `useLocalStorage('wp-tools-sessions')`, which all tabs share and keep in sync. The others go in `useSessionStorage('wp-tools-tab-sessions')`, for this tab only. The active site is per tab (`wp-tools-active-session`), so two tabs can work on two sites; `session` falls back to the first saved site if the active one disappears. The pre-multi-site key `wp-tools-session` is migrated on load.
  - **Actions:** `login()` adds or refreshes a session and makes it active. `switchTo()` changes the active site. `removeSession()` and `logout()` sign out of one site and clear that site's cache entries; `logoutAll()` signs out of everything. When no session is left, a `whenever(() => !loggedIn)` in the store removes every cache entry under `['wp']`, and one in the dashboard layout redirects to `/`.
  - **Switching sites:** go through `useSiteSwitch()`. It drops the URL query (term and author IDs belong to the old site) before switching. `app.vue` keys `<NuxtPage>` by the active session id, so pages remount with fresh state.
  - **Multisite:** each subsite is just another saved site (enter its URL, including the subfolder). Core REST can't list a network's sites, so there's no auto-discovery.
- **Site switcher UI:** `SiteSwitcher.vue` sits in the sidebar header. **Add site** opens `ConnectSiteForm.vue` in a dialog whose open state is shared via `useAddSiteDialog()` (`createGlobalState`); the same form is used on the login page. The Settings page has the "Connected sites" list.
- **`app/queries/wordpress.ts`**: query definitions built with `defineQueryOptions`.
  - **Keys:** must start with `siteKey()` = `['wp', siteUrl, username]`, so cached data can't leak between sites or users, and so logout can clear it.
  - **Enabled:** every query sets `enabled: auth.loggedIn`.
  - **Use in pages:** `useQuery(pluginsQuery)` or `useQuery(() => usersListQuery(params))`.
  - **Mutations:** writes use `useMutation`. The login page and `app/composables/usePostActions.ts` (trash, restore, delete, publish) are the examples; after a write, invalidate the affected key, e.g. `postsKey()`.
  - **Post types:** the Posts page works for any post type the site exposes over REST. The collection path comes from the type's `rest_namespace` and `rest_base` via `restPath()`, never from a hard-coded `/wp/v2/posts`. Taxonomy filters are sent as `<taxonomy rest_base>=<term id>`.
- **`app/components/PostEditor.vue`**: the drawer behind each row's "Edit" action.
  - **Loading:** it loads a fresh `context=edit` copy via `postEditQuery` (`staleTime: 0`, no refetch on window focus) and resets the form every time it opens.
  - **Saving:** it sends only changed fields (title, slug, status, sticky, excerpt, raw `content`, term IDs under each taxonomy's `rest_base`, and scalar registered meta) through `savePost()`. That first compares `modified_gmt` and throws `edit_conflict` if the post changed on the server; the UI then offers "Overwrite anyway" or "Reload".
  - **Closing:** unsaved changes block closing. The built-in Slideover close button is a `DialogClose` that skips that check, so it's disabled (`:close="false"`) in favour of a custom button in `#actions`.
- **`app/components/RemoteSelectMenu.vue`**: a menu whose options are searched on the site as you type (authors, taxonomy terms), single or `multiple`. It remembers the labels of selected values, and `initialItems` seeds labels for values that are already selected.
- **`app/middleware/auth.global.ts`**: sends `/admin/**` to `/` when signed out, and `/` to `/admin` when signed in.
- **Pages and layouts:**
  - **`/`** is the login page.
  - **`/admin/**`** pages use `definePageMeta({ layout: 'dashboard' })`. The layout is `UDashboardGroup` with a sidebar, and each page renders a `UDashboardPanel` that uses the `#header` and `#body` slots.
  - **List pages (Users, Posts):** they share a pattern. Search is debounced with `refDebounced(computed(() => search.value.trim()), 300)`, declared before the query that reads it. A watcher with `flush: 'sync'` resets `page` to 1 when filters change, which avoids fetching the old page with new filters. The Posts page also keeps its filters in the URL query (`type`, `status`, `s`, `author`, `tax_<rest_base>`, `date`, `sort`, `page`).

### WordPress permission handling

The REST API returns different data depending on the signed-in user's capabilities, and the UI must handle that rather than fail:
- **`/wp/v2/plugins`:** needs `activate_plugins`. For other roles it returns 403.
- **`/wp/v2/users` admin-only parameters:** `context=edit` (email, roles, registered date), `orderby=registered_date` and `roles=` need `list_users`. Without that capability, WordPress returns `rest_forbidden_context`, `rest_forbidden_orderby` or `rest_user_cannot_view`. The queries catch these codes, retry with public fields only, and set `fullAccess: false` or `limited: true`. Without `list_users`, WordPress only lists authors with published posts.
- **Posts of any type:** `context=edit` and non-public statuses need `edit_posts` for that type. Without it, WordPress returns `rest_forbidden_context` or `rest_forbidden_status`, and the posts query falls back to published posts only (`fullAccess: false`); the page then hides selection and actions. There is no "untrash" endpoint: restoring means setting `status: 'draft'`. Even `title.raw` can contain HTML entities, so always pass titles through `stripTags`.
- **Meta and content search (browser-side scans):**
  - **Why scan:** core REST can't filter by meta, and its `search` matches title, excerpt and content together, word by word. It also exposes only meta registered with `show_in_rest`, listing those keys in the collection's `OPTIONS` schema under `schema.properties.meta.properties` (`postMetaKeysQuery`).
  - **The scan:** `postsScanQuery` downloads only the needed fields (`_fields=id,meta` and/or `content`) for every post matching the *other* filters, 100 per page, 4 requests at once, at most `SCAN_MAX_POSTS`.
  - **Meta types:** `postMetaKeysQuery` returns each key with its schema `type`, and the filter offers conditions per type. REST returns boolean meta as `true`/`false` on every post, so "has a value" and "is empty" would be meaningless for booleans; they get `is_true`/`is_false` instead, which also accept stored `1`/`yes`/`on`. `equals` compares numerically when both sides are numbers. If a key is missing from the schema, check the registration: since WordPress 5.5, `register_meta()` refuses keys whose `default` doesn't match their `type` (e.g. `'default' => ''` with `'type' => 'boolean'`).
  - **Matching:** the page matches with `metaMatches()` / `contentMatches()`, then loads full rows for the current page via `postsByIdsQuery` (`include` + `orderby=include`).
  - **Cache key:** the meta condition and "match case" are excluded, so editing them re-matches cached data. The content text is included, because it is also sent to the server.
  - **Content pre-filter:** the content text is sent as a quoted `search` phrase, so WordPress narrows candidates on the server; the results are a superset of real matches. `search_columns=post_content` is added when the search box is empty; WordPress 6.4+ honours it and older versions ignore it. The browser then checks the raw `post_content`, including block markup.
  - **Cancelling:** queries pass Pinia Colada's `signal` through to `fetch`, so a changed filter cancels an in-flight scan.
  - **Decision:** the owner chose browser scans over a companion WordPress plugin, which would be needed for private or unregistered meta like `_price`.
- **What core REST can't do:** there's no endpoint for listing roles, listing multisite sites, or checking plugin updates.

### Constraints

- **Stay a static SPA.** The owner decided against a backend proxy and against adding XSS hardening; don't propose either unless asked.
- **CORS:** requests go cross-origin to the WordPress site, which relies on WordPress's default CORS headers, including `Access-Control-Expose-Headers: X-WP-Total`.
- **PHP notices before the JSON:** sites with `WP_DEBUG_DISPLAY` print PHP notices as HTML before the JSON body. `readJson` in `app/utils/wordpress.ts` skips that leading output; keep using it rather than `res.json()`.
- **HTML in WordPress strings:** WordPress strings such as the site name and error messages can contain HTML or entities. Convert them with `stripTags` (DOMParser).

## Conventions

- **VueUse first:** before writing a composable, watcher helper, timer, storage access, event listener, or browser-API wrapper, check whether VueUse already provides it, and use that instead of hand-rolled code. The project skill in `.agents/skills/vueuse-functions/` (linked at `.claude/skills/vueuse-functions`) maps requirements to functions; follow each function's `Invocation` rule. `@vueuse/nuxt` auto-imports `@vueuse/core` functions. Non-function exports such as `StorageSerializers` need an explicit import from `@vueuse/core`. Functions from other VueUse packages, such as `@vueuse/router` and `@vueuse/integrations`, aren't installed, so ask before adding one. Examples here: `refDebounced` (search inputs), `useSessionStorage`/`useLocalStorage` (auth), `watchImmediate`, `whenever`.

- **Nuxt UI:** follow the project skill in `.agents/skills/nuxt-ui/` (linked at `.claude/skills/nuxt-ui`). Use semantic colors (`text-muted`, `text-highlighted`, `bg-elevated`), never raw Tailwind palette colors, and keep the app wrapped in `UApp`. Theme colors are in `app/app.config.ts` (primary green, neutral slate).
- **Table cells:** build custom cells with `h()` and `resolveComponent('UBadge')` and similar, as in `app/pages/admin/users.vue`.
- **Imports:** `useQuery` / `useMutation` / `defineQueryOptions` are imported explicitly from `@pinia/colada`. Utils, stores and composables are auto-imported.
- **Commits:** the repo's local git identity is `tatthang96 <12530560+tatthang96@users.noreply.github.com>`. The `origin` remote uses the SSH alias `tatthang96-GitHub`.
