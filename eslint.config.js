import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-e2e',
      'dev-dist',
      'playwright-report',
      'test-results',
      'lighthouse-report',
      'node_modules',
      'supabase/functions/invite-member',
      'public',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['sw/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    // Les features n'accèdent jamais directement à Supabase : tout passe par src/db/repositories.
    files: ['src/features/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@supabase/*', '@/lib/supabase'],
              message:
                'Les features passent par src/db/repositories, jamais par Supabase directement.',
            },
          ],
        },
      ],
    },
  },
  {
    // Providers/contexte : exportent un provider et son hook ensemble, c'est voulu.
    files: ['src/main.tsx', 'src/features/auth-team/session.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  { files: ['scripts/**/*.mjs', '*.config.js'], languageOptions: { globals: globals.node } },
)
