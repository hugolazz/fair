import { ArrowUpRight, CalendarDays, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loading, PageHeader } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { createEvent, listEvents } from '@/db/repositories/events'
import { useIsAdmin } from '@/features/auth-team/roles'
import { useReadySession } from '@/features/auth-team/session'
import { firstNameOf } from '@/lib/person'
import { useAsync } from '@/lib/use-async'
import { EventFormDialog } from './event-form-dialog'
import { formatEventDates } from './event-format'
import { eventStatus } from './lib/status'
import { StatusBadge } from './status-badge'
import { TeamLogoBanner } from './team-logo-banner'

export default function EventsPage() {
  const { t } = useTranslation('events')
  const { membership, session, displayName } = useReadySession()
  const { data: events, error, loading, reload } = useAsync(listEvents, [])
  const [creating, setCreating] = useState(false)

  const admin = useIsAdmin()
  // Créer un salon est réservé aux admins d'équipe : un commercial n'a pas ce bouton.
  const newButton = admin ? (
    <Button variant="ink" onClick={() => setCreating(true)}>
      <Plus aria-hidden className="size-5" />
      {t('new')}
    </Button>
  ) : undefined
  const firstName = displayName.split(/\s+/)[0] || firstNameOf(session.user.email)

  return (
    <>
      <TeamLogoBanner />
      <PageHeader
        title={t('title')}
        eyebrow={firstName ? t('greeting', { name: firstName }) : undefined}
        actions={events?.length ? newButton : undefined}
      />

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
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,440px),1fr))] gap-5">
          {events.map((e) => {
            const dates = formatEventDates(e.starts_on, e.ends_on)
            const place = [e.venue, e.city].filter(Boolean).join(', ')
            return (
              <li key={e.id}>
                <Link
                  to={`/events/${e.id}`}
                  className="flex h-full flex-col gap-7 rounded-3xl bg-white p-7 shadow-[0_0_0_1px_var(--color-slate-200)] transition-[transform,box-shadow] duration-[250ms] ease-out hover:-translate-y-[3px] hover:shadow-[0_0_0_1px_var(--color-brand-100),0_16px_32px_-20px_color-mix(in_srgb,var(--color-brand-600)_35%,transparent)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status={eventStatus(e)} />
                    <ArrowUpRight aria-hidden className="size-5 text-[#bdb9ad]" />
                  </div>
                  <div>
                    <h2 className="mb-1.5 text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
                      {e.name}
                    </h2>
                    <p className="text-sm text-slate-600">
                      {[dates ?? t('datesUnknown'), place].filter(Boolean).join(' · ')}
                    </p>
                  </div>
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
