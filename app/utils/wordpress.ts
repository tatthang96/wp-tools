// Helpers for talking to a WordPress site's REST API with an application password.
// https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/

export interface WpRestRoot {
  /** Site URL without trailing slash, e.g. https://example.com or https://example.com/blog */
  siteUrl: string
  /** true → /wp-json/... ; false → /?rest_route=... (sites without pretty permalinks) */
  pretty: boolean
}

export interface WpUser {
  id: number
  name: string
  username: string
  email: string
  avatar?: string
  roles: string[]
}

export interface WpSession {
  root: WpRestRoot
  siteName: string
  username: string
  appPassword: string
  user: WpUser
}

export interface WpCredentials {
  siteUrl: string
  username: string
  appPassword: string
}

export class WpError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message)
    this.name = 'WpError'
  }
}

interface WpIndex {
  name?: string
  namespaces?: string[]
  // PHP serializes an empty array as [], so this can be an array when no methods exist.
  authentication?: Record<string, unknown> | unknown[]
}

interface WpUserResponse {
  id: number
  name: string
  username?: string
  slug: string
  email?: string
  roles?: string[]
  avatar_urls?: Record<string, string>
}

interface WpErrorResponse {
  code?: string
  message?: string
}

const UNREACHABLE_MESSAGE = 'Couldn\'t reach this site. Check the URL and that the site is online. The site must also allow REST API requests from this app (CORS).'

