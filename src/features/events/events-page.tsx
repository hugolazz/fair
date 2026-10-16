import { CalendarDays, MapPin, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { createEvent, listEvents } from '@/db/repositories/events'
import { useIsAdmin } from '@/features/auth-team/roles'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { EventFormDialog } from './event-form-dialog'
import { formatEventDates } from './event-format'
import { StatusBadge } from './status-badge'

export default function EventsPage() {
  const { t } = useTranslation('events')
  const { membership } = useReadySession()
  const { data: events, error, loading, reload } = useAsync(listEvents, [])
  const [creating, setCreating] = useState(false)

  const admin = useIsAdmin()
  // Créer un salon est réservé aux admins d'équipe : un commercial n'a pas ce bouton.
  const newButton = admin ? (
    <Button onClick={() => setCreating(true)}>
      <Plus aria-hidden className="size-5" />
      {t('new')}
    </Button>
  ) : undefined

  return (
    <>
      <PageHeader title={t('title')} actions={events?.length ? newButton : undefined} />

      {loading && !events ? <Loading /> : null}
      {error ? <ErrorState message={t('errors.load')} onRetry={reload} /> : null}
      {events && events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-10" />}
          title={t('empty.title')}
          body={admin ? t('empty.body') : t('empty.bodyMember')}
          action={newButton}
        />
      ) : null}

      {events && events.length > 0 ? (
        <ul className="grid gap-3 md:grid-cols-2">
          {events.map((e) => {
            const dates = formatEventDates(e.starts_on, e.ends_on)
            const place = [e.venue, e.city].filter(Boolean).join(', ')
            return (
              <li key={e.id}>
                <Link
                  to={`/events/${e.id}`}
                  className="hover:border-brand-600 flex min-h-11 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-semibold">{e.name}</h2>
                    <StatusBadge status={e.status} />
                  </div>
                  <p className="flex items-center gap-2 text-sm text-slate-700">
                    <CalendarDays aria-hidden className="size-4" />
                    {dates ?? t('datesUnknown')}
                  </p>
                  {place ? (
                    <p className="flex items-center gap-2 text-sm text-slate-700">
                      <MapPin aria-hidden className="size-4" />
                      {place}
                    </p>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}

      <EventFormDialog
        open={creating}
        onOpenChange={setCreating}
        title={t('form.createTitle')}
        onSubmit={async (values) => {
          await createEvent(membership.teamId, values)
          reload()
        }}
      />
    </>
  )
}
