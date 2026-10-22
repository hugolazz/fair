import { defineConfig, devices } from '@playwright/test'

// Tests de bout en bout : un build de production de l'appli (vite preview) face à un faux Supabase (PGlite + vraies
// migrations, voir tests/e2e/fake-supabase). Aucune dépendance à Docker ni à un projet Supabase réel.
const APP_PORT = 4173
const API_PORT = 54399
const API_URL = `http://127.0.0.1:${API_PORT}`

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    acceptDownloads: true,
    // Le service worker (ouverture sans réseau) n'est exercé que par offline-start.spec.ts ; ailleurs il fausserait les interceptions.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/mobile.spec.ts',
      // En local on utilise le Edge installé (aucun téléchargement) ; en CI, le Chromium de Playwright.
      use: { ...devices['Desktop Chrome'], channel: process.env['CI'] ? undefined : 'msedge' },
    },
    {
      name: 'mobile',
      testMatch: '**/mobile.spec.ts',
      use: { ...devices['Pixel 7'], channel: process.env['CI'] ? undefined : 'msedge' },
    },
  ],
  webServer: [
    {
      command: 'node tests/e2e/fake-supabase/server.ts',
      url: `${API_URL}/__e2e/users`,
      env: { PORT: String(API_PORT) },
      reuseExistingServer: !process.env['CI'],
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite build --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
      url: `http://127.0.0.1:${APP_PORT}/login`,
      env: {
        VITE_SUPABASE_URL: API_URL,
        VITE_SUPABASE_ANON_KEY: 'anon-key-e2e',
        VITE_OFFLINE_APP: '1',
        VITE_DEV_EMAIL: '',
        VITE_DEV_PASSWORD: '',
      },
      reuseExistingServer: !process.env['CI'],
      timeout: 300_000,
    },
  ],
})