/** Accepts "example.com", "https://example.com/wp-admin/", etc. and returns "https://example.com". */
export function normalizeSiteUrl(input: string): string {
  let value = input.trim()
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`
  const url = new URL(value)
  const path = url.pathname
    .replace(/\/(?:wp-admin|wp-login\.php|wp-json)(?:\/.*)?$/i, '')
    .replace(/\/+$/, '')
  return `${url.origin}${path}`
}

export function isValidSiteUrl(input: string): boolean {
  try {
    const { hostname } = new URL(normalizeSiteUrl(input))
    return hostname.includes('.') || hostname === 'localhost'
  } catch {
    return false
  }
}

export function wpRestUrl(root: WpRestRoot, path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const url = root.pretty ? new URL(`${root.siteUrl}/wp-json${path}`) : new URL(`${root.siteUrl}/`)
  if (!root.pretty) url.searchParams.set('rest_route', path)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export function wpAdminUrl(siteUrl: string, path = ''): string {
  return `${siteUrl}/wp-admin/${path}`
}

function basicAuthHeader(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `Basic ${btoa(binary)}`
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return await res.json() as T
  } catch {
    return null
  }
}

/** WordPress returns some strings with HTML tags and entities (e.g. "&amp;"); convert to plain text. */
export function stripTags(value: string): string {
  return (new DOMParser().parseFromString(value, 'text/html').body.textContent ?? '').trim()
}

function errorFromResponse(status: number, data: WpErrorResponse | null): WpError {
  const code = data?.code ?? 'http_error'

  switch (code) {
    case 'incorrect_password':
    case 'invalid_username':
    case 'invalid_email':
      return new WpError(code, 'Incorrect username or application password.', status)
    case 'application_passwords_disabled':
      return new WpError(code, 'Application passwords are disabled on this site.', status)
    case 'application_passwords_disabled_for_user':
      return new WpError(code, 'Application passwords are disabled for this user.', status)
    case 'rest_not_logged_in':
      return new WpError(code, 'The site didn\'t receive your credentials. Your web server may be stripping the Authorization header; check your host\'s documentation for passing it through to PHP.', status)
  }

  const message = data?.message ? stripTags(data.message) : ''
  return new WpError(code, message || `The site responded with an error (HTTP ${status}).`, status)
}

/** Finds the REST API root, trying /wp-json/ first, then ?rest_route=/ for sites without pretty permalinks. */
async function discoverRestRoot(siteUrl: string): Promise<{ root: WpRestRoot, index: WpIndex }> {
  let reached = false

  for (const pretty of [true, false]) {
    const root: WpRestRoot = { siteUrl, pretty }
    let res: Response
    try {
      res = await fetch(wpRestUrl(root, '/'), { headers: { Accept: 'application/json' } })
    } catch {
      continue
    }
    reached = true
    const index = await readJson<WpIndex>(res)
    if (res.ok && Array.isArray(index?.namespaces)) return { root, index }
  }

  throw reached
    ? new WpError('not_wordpress', 'No WordPress REST API was found at this URL.')
    : new WpError('unreachable', UNREACHABLE_MESSAGE)
}

function toWpUser(data: WpUserResponse): WpUser {
  return {
    id: data.id,
    name: data.name,
    username: data.username ?? data.slug,
    email: data.email ?? '',
    avatar: data.avatar_urls?.['96'] ?? data.avatar_urls?.['48'],
    roles: data.roles ?? []
  }
}

/** Verifies the credentials against the site and returns a session on success. */
export async function connectWordPress(credentials: WpCredentials): Promise<WpSession> {
  const { root, index } = await discoverRestRoot(normalizeSiteUrl(credentials.siteUrl))

  const auth = index.authentication
  if (!auth || Array.isArray(auth) || !('application-passwords' in auth)) {
    throw new WpError('unavailable', 'Application passwords aren\'t available on this site. They require WordPress 5.6 or later and HTTPS, and a security plugin may have disabled them.')
  }

  const username = credentials.username.trim()
  const appPassword = credentials.appPassword.replace(/\s+/g, '')

  let res: Response
  try {
    res = await fetch(wpRestUrl(root, '/wp/v2/users/me', { context: 'edit' }), {
      headers: {
        Accept: 'application/json',
        Authorization: basicAuthHeader(username, appPassword)
      }
    })
  } catch {
    throw new WpError('unreachable', UNREACHABLE_MESSAGE)
  }

  if (!res.ok) throw errorFromResponse(res.status, await readJson<WpErrorResponse>(res))

  const data = await readJson<WpUserResponse>(res)
  if (!data?.id) throw new WpError('invalid_response', 'The site returned an unexpected response.')

  return {
    root,
    siteName: index.name ? stripTags(index.name) : new URL(root.siteUrl).hostname,
    username,
    appPassword,
    user: toWpUser(data)
  }
}

export interface WpRequestOptions {
  /** OPTIONS returns the endpoint's schema (e.g. which meta keys a post type exposes). */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS'
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  /** Cancels the request, e.g. the signal Pinia Colada passes to query functions. */
  signal?: AbortSignal
}

async function wpSend(session: WpSession, path: string, options: WpRequestOptions): Promise<Response> {
  let res: Response
  try {
    res = await fetch(wpRestUrl(session.root, path, options.query), {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: basicAuthHeader(session.username, session.appPassword),
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal
    })
  } catch (error) {
    // Let cancellations propagate as-is so callers (and Pinia Colada) can ignore them.
    if (options.signal?.aborted) throw error
    throw new WpError('unreachable', UNREACHABLE_MESSAGE)
  }

  if (!res.ok) throw errorFromResponse(res.status, await readJson<WpErrorResponse>(res))
  return res
}

/** Authenticated REST API request, e.g. wpRequest(session, '/wp/v2/plugins'). */
export async function wpRequest<T>(session: WpSession, path: string, options: WpRequestOptions = {}): Promise<T> {
  const res = await wpSend(session, path, options)
  return await readJson<T>(res) as T
}

export interface WpPage<T> {
  data: T[]
  /** Total items across all pages, from the X-WP-Total header. */
  total: number
}

/** Like wpRequest, for collection endpoints: also returns the total count. */
export async function wpRequestPage<T>(session: WpSession, path: string, options: WpRequestOptions = {}): Promise<WpPage<T>> {
  const res = await wpSend(session, path, options)
  const data = await readJson<T[]>(res) ?? []
  const total = Number(res.headers.get('X-WP-Total') ?? data.length)
  return { data, total: Number.isFinite(total) ? total : data.length }
}
