<script setup lang="ts">
import * as z from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'
import { useMutation } from '@pinia/colada'

useHead({ title: 'Sign in' })

const route = useRoute()
const auth = useAuthStore()

const { mutateAsync: login, isLoading: loading, error: loginError } = useMutation({
  mutation: (credentials: WpCredentials & { remember?: boolean }) => auth.login(credentials)
})

const error = computed(() => {
  if (!loginError.value) return null
  return loginError.value instanceof WpError
    ? loginError.value.message
    : 'Something went wrong while signing in. Please try again.'
})

const fields: AuthFormField[] = [{
  name: 'siteUrl',
  type: 'text',
  label: 'WordPress site URL',
  placeholder: 'https://example.com',
  required: true
}, {
  name: 'username',
  type: 'text',
  label: 'Username or email',
  placeholder: 'admin',
  required: true
}, {
  name: 'password',
  type: 'password',
  label: 'Application password',
  placeholder: 'xxxx xxxx xxxx xxxx xxxx xxxx',
  description: 'Create one in WP Admin → Users → Profile → Application Passwords. This is not your normal login password.',
  required: true
}, {
  name: 'remember',
  type: 'checkbox',
  label: 'Remember me on this device'
}]

const schema = z.object({
  siteUrl: z.string('Site URL is required')
    .trim()
    .min(1, 'Site URL is required')
    .refine(isValidSiteUrl, 'Enter a valid URL, e.g. https://example.com'),
  username: z.string('Username is required').trim().min(1, 'Username is required'),
  password: z.string('Application password is required')
    .transform(value => value.replace(/\s+/g, ''))
    .pipe(z.string().regex(/^[A-Za-z0-9]{24}$/, 'An application password has 24 letters and numbers, shown in groups of four. Your normal password won\'t work here.')),
  remember: z.boolean().optional()
})

type Schema = z.output<typeof schema>

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    await login({
      siteUrl: event.data.siteUrl,
      username: event.data.username,
      appPassword: event.data.password,
      remember: event.data.remember
    })
  } catch {
    return // shown via `error`
  }
  const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin')
    ? route.query.redirect
    : '/admin'
  await navigateTo(redirect)
}
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center p-4">
    <UPageCard class="w-full max-w-md">
      <UAuthForm
        :schema="schema"
        :fields="fields"
        :loading="loading"
        :submit="{ label: 'Connect', block: true }"
        title="Sign in with WordPress"
        description="Connect to your site using an application password."
        icon="i-simple-icons-wordpress"
        @submit="onSubmit"
      >
        <template #validation>
          <UAlert
            v-if="error"
            :description="error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
          />
        </template>

        <template #footer>
          <p class="text-center text-xs text-muted">
            Your credentials are stored only in this browser and are sent only to your WordPress site.
          </p>
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
