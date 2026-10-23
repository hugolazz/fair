import { CheckCircle2, NotebookPen, UserPlus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { fetchMeetingNotes } from '@/db/repositories/targets'
import type { Target, TargetContact } from '@/db/schemas/prepare'
import { useReadySession } from '@/features/auth-team/session'
import { AddContactForm } from '@/features/manual-entry/add-contact-form'
import { useSync } from '@/features/sync/use-sync'
import { newId } from '@/lib/ids'
import { useAsync } from '@/lib/use-async'
import { formatTime } from './lib/format'
import { currentMeeting, isEmptyAutoMeeting } from './lib/notepad'
import { overlayNotes } from './lib/overlay'
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

/** Pause après la dernière frappe avant d'enregistrer la note toute seule. */
const AUTOSAVE_DELAY_MS = 800

/**
 * Prise de notes pendant la rencontre : un grand champ, enregistré tout seul (après une courte pause, en quittant le
 * champ, en fermant la fiche ou en changeant d'application). La rencontre est créée toute seule à la première action
 * (note, intérêt, case…) et marquée terminée : on y est, donc on a vu la personne. On y donne aussi l'intérêt (1 à 5,
 * un appui), avec qui on a parlé (contact en cases séparées) et si la personne est à recontacter ; la prochaine étape
 * reste dans « Modifier la fiche ». Tout part par la file d'attente hors ligne : sans réseau, la note est gardée sur l'appareil
 * et s'envoie toute seule au retour de la connexion (le champ reste utilisable, la ligne d'état le dit).
 */
export function MeetingNotepad({ target, api, nameOf, contacts, onContactAdded }: Props) {
  const { t } = useTranslation('prepare')
  const { t: tm } = useTranslation('manual')
  const { session, membership } = useReadySession()
  const sync = useSync()
  const syncRef = useRef(sync)
  syncRef.current = sync
  const meId = session.user.id
  const meeting = currentMeeting(target.meetings, meId)
  const notes = useAsync(
    () => (meeting ? fetchMeetingNotes(meeting.id) : Promise.resolve([])),
    [meeting?.id],
  )
  // Les notes lues, avec par-dessus mes écritures pas encore parties (hors ligne, ou page rechargée avant l'envoi).
  const pendingKeys = sync.snapshot.keys
  const noteList = useMemo(
    () =>
      overlayNotes(
        notes.data ?? [],
        sync.snapshot.pending > 0 ? sync.pendingOps() : [],
        meeting?.id,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `pendingKeys` change à chaque évolution de la file
    [notes.data, pendingKeys, meeting?.id],
  )
  // Mon texte : une seule note par rencontre, qui reste affichée (et modifiable) après l'enregistrement.
  const mine = [...noteList].reverse().find((n) => n.authorId === meId)
  // La liste est lue, ou la lecture a échoué (réseau coupé) : dans les deux cas on peut écrire.
  const notesSettled = notes.data !== undefined || notes.error !== undefined
  const [draft, setDraft] = useState('')
  const [saved, setSaved] = useState(false)
  const [removed, setRemoved] = useState(false) // champ vidé : la note a été supprimée
  const [saving, setSaving] = useState(false)
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
  // Enregistrement automatique : tout passe par des refs, car il se déclenche aussi à la fermeture de la fiche.
  const draftRef = useRef('') // dernier texte tapé
  const lastSaved = useRef('') // dernier texte enregistré (ou chargé)
  const noteId = useRef<string>(undefined) // ma note, dès qu'elle existe : jamais deux notes pour un même texte
  const capturedAt = useRef<string>(undefined) // l'heure de ma note : elle ne change pas quand on la corrige
  // On sait qu'aucune note de moi n'existe déjà (liste lue, ou rencontre créée ici) ; sinon l'envoi reprend celle qui existe.
  const notesKnown = useRef(false)
  const markedDone = useRef(false)
  const running = useRef(false)
  const timer = useRef<number>(undefined)
  const mounted = useRef(true)
  const meetingRef = useRef(meeting) // la rencontre à jour, pour les actions qui finissent après un rendu
  meetingRef.current = meeting

  // La rencontre a disparu sans nous (le contact qui en était la seule trace vient d'être supprimé) : on oublie ses
  // identifiants, la prochaine action en recrée une.
  useEffect(() => {
    if (meeting) {
      meetingSeen.current = true
      return
    }
    if (!meetingSeen.current) return
    meetingSeen.current = false
    creating.current = undefined
    markedDone.current = false
    noteId.current = undefined
    capturedAt.current = undefined
    lastSaved.current = ''
  }, [meeting])
  const meetingSeen = useRef(false) // une rencontre a déjà existé ici : si elle disparaît, c'est de l'extérieur

  // Le champ est rempli une fois avec ma note existante ; la rencontre créée par nos soins ne l'efface pas.
  useEffect(() => {
    if (!notesSettled) return
    const key = meeting?.id ?? 'none'
    if (seededFor.current === key) return
    seededFor.current = key
    noteId.current = mine?.id
    capturedAt.current = mine?.capturedAt
    notesKnown.current = notes.data !== undefined
    lastSaved.current = mine?.body ?? ''
    if (!typed.current) {
      draftRef.current = mine?.body ?? ''
      setDraft(mine?.body ?? '')
    }
  }, [notesSettled, notes.data, meeting?.id, mine?.id, mine?.body, mine?.capturedAt])

  /** La rencontre en cours, créée à la volée (sans planification) si elle n'existe pas encore. */
  function ensureMeeting(): Promise<string> {
    if (meeting) return Promise.resolve(meeting.id)
    // Deux actions rapprochées ne doivent créer qu'une seule rencontre.
    creating.current ??= (async () => {
      const id = newId()
      seededFor.current = id
      notesKnown.current = true // rencontre toute neuve : aucune note de moi dessus
      const ok = await api.actions.saveMeeting({
        id,
        targetId: target.id,
        ownerId: meId,
        plannedAt: new Date().toISOString(),
        durationMin: 15,
        reminderMin: null,
        auto: true, // créée par le bloc-notes : supprimée toute seule si tout est retiré
      })
      if (!ok) {
        creating.current = undefined
        throw new Error('meeting')
      }
      return id
    })()
    return creating.current
  }

  /**
   * Quand tout a été retiré (note, intérêt, cases, contact), la rencontre créée par le bloc-notes est supprimée : sa date
   * ne reste pas dans les listes. `over` = valeurs qu'on vient de changer et que le rendu n'a pas encore reprises.
   */
  async function dropIfEmpty(
    over: { interest?: number | null; recontact?: boolean; news?: boolean } = {},
  ) {
    const m = meetingRef.current
    if (!m) return
    const empty = isEmptyAutoMeeting(m, {
      interest: over.interest !== undefined ? over.interest : interest,
      recontact: over.recontact ?? recontact,
      news: over.news ?? news,
      contactAttached: m.contactId !== null,
      noteCount: draftRef.current.trim() !== '' || noteId.current ? 1 : 0,
    })
    if (!empty) return
    // La note d'un collègue (déjà lue) : on ne supprime rien. On n'attend jamais le réseau ici : l'enregistrement de la
    // note ne doit pas dépendre d'une connexion qui peut être coupée.
    if ((notes.data ?? []).some((n) => n.authorId !== meId)) return
    creating.current = undefined
    markedDone.current = false
    noteId.current = undefined
    capturedAt.current = undefined
    lastSaved.current = ''
    await api.actions.deleteMeeting(target.id, m.id)
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
      if (!on) await dropIfEmpty({ recontact: false })
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
      if (!on) await dropIfEmpty({ news: false })
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
      if (next === null) await dropIfEmpty({ interest: null })
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
      // Le contact rencontré est rattaché à la rencontre (colonne « Contact » des exports) : on l'a vu, donc terminée.
      const id = await ensureMeeting()
      markedDone.current = true
      await api.actions.updateMeetingReport(target.id, id, { contactId: c.id, status: 'done' })
    } catch {
      setError(true)
    }
  }

  /**
   * Enregistre le texte le plus récent. Un enregistrement déjà en cours reprend seul ce qui a été tapé entre-temps ;
   * un champ vidé supprime la note (une note vide n'aurait rien à faire dans les exports). Écrire une note = avoir
   * rencontré l'entreprise.
   */
  async function persist() {
    if (running.current) return
    running.current = true
    try {
      for (;;) {
        const body = draftRef.current.trim()
        if (body === lastSaved.current) break
        if (mounted.current) {
          setSaving(true)
          setSaved(false)
          setRemoved(false)
          setError(false)
        }
        if (!body) {
          if (noteId.current) {
            syncRef.current.enqueue({
              type: 'note.delete',
              id: noteId.current,
              meetingId: meetingRef.current?.id ?? '',
            })
          }
          noteId.current = undefined
          capturedAt.current = undefined
          lastSaved.current = ''
          if (mounted.current) setRemoved(true)
          await dropIfEmpty()
          continue
        }
        const meetingId = await ensureMeeting()
        if (!markedDone.current && meeting?.status !== 'done') {
          await api.actions.updateMeetingReport(target.id, meetingId, { status: 'done' })
        }
        markedDone.current = true
        noteId.current ??= newId()
        capturedAt.current ??= new Date().toISOString()
        syncRef.current.enqueue({
          type: 'note.upsert',
          note: {
            id: noteId.current,
            teamId: membership.teamId,
            meetingId,
            authorId: meId,
            body,
            capturedAt: capturedAt.current,
            adopt: !notesKnown.current,
          },
        })
        lastSaved.current = body
        if (mounted.current) setSaved(true)
      }
    } catch {
      if (mounted.current) setError(true)
    } finally {
      running.current = false
      if (mounted.current) setSaving(false)
    }
  }
  const persistRef = useRef(persist)
  persistRef.current = persist

  /** Enregistre tout de suite ce qui est en attente (on quitte le champ, la fiche ou l'application). */
  function flush() {
    window.clearTimeout(timer.current)
    void persistRef.current()
  }

  useEffect(() => {
    mounted.current = true
    const onHidden = () => {
      if (document.hidden) flush()
    }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', flush)
      // Fermer la fiche juste après avoir tapé : le texte part quand même.
      flush()
      mounted.current = false
    }
  }, [])

  const done = meeting?.status === 'done'
  // Les notes de mes collègues restent listées sous la mienne.
  const list = [...noteList].reverse().filter((n) => n.id !== mine?.id)
  const recontact = recontactLocal ?? meeting?.recontact ?? false
  const interest = interestLocal !== undefined ? interestLocal : (meeting?.interest ?? null)
  const news = newsLocal ?? meeting?.news ?? false
  // Hors ligne, la note est sur l'appareil mais pas encore partie : on le dit plutôt que « Note enregistrée ».
  const noteWaiting =
    saved &&
    sync.snapshot.status === 'offline' &&
    noteId.current !== undefined &&
    sync.snapshot.keys.has(`note:${noteId.current}`)

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
          readOnly={!notesSettled} // le temps de charger ma note : pas de texte tapé par-dessus
          onChange={(e) => {
            typed.current = true
            draftRef.current = e.target.value
            setDraft(e.target.value)
            setSaved(false)
            setRemoved(false)
            window.clearTimeout(timer.current)
            timer.current = window.setTimeout(() => void persistRef.current(), AUTOSAVE_DELAY_MS)
          }}
          onBlur={flush}
          placeholder={t('notepad.placeholder')}
          rows={4}
          className="focus-visible:outline-brand-text min-h-28 w-full rounded-xl border border-slate-300 bg-white p-3 text-base"
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {t('notepad.error')}
        </p>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className="flex min-h-5 items-center gap-1.5 text-sm font-medium text-emerald-800"
      >
        {saving ? (
          <span className="font-normal text-slate-600">{t('notepad.saving')}</span>
        ) : removed ? (
          t('notepad.removed')
        ) : noteWaiting ? (
          t('notepad.savedOffline')
        ) : saved ? (
          t('notepad.saved')
        ) : done ? (
          <>
            <CheckCircle2 aria-hidden className="size-4" />
            {t('notepad.finished')}
          </>
        ) : null}
      </p>

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
              className={`focus-visible:outline-brand-text min-h-12 rounded-xl border text-lg font-semibold ${
                interest === n
                  ? 'bg-brand-600 border-brand-600 text-brand-on'
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
