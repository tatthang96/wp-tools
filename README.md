# WP Tools

A dashboard for managing WordPress sites from the browser. Sign in with a WordPress **application password** and WP Tools talks directly to your site's REST API. You don't install a plugin on the site and there's no server to run.

Built with [Nuxt 4](https://nuxt.com), [Nuxt UI](https://ui.nuxt.com), [Pinia Colada](https://pinia-colada.esm.dev) and [VueUse](https://vueuse.org).

## Features

- **Several sites:** connect any number of WordPress sites (or multisite subsites) and switch between them from the sidebar. Each browser tab can work on a different site.
- **Overview:** the number of connected sites, active and inactive plugins, and users.
- **Posts:** manage posts, pages and any custom post type exposed to the REST API.
  - Filter by status, author, categories, tags and other taxonomies, and date. Search and sort the list.
  - **Meta search:** find posts by custom field value, with conditions that suit the field type (text, number, true/false).
  - **Content search:** find exact text in `post_content`, including block markup and shortcodes.
  - **Edit in a drawer:** change the title, slug, status, sticky flag, raw HTML content, excerpt, terms and custom fields without opening WP Admin. If the post changed on the site in the meantime, you're warned before your save would overwrite it.
  - Publish, trash, restore and permanently delete, one post at a time or in bulk.
- **Blocks:**
  - **Block types:** browse every registered block by category and provider, and see its attributes, styles and variations.
    - Hide or show blocks in your own block editor.
    - Jump to the posts that use a block.
  - **Patterns:** list synced and unsynced patterns. Edit, trash, restore or delete them.
- **Users:** search and filter by role.
- **Settings:** your connected sites and the connection details for each.

The dashboard adapts to your WordPress role. When your role lacks a capability (for example, editors can't list plugins or every user), it shows what it can and explains what's missing instead of failing.

## Connecting a site

1. In WP Admin, go to **Users → Profile → Application Passwords**. Enter a name and click **Add New Application Password**.
2. Open WP Tools. Enter the site URL, your username or email, and the generated password.
3. Tick **Remember me** to keep the site connected in this browser. Otherwise it's forgotten when the tab closes.

Requirements:
- WordPress 5.6 or later, with application passwords enabled and served over HTTPS (or on a local development site).
- The REST API reachable from the browser. Both pretty permalinks (`/wp-json/`) and plain permalinks (`?rest_route=`) work.
- Some features need newer versions: hiding blocks needs WordPress 6.1+, and the content-only search filter works best on 6.4+.

> Credentials are stored only in this browser (localStorage for remembered sites, sessionStorage otherwise) and are sent only to the WordPress site you connected. Use WP Tools on devices you trust, and revoke the application password in WP Admin when you no longer need it.

## Limitations

These come from WordPress's core REST API:
- **Meta search** sees only custom fields registered with `show_in_rest`. Private fields such as `_price` aren't visible.
- **Meta and content searches** run in your browser and check at most 5,000 posts at a time.
- **Hidden blocks:** a block can only be hidden from your own editor. Disabling a block for the whole site needs PHP (`allowed_block_types_all`).
- **Missing from the REST API:** blocks registered only in JavaScript, a multisite network's list of sites, user roles, and plugin updates.

## Development

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm lint
pnpm typecheck
```

See [CLAUDE.md](CLAUDE.md) for the architecture and coding conventions.

## Deployment

WP Tools is a static single-page app (`ssr: false`).

### GitHub Pages (automatic)

`.github/workflows/deploy.yml` builds the app and publishes it to GitHub Pages on every push to `main`. You can also run it by hand from the Actions tab. The app is served at `https://<user>.github.io/<repo>/` (for this repo, https://tatthang96.github.io/wp-tools/).

One-time setup: in the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.

The site is served over HTTPS, so browsers block connections to WordPress sites served over plain `http://`, including local sites like `http://mysite.test`. Use `pnpm dev` for those.

### Any static host

```bash
pnpm generate     # outputs .output/public
pnpm preview      # preview the build locally
```

Serve `.output/public` from any static host. Configure the host to fall back to `200.html` (or `index.html`) for unknown routes so client-side routing works. To serve from a subpath, set `NUXT_APP_BASE_URL` when building, e.g. `NUXT_APP_BASE_URL=/tools/ pnpm generate`.

## License

[MIT](LICENSE)
