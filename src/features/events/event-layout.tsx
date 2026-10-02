import { ArrowLeft, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Outlet, useParams } from 'react-router-dom'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { getEvent } from '@/db/repositories/events'
import { cn } from '@/lib/cn'
import { useAsync } from '@/lib/use-async'
import type { EventOutletContext } from './event-context'
import { StatusBadge } from './status-badge'

const TABS = [
  { to: '', end: true, key: 'overview' },
  { to: 'participants', end: false, key: 'participants' },
  { to: 'my-list', end: false, key: 'myList' },
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
          className="text-brand-700 inline-flex min-h-11 items-center gap-2 text-sm font-medium"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t('title')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{event.name}</h1>
          <StatusBadge status={event.status} />
        </div>
      </div>

      <nav
        aria-label={t('tabs.label')}
        className="-mx-4 overflow-x-auto border-b border-slate-200 px-4 md:mx-0 md:px-0"
      >
        <ul className="flex gap-1">
          {TABS.map((tab) => (
            <li key={tab.key}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex min-h-11 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap',
                    isActive
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-slate-700 hover:text-slate-900',
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
