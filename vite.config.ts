import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import { offlineShellPlugin } from './scripts/offline-shell-plugin.ts'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Ouverture sans réseau : activée par VITE_OFFLINE_APP=1 au build (sans elle, le service worker se désinscrit).
    offlineShellPlugin({
      enabled: loadEnv(mode, process.cwd(), 'VITE_')['VITE_OFFLINE_APP'] === '1',
      root: process.cwd(),
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
}))
