import { ClipboardList, Copy, Pencil, Trash2, Upload } from 'lucide-react'
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
    <article className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link to="participants">
            <ClipboardList aria-hidden className="size-4" />
            {t('detail.prepare')}
          </Link>
        </Button>
        {admin ? (
          <>
            <Button asChild variant="secondary">
              <Link to="import">
                <Upload aria-hidden className="size-4" />
                {t('detail.import')}
              </Link>
            </Button>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil aria-hidden className="size-4" />
              {tc('actions.edit')}
            </Button>
            <Button variant="secondary" onClick={() => setDuplicating(true)}>
              <Copy aria-hidden className="size-4" />
              {t('detail.duplicate')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              <Trash2 aria-hidden className="size-4" />
              {tc('actions.delete')}
            </Button>
          </>
        ) : null}
      </div>

      <dl className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-2">
        <div>
          <dt className="text-sm text-slate-600">{t('detail.dates')}</dt>
          <dd className="font-medium">{dates ?? t('datesUnknown')}</dd>
        </div>
        <div>
          <dt className="text-sm text-slate-600">{t('detail.location')}</dt>
          <dd className="font-medium">{place || '—'}</dd>
        </div>
        <div className="md:col-span-2">
          <dt className="text-sm text-slate-600">{t('detail.goals')}</dt>
          <dd className="whitespace-pre-wrap">{event.goals?.text || t('detail.noGoals')}</dd>
        </div>
      </dl>

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
