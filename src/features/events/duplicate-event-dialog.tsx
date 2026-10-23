import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InputField } from '@/components/ui/field'
import { duplicateEvent } from '@/db/repositories/events'
import type { EventRow } from '@/db/schemas/event'

type Props = { event: EventRow; open: boolean; onOpenChange: (open: boolean) => void }

/** Duplique un salon comme modèle : configuration, mapping d'import et, au choix, la liste des participants. */
export function DuplicateEventDialog({ event, open, onOpenChange }: Props) {
  const { t } = useTranslation('events')
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('duplicate.title')}
      description={t('duplicate.body', { name: event.name })}
    >
      {/* Démonté à la fermeture : le formulaire repart de zéro à chaque ouverture. */}
      <DuplicateForm event={event} onClose={() => onOpenChange(false)} />
    </Dialog>
  )
}

function DuplicateForm({ event, onClose }: { event: EventRow; onClose: () => void }) {
  const { t } = useTranslation('events')
  const { t: tc } = useTranslation()
  const navigate = useNavigate()
  const [name, setName] = useState(t('duplicate.defaultName', { name: event.name }))
  const [startsOn, setStartsOn] = useState('')
  const [endsOn, setEndsOn] = useState('')
  const [copyParticipants, setCopyParticipants] = useState(false)
  const [copyMapping, setCopyMapping] = useState(true)
  const [errors, setErrors] = useState<{ name?: string; endsOn?: string }>({})
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const next = {
      ...(name.trim() ? {} : { name: t('errors.nameRequired') }),
      ...(startsOn && endsOn && endsOn < startsOn ? { endsOn: t('errors.datesOrder') } : {}),
    }
    setErrors(next)
    setFailed(false)
    if (Object.keys(next).length > 0) return
    setBusy(true)
    try {
      const id = await duplicateEvent(event.id, {
        name,
        startsOn,
        endsOn,
        copyParticipants,
        copyMapping,
      })
      onClose()
      navigate(`/events/${id}`)
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  const check = (label: string, hint: string, value: boolean, set: (v: boolean) => void) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => set(e.target.checked)}
        className="accent-brand-600 mt-1 size-4"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-slate-700">{hint}</span>
      </span>
    </label>
  )

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <InputField
        label={t('duplicate.name')}
        value={name}
        error={errors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-3">
        <InputField
          label={t('fields.startsOn')}
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
        />
        <InputField
          label={t('fields.endsOn')}
          type="date"
          value={endsOn}
          error={errors.endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
        />
      </div>
      <p className="text-sm text-slate-700">{t('duplicate.always')}</p>
      {check(
        t('duplicate.copyMapping'),
        t('duplicate.copyMappingHint'),
        copyMapping,
        setCopyMapping,
      )}
      {check(
        t('duplicate.copyParticipants'),
        t('duplicate.copyParticipantsHint'),
        copyParticipants,
        setCopyParticipants,
      )}
      {failed ? (
        <p role="alert" className="text-sm text-red-700">
          {t('duplicate.error')}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {tc('actions.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {t('duplicate.submit')}
        </Button>
      </div>
    </form>
  )
}
