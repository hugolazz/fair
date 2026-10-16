import { CheckCircle2, NotebookPen, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { addMeetingNote, fetchMeetingNotes, updateMeetingReport } from '@/db/repositories/targets'
import type { Target, TargetContact } from '@/db/schemas/prepare'
import { useReadySession } from '@/features/auth-team/session'
import { AddContactForm } from '@/features/manual-entry/add-contact-form'
import { newId } from '@/lib/ids'
import { useAsync } from '@/lib/use-async'
import { formatTime } from './lib/format'
import { currentMeeting } from './lib/notepad'
import type { TargetsApi } from './use-targets'

type Props = {
  target: Target
  api: TargetsApi
  nameOf: (userId: string) => string
  /** Contacts déjà connus de l'entreprise (pour ne pas ajouter deux fois la même personne). */
  contacts: readonly TargetContact[]
  /** Appelé quand un contact vient d'être ajouté : la fiche recharge sa liste de contacts. */
  onContactAdded: (contact: TargetContact) => void
}

/**
 * Prise de notes pendant la rencontre : un grand champ, un bouton. La rencontre est créée toute seule à la première
 * note (sans planification) ; le détail du compte-rendu (intérêt, prochaine étape…) reste dans « Plus de détails ».
 * On peut aussi y noter avec qui on a parlé (contact en cases séparées) et si la personne est à recontacter.
 */
export function MeetingNotepad({ target, api, nameOf, contacts, onContactAdded }: Props) {
  const { t } = useTranslation('prepare')
  const { t: tm } = useTranslation('manual')
  const { session, membership } = useReadySession()
  const meId = session.user.id
  const meeting = currentMeeting(target.meetings, meId)
  const notes = useAsync(
    () => (meeting ? fetchMeetingNotes(meeting.id) : Promise.resolve([])),
    [meeting?.id],
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [metWith, setMetWith] = useState<string>()

  /** La rencontre en cours, créée à la volée (sans planification) si elle n'existe pas encore. */
  async function ensureMeeting(): Promise<string> {
    if (meeting) return meeting.id
    const id = newId()
    const ok = await api.actions.saveMeeting({
      id,
      targetId: target.id,
      ownerId: meId,
      plannedAt: new Date().toISOString(),
      durationMin: 15,
      reminderMin: null,
    })
    if (!ok) throw new Error('meeting')
    return id
  }

  async function setRecontact(on: boolean) {
    setError(false)
    try {
      const id = await ensureMeeting()
      await api.actions.updateMeetingReport(target.id, id, { recontact: on })
    } catch {
      setError(true)
    }
  }

  async function onSavedContact(c: TargetContact) {
    setAddingContact(false)
    setMetWith(c.name || c.email)
    onContactAdded(c)
    try {
      // Le contact rencontré est rattaché à la rencontre : il apparaît dans la colonne « Contact » des exports.
      await updateMeetingReport(await ensureMeeting(), { contactId: c.id })
    } catch {
      setError(true)
    }
  }

  async function save() {
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    setError(false)
    try {
      const meetingId = await ensureMeeting()
      if (!meeting || meeting.status === 'to_see') {
        await api.actions.updateMeetingReport(target.id, meetingId, { status: 'in_progress' })
      }
      await addMeetingNote(membership.teamId, meetingId, meId, body)
      setDraft('')
      notes.reload()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  const done = meeting?.status === 'done'
  const list = [...(notes.data ?? [])].reverse()

  return (
    <section aria-labelledby="notepad-title" className="flex flex-col gap-3">
      <h3 id="notepad-title" className="flex items-center gap-2 text-base font-semibold">
        <NotebookPen aria-hidden className="size-4" />
        {t('notepad.title')}
      </h3>
      <label className="flex flex-col gap-1">
        <span className="sr-only">{t('notepad.label')}</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('notepad.placeholder')}
          rows={4}
          className="focus-visible:outline-brand-600 min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {t('notepad.error')}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          className="min-h-12 flex-1"
          disabled={busy || !draft.trim()}
          onClick={() => void save()}
        >
          {t('notepad.save')}
        </Button>
        {meeting && !done ? (
          <Button
            variant="secondary"
            className="min-h-12"
            onClick={() =>
              void api.actions.updateMeetingReport(target.id, meeting.id, { status: 'done' })
            }
          >
            <CheckCircle2 aria-hidden className="size-4" />
            {t('notepad.finish')}
          </Button>
        ) : null}
      </div>
      {done ? (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-emerald-800">
          <CheckCircle2 aria-hidden className="size-4" />
          {t('notepad.finished')}
        </p>
      ) : null}

      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3">
        <input
          type="checkbox"
          className="size-6"
          checked={meeting?.recontact ?? false}
          onChange={(e) => void setRecontact(e.target.checked)}
        />
        <span className="flex-1 text-base font-medium">{t('notepad.recontact')}</span>
        <span className="text-sm font-semibold" aria-hidden>
          {meeting?.recontact ? t('notepad.yes') : t('notepad.no')}
        </span>
      </label>

      {addingContact ? (
        <AddContactForm
          teamId={membership.teamId}
          companyId={target.companyId}
          existing={contacts}
          onSaved={(c) => void onSavedContact(c)}
          onCancel={() => setAddingContact(false)}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Button variant="secondary" className="min-h-12" onClick={() => setAddingContact(true)}>
            <UserPlus aria-hidden className="size-4" />
            {tm('addContact.button')}
          </Button>
          {metWith ? (
            <p role="status" className="text-sm font-medium text-emerald-800">
              {tm('addContact.saved', { name: metWith })}
            </p>
          ) : null}
        </div>
      )}

      {list.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {list.map((n) => (
            <li key={n.id} className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="text-xs text-slate-600">
                {formatTime(n.capturedAt)} · {nameOf(n.authorId)}
              </p>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
