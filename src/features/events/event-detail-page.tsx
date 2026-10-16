import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { deleteEvent, updateEvent } from '@/db/repositories/events'
import { eventToForm } from '@/db/schemas/event'
import { useIsAdmin } from '@/features/auth-team/roles'
import { DuplicateEventDialog } from './duplicate-event-dialog'
import { useEvent } from './event-context'
import { EventFormDialog } from './event-form-dialog'
import { formatEventDates } from './event-format'

/** Aperçu du salon : dates, lieu, objectifs, raccourcis vers l'import et la préparation. */
export default function EventDetailPage() {
  const { t } = useTranslation('events')
  const { t: tc } = useTranslation()
  const { event, reload } = useEvent()
  const navigate = useNavigate()
  const admin = useIsAdmin()
  const [editing, setEditing] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState(false)
  const initialValues = useMemo(() => eventToForm(event), [event])

  const dates = formatEventDates(event.starts_on, event.ends_on)
  const place = [event.venue, event.city].filter(Boolean).join(', ')

  return (
    <article className="flex flex-col gap-5">
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-5">
        <div className="rounded-3xl bg-white p-7 shadow-[0_0_0_1px_var(--color-slate-200)]">
          <dt className="mb-2.5 text-[13px] text-slate-600">{t('detail.dates')}</dt>
          <dd className="text-2xl leading-tight font-medium tracking-[-0.02em]">
            {dates ?? t('datesUnknown')}
          </dd>
        </div>
        <div className="rounded-3xl bg-white p-7 shadow-[0_0_0_1px_var(--color-slate-200)]">
          <dt className="mb-2.5 text-[13px] text-slate-600">{t('detail.location')}</dt>
          <dd className="text-2xl leading-tight font-medium tracking-[-0.02em]">{place || '—'}</dd>
        </div>
      </dl>
      <div className="rounded-3xl bg-white p-7 shadow-[0_0_0_1px_var(--color-slate-200)]">
        <h2 className="mb-2.5 text-[13px] font-normal text-slate-600">{t('detail.goals')}</h2>
        <p className="max-w-[640px] text-base leading-[1.65] text-pretty whitespace-pre-wrap">
          {event.goals?.text || t('detail.noGoals')}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button asChild>
          <Link to="participants">{t('detail.prepare')}</Link>
        </Button>
        {admin ? (
          <>
            <Button asChild variant="secondary">
              <Link to="import">{t('detail.import')}</Link>
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              {tc('actions.edit')}
            </Button>
            <Button variant="secondary" onClick={() => setDuplicating(true)}>
              {t('detail.duplicate')}
            </Button>
            <Button variant="quiet" onClick={() => setConfirming(true)}>
              {tc('actions.delete')}
            </Button>
          </>
        ) : null}
      </div>

      <DuplicateEventDialog event={event} open={duplicating} onOpenChange={setDuplicating} />

      <EventFormDialog
        open={editing}
        onOpenChange={setEditing}
        title={t('form.editTitle')}
        initialValues={initialValues}
        onSubmit={async (values) => {
          await updateEvent(event.id, values)
          reload()
        }}
      />

      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('detail.confirmDelete')}
        description={t('detail.confirmDeleteBody', { name: event.name })}
      >
        {deleteError ? (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {tc('states.error')}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              try {
                setDeleteError(false)
                await deleteEvent(event.id)
                navigate('/events', { replace: true })
              } catch {
                setDeleteError(true)
              }
            }}
          >
            {tc('actions.delete')}
          </Button>
        </div>
      </Dialog>
    </article>
  )
}
