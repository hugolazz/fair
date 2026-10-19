import { ArrowLeft, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { getEvent } from '@/db/repositories/events'
import { cn } from '@/lib/cn'
import { useAsync } from '@/lib/use-async'
import type { EventOutletContext } from './event-context'
import { eventStatus } from './lib/status'
import { StatusBadge } from './status-badge'

const TABS = [
  { to: '', end: true, key: 'overview' },
  { to: 'participants', end: false, key: 'participants' },
  { to: 'my-list', end: false, key: 'myList' },
  { to: 'team', end: false, key: 'team' },
  { to: 'plan', end: false, key: 'plan' },
  { to: 'bilan', end: false, key: 'bilan' },
  { to: 'exports', end: false, key: 'exports' },
] as const

/** Cadre commun d'un salon : titre, statut et onglets Aperçu / Participants / Ma liste. */
export default function EventLayout() {
  const { t } = useTranslation('events')
  const { t: tc } = useTranslation()
  const { eventId = '' } = useParams()
  const { data: event, error, loading, reload } = useAsync(() => getEvent(eventId), [eventId])

  if (loading && !event) return <Loading />
  if (error) return <ErrorState message={t('errors.load')} onRetry={reload} />
  if (!event) {
    return (
      <EmptyState
        icon={<Trash2 className="size-10" />}
        title={t('detail.notFound')}
        body=""
        action={
          <Button asChild variant="secondary">
            <Link to="/events">{tc('actions.back')}</Link>
          </Button>
        }
      />
    )
  }

  const context: EventOutletContext = { event, reload }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link
          to="/events"
          className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-slate-600 transition-colors duration-200 hover:text-slate-900"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('back')}
        </Link>
        <StatusBadge status={eventStatus(event)} className="mb-3 flex" />
        <h1 className="text-4xl leading-[1.05] font-medium tracking-[-0.03em] break-words md:text-5xl">
          {event.name}
        </h1>
      </div>

      <nav
        aria-label={t('tabs.label')}
        className="-mx-4 mt-4 mb-6 overflow-x-auto px-4 shadow-[inset_0_-1px_0_0_var(--color-slate-200)] md:mx-0 md:mt-6 md:px-0"
      >
        <ul className="flex gap-7">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex min-h-11 min-w-11 items-center justify-center border-b-2 pb-0.5 text-sm font-medium whitespace-nowrap transition-colors duration-200',
                    isActive
                      ? 'border-brand-600 text-brand-600'
                      : 'border-transparent text-slate-600 hover:text-slate-900',
                  )
                }
              >
                {t(`tabs.${tab.key}`)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet context={context} />
    </div>
  )
}
