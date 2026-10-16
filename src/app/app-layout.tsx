import { Building2, CalendarDays, Settings, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Wordmark } from '@/components/wordmark'
import { cn } from '@/lib/cn'

const NAV: { to: string; labelKey: string; icon: LucideIcon }[] = [
  { to: '/events', labelKey: 'nav.events', icon: CalendarDays },
  { to: '/companies', labelKey: 'nav.companies', icon: Building2 },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
]

export function AppLayout() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Lien d'évitement : visible seulement au focus clavier, il saute la navigation. */}
      <a
        href="#contenu"
        onClick={(e) => {
          e.preventDefault()
          document.getElementById('contenu')?.focus()
        }}
        className="focus:bg-brand-700 sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-4 focus:py-3 focus:text-sm focus:font-medium focus:text-white"
      >
        {t('a11y.skipToContent')}
      </a>
      {/* Sidebar desktop */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="px-6 py-5">
          <Wordmark />
        </div>
        <nav aria-label={t('nav.main')} className="flex flex-col gap-1 px-3">
          {NAV.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium',
                  isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100',
                )
              }
            >
              <Icon aria-hidden className="size-5" />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En-tête mobile */}
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-4 pt-[env(safe-area-inset-top)] md:hidden">
          <div className="flex h-14 items-center justify-between">
            <Wordmark />
          </div>
        </header>

        <main
          id="contenu"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 outline-none md:px-8 md:py-8 md:pb-8"
        >
          <Outlet />
        </main>
      </div>

      {/* Barre du bas mobile */}
      <nav
        aria-label={t('nav.main')}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {NAV.map(({ to, labelKey, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                isActive ? 'text-brand-700' : 'text-slate-600',
              )
            }
          >
            <Icon aria-hidden className="size-6" />
            {t(labelKey)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
