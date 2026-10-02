import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { AppRouter } from '@/app/router'
import { SessionProvider } from '@/features/auth-team/session'
import { i18n } from '@/lib/i18n'
import { isSupabaseConfigured } from '@/lib/supabase'
import './index.css'

// L'appli ne fonctionne plus hors-ligne : on retire le service worker et les caches d'une ancienne version.
void navigator.serviceWorker
  ?.getRegistrations()
  .then((rs) => rs.forEach((r) => void r.unregister()))
void globalThis.caches?.keys().then((ks) => ks.forEach((k) => void caches.delete(k)))

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
