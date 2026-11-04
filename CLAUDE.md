# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

WP Tools: a client-only Nuxt 4 SPA (`ssr: false`) admin dashboard that signs in to a WordPress site with an **application password** and calls that site's REST API directly from the browser. There is no backend; `pnpm generate` produces static files in `.output/public`.

Stack: Nuxt 4, Nuxt UI v4 (Tailwind v4), Pinia + Pinia Colada for state/data fetching, Zod for form schemas. Package manager is pnpm.

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
- **`app/stores/auth.ts`** (`useAuthStore`): the session, including the application password, is kept in `sessionStorage`, or in `localStorage` when "Remember me" is ticked. `logout()` also removes every Pinia Colada cache entry under the `['wp']` key. Pages call the store's `request` / `requestPage` instead of the util functions directly.
- **`app/queries/wordpress.ts`**: query definitions built with `defineQueryOptions`.
  - **Keys:** must start with `siteKey()` = `['wp', siteUrl, username]`, so cached data can't leak between sites or users, and so logout can clear it.
  - **Enabled:** every query sets `enabled: auth.loggedIn`.
  - **Use in pages:** `useQuery(pluginsQuery)` or `useQuery(() => usersListQuery(params))`.
  - **Mutations:** the login page uses `useMutation`. Follow that pattern for writes.
- **`app/middleware/auth.global.ts`**: sends `/admin/**` to `/` when signed out, and `/` to `/admin` when signed in.
- **Pages and layouts:**
  - **`/`** is the login page.
  - **`/admin/**`** pages use `definePageMeta({ layout: 'dashboard' })`. The layout is `UDashboardGroup` with a sidebar, and each page renders a `UDashboardPanel` that uses the `#header` and `#body` slots.

### WordPress permission handling

The REST API returns different data depending on the signed-in user's capabilities, and the UI must handle that rather than fail:
- **`/wp/v2/plugins`:** needs `activate_plugins`. For other roles it returns 403.
- **`/wp/v2/users` admin-only parameters:** `context=edit` (email, roles, registered date), `orderby=registered_date` and `roles=` need `list_users`. Without that capability, WordPress returns `rest_forbidden_context`, `rest_forbidden_orderby` or `rest_user_cannot_view`. The queries catch these codes, retry with public fields only, and set `fullAccess: false` or `limited: true`. Without `list_users`, WordPress only lists authors with published posts.
- **What core REST can't do:** there's no endpoint for listing roles, listing multisite sites, or checking plugin updates.

### Constraints

- **Stay a static SPA.** The owner decided against a backend proxy and against adding XSS hardening; don't propose either unless asked.
- **CORS:** requests go cross-origin to the WordPress site, which relies on WordPress's default CORS headers, including `Access-Control-Expose-Headers: X-WP-Total`.
- **HTML in WordPress strings:** WordPress strings such as the site name and error messages can contain HTML or entities. Convert them with `stripTags` (DOMParser).

## Conventions

- **Nuxt UI:** follow the project skill in `.agents/skills/nuxt-ui/` (linked at `.claude/skills/nuxt-ui`). Use semantic colors (`text-muted`, `text-highlighted`, `bg-elevated`), never raw Tailwind palette colors, and keep the app wrapped in `UApp`. Theme colors are in `app/app.config.ts` (primary green, neutral slate).
- **Table cells:** build custom cells with `h()` and `resolveComponent('UBadge')` and similar, as in `app/pages/admin/users.vue`.
- **Imports:** `useQuery` / `useMutation` / `defineQueryOptions` are imported explicitly from `@pinia/colada`. Utils, stores and composables are auto-imported.
- **Commits:** the repo's local git identity is `tatthang96 <12530560+tatthang96@users.noreply.github.com>`. The `origin` remote uses the SSH alias `tatthang96-GitHub`.
