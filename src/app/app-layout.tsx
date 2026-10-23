import { CalendarDays, Settings, type LucideIcon } from 'lucide-react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wordmark } from '@/components/wordmark'
import { useReadySession } from '@/features/auth-team/session'
import { HeaderLogo } from '@/features/events/team-logo-banner'
import { SyncBanner } from '@/features/sync/sync-banner'
import { SyncProvider } from '@/features/sync/sync-provider'
import { cn } from '@/lib/cn'
import { initialsOf, initialsOfName } from '@/lib/person'

const NAV: { to: string; labelKey: string; icon: LucideIcon }[] = [
  { to: '/events', labelKey: 'nav.events', icon: CalendarDays },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
]

/** Cadre : en-tête (logo, navigation en pilule, avatar) sur desktop ; barre du bas sur mobile. */
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
          className="animate-rise mx-auto w-full max-w-[1040px] flex-1 px-4 pt-4 pb-28 outline-none md:px-10 md:pt-6 md:pb-20"
        >
          <Outlet />
        </main>

        {/* Barre du bas mobile */}
        <nav
          aria-label={t('nav.main')}
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 bg-slate-50/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_0_0_var(--color-slate-200)] backdrop-blur md:hidden"
        >
          {NAV.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  isActive ? 'text-brand-text' : 'text-slate-600',
                )
              }
            >
              <Icon aria-hidden className="size-6" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      </div>
    </SyncProvider>
  )
}
