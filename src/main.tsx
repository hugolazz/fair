import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { AppRouter } from '@/app/router'
import { SessionProvider } from '@/features/auth-team/session'
import { i18n } from '@/lib/i18n'
import { isSupabaseConfigured } from '@/lib/supabase'
import { initTheme } from '@/lib/theme'
import './index.css'

initTheme()
registerSW({ immediate: true })

function Root() {
  const { t } = useTranslation()
  if (!isSupabaseConfigured) {
    return (
      <div role="alert" className="mx-auto max-w-md p-6">
        <h1 className="mb-2 text-xl font-semibold">{t('config.missingTitle')}</h1>
        <p className="text-slate-700">{t('config.missingBody')}</p>
      </div>
    )
  }
  return (
    <SessionProvider>
      <AppRouter />
    </SessionProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <Root />
    </I18nextProvider>
  </StrictMode>,
)
