import { CheckCircle2, NotebookPen, UserPlus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  addMeetingNote,
  fetchMeetingNotes,
  updateMeetingNote,
  updateMeetingReport,
} from '@/db/repositories/targets'
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
 * note (sans planification). On y donne aussi l'intérêt (1 à 5, un appui), avec qui on a parlé (contact en cases
 * séparées) et si la personne est à recontacter ; la prochaine étape reste dans « Modifier la fiche ».
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
  // Mon texte : une seule note par rencontre, qui reste affichée (et modifiable) après l'enregistrement.
  const mine = [...(notes.data ?? [])].reverse().find((n) => n.authorId === meId)
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [addingContact, setAddingContact] = useState(false)
  const [metWith, setMetWith] = useState<string>()
  // Case « à recontacter » : l'état local répond tout de suite, sans attendre la création de la rencontre.
  const [recontactLocal, setRecontactLocal] = useState<boolean>()
  const [interestLocal, setInterestLocal] = useState<number | null>()
  const [newsLocal, setNewsLocal] = useState<boolean>()
  const creating = useRef<Promise<string>>(undefined)
  const seededFor = useRef<string>(undefined)
  const typed = useRef(false) // le chargement des notes n'écrase jamais un texte déjà tapé

  // Le champ est rempli une fois avec ma note existante ; la rencontre créée par nos soins ne l'efface pas.
  useEffect(() => {
    if (!notes.data) return
    const key = meeting?.id ?? 'none'
    if (seededFor.current === key) return
    seededFor.current = key
    if (!typed.current) setDraft(mine?.body ?? '')
  }, [notes.data, meeting?.id, mine?.body])

  /** La rencontre en cours, créée à la volée (sans planification) si elle n'existe pas encore. */
  function ensureMeeting(): Promise<string> {
    if (meeting) return Promise.resolve(meeting.id)
    // Deux actions rapprochées ne doivent créer qu'une seule rencontre.
    creating.current ??= (async () => {
      const id = newId()
      seededFor.current = id
      const ok = await api.actions.saveMeeting({
        id,
        targetId: target.id,
        ownerId: meId,
        plannedAt: new Date().toISOString(),
        durationMin: 15,
        reminderMin: null,
      })
      if (!ok) {
        creating.current = undefined
        throw new Error('meeting')
      }
      return id
    })()
    return creating.current
  }

  async function setRecontact(on: boolean) {
    setError(false)
    setRecontactLocal(on)
    try {
      const id = await ensureMeeting()
      // À recontacter = on a vu la personne : la rencontre est aussi marquée comme terminée.
      const patch =
        on && meeting?.status !== 'done'
          ? { recontact: on, status: 'done' as const }
          : { recontact: on }
      await api.actions.updateMeetingReport(target.id, id, patch)
    } catch {
      setRecontactLocal(undefined)
      setError(true)
    }
  }

  /** « Actualité ? » (réglage d'équipe) : cocher = on a vu la personne, la rencontre est aussi marquée terminée. */
  async function setNews(on: boolean) {
    setError(false)
    setNewsLocal(on)
    try {
      const id = await ensureMeeting()
      const patch =
        on && meeting?.status !== 'done' ? { news: on, status: 'done' as const } : { news: on }
      await api.actions.updateMeetingReport(target.id, id, patch)
    } catch {
      setNewsLocal(undefined)
      setError(true)
    }
  }

  /** Intérêt 1 à 5 ; retoucher la note choisie l'efface. Noter = avoir vu la personne, comme « à recontacter ». */
  async function setInterest(n: number) {
    setError(false)
    const next = n === interest ? null : n
    setInterestLocal(next)
    try {
      const id = await ensureMeeting()
      const patch =
        next !== null && meeting?.status !== 'done'
          ? { interest: next, status: 'done' as const }
          : { interest: next }
      await api.actions.updateMeetingReport(target.id, id, patch)
    } catch {
      setInterestLocal(undefined)
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
    setSaved(false)
    try {
      const meetingId = await ensureMeeting()
      // Écrire une note = avoir rencontré l'entreprise.
      if (!meeting || meeting.status !== 'done') {
        await api.actions.updateMeetingReport(target.id, meetingId, { status: 'done' })
      }
      if (mine) await updateMeetingNote(mine.id, body)
      else await addMeetingNote(membership.teamId, meetingId, meId, body)
      setSaved(true)
      notes.reload()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  /** Le bouton « Rencontre terminée » : crée la rencontre au besoin, puis la marque terminée (ou la rouvre). */
  async function toggleDone() {
    setError(false)
    try {
      const id = await ensureMeeting()
      await api.actions.updateMeetingReport(target.id, id, {
        status: meeting?.status === 'done' ? 'in_progress' : 'done',
      })
    } catch {
      setError(true)
    }
  }

  const done = meeting?.status === 'done'
  // Les notes de mes collègues restent listées sous la mienne.
  const list = [...(notes.data ?? [])].reverse().filter((n) => n.id !== mine?.id)
  const recontact = recontactLocal ?? meeting?.recontact ?? false
  const interest = interestLocal !== undefined ? interestLocal : (meeting?.interest ?? null)
  const news = newsLocal ?? meeting?.news ?? false

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
          onChange={(e) => {
            typed.current = true
            setDraft(e.target.value)
            setSaved(false)
          }}
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
          disabled={busy || !draft.trim() || draft.trim() === mine?.body}
          onClick={() => void save()}
        >
          {t('notepad.save')}
        </Button>
        <Button
          variant={done ? 'primary' : 'secondary'}
          className="min-h-12"
          aria-pressed={done}
          onClick={() => void toggleDone()}
        >
          <CheckCircle2 aria-hidden className="size-4" />
          {t('notepad.finish')}
        </Button>
      </div>
      {saved ? (
        <p role="status" className="text-sm font-medium text-emerald-800">
          {t('notepad.saved')}
        </p>
      ) : null}
      {done && !saved ? (
        <p role="status" className="flex items-center gap-1.5 text-sm font-medium text-emerald-800">
          <CheckCircle2 aria-hidden className="size-4" />
          {t('notepad.finished')}
        </p>
      ) : null}

      <div role="group" aria-labelledby="notepad-interest" className="flex flex-col gap-1.5">
        <span id="notepad-interest" className="text-base font-medium">
          {t('notepad.interest')}
        </span>
        <div className="grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={interest === n}
              aria-label={t('report.interestValue', { n })}
              onClick={() => void setInterest(n)}
              className={`focus-visible:outline-brand-600 min-h-12 rounded-xl border text-lg font-semibold ${
                interest === n
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3">
        <input
          type="checkbox"
          className="size-6"
          checked={recontact}
          onChange={(e) => void setRecontact(e.target.checked)}
        />
        <span className="flex-1 text-base font-medium">{t('notepad.recontact')}</span>
        <span className="text-sm font-semibold" aria-hidden>
          {recontact ? t('notepad.yes') : t('notepad.no')}
        </span>
      </label>

      {membership.newsEnabled ? (
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-300 bg-white px-3">
          <input
            type="checkbox"
            className="size-6"
            checked={news}
            onChange={(e) => void setNews(e.target.checked)}
          />
          <span className="flex-1 text-base font-medium">{t('notepad.news')}</span>
          <span className="text-sm font-semibold" aria-hidden>
            {news ? t('notepad.yes') : t('notepad.no')}
          </span>
        </label>
      ) : null}

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
