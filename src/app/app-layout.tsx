import { Link, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wordmark } from '@/components/wordmark'
import { useReadySession } from '@/features/auth-team/session'
import { HeaderLogo } from '@/features/events/team-logo-banner'
import { SyncBanner } from '@/features/sync/sync-banner'
import { SyncProvider } from '@/features/sync/sync-provider'
import { initialsOf, initialsOfName } from '@/lib/person'

/** Cadre : en-tête (mot-symbole « fair », logo de l'équipe, pastille du profil = accès aux réglages) ; pas de barre de navigation. */
export function AppLayout() {
  const { t } = useTranslation()
  const { session, displayName } = useReadySession()

  return (
    <SyncProvider userId={session.user.id}>
      <div className="flex min-h-dvh flex-col">
        {/* Lien d'évitement : visible seulement au focus clavier, il saute la navigation. */}
        <a
          href="#contenu"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('contenu')?.focus()
          }}
          className="focus:bg-brand-600 focus:text-brand-on sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:px-5 focus:py-3 focus:text-sm focus:font-medium"
        >
          {t('a11y.skipToContent')}
        </a>

        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 md:px-10 md:py-[22px]">
          <Link
            to="/events"
            className="inline-flex min-h-11 items-center justify-self-start rounded-full"
          >
            <Wordmark />
          </Link>
          <HeaderLogo />
          <Link
            to="/settings"
            aria-label={t('nav.account')}
            className="bg-brand-50 text-brand-700 inline-flex size-11 items-center justify-center justify-self-end rounded-full text-[13px] font-semibold"
          >
            {displayName ? initialsOfName(displayName) : initialsOf(session.user.email)}
          </Link>
        </header>

        <SyncBanner />

        <main
          id="contenu"
          tabIndex={-1}
          className="animate-rise mx-auto w-full max-w-[1040px] flex-1 px-4 pt-4 pb-10 outline-none md:px-10 md:pt-6 md:pb-20"
        >
          <Outlet />
        </main>
      </div>
    </SyncProvider>
  )
}
