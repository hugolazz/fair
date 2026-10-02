import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { InputField, SelectField, TextareaField } from '@/components/ui/field'
import { addMeetingNote, fetchMeetingNotes } from '@/db/repositories/targets'
import {
  MEETING_STATUSES,
  type MeetingStatus,
  type Target,
  type TargetMeeting,
} from '@/db/schemas/prepare'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { formatSlot } from './lib/format'
import type { TargetsApi } from './use-targets'

type Props = {
  target: Target
  meeting: TargetMeeting
  api: TargetsApi
  nameOf: (userId: string) => string
}

/**
 * Compte-rendu d'une rencontre : statut, intérêt (1 à 5), prochaine étape et notes. C'est ce qui alimente le bilan
 * du salon et les exports ; chaque modification est enregistrée tout de suite.
 */
export function MeetingReport({ target, meeting, api, nameOf }: Props) {
  const { t } = useTranslation('prepare')
  const { session, membership } = useReadySession()
  const notes = useAsync(() => fetchMeetingNotes(meeting.id), [meeting.id])
  const [nextStep, setNextStep] = useState(meeting.nextStep)
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  const [noteError, setNoteError] = useState(false)

  const save = (patch: Parameters<TargetsApi['actions']['updateMeetingReport']>[2]) =>
    void api.actions.updateMeetingReport(target.id, meeting.id, patch)

  async function addNote() {
    if (!draft.trim()) return
    setAdding(true)
    setNoteError(false)
    try {
      await addMeetingNote(membership.teamId, meeting.id, session.user.id, draft)
      setDraft('')
      notes.reload()
    } catch {
      setNoteError(true)
    } finally {
      setAdding(false)
    }
  }

  return (
    <details className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <summary className="min-h-9 cursor-pointer text-sm font-medium">
        {t('report.title')} · {t(`report.status.${meeting.status as MeetingStatus}`)}
        {meeting.interest ? ` · ${t('report.interestShort', { n: meeting.interest })}` : ''}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label={t('report.statusLabel')}
            value={meeting.status}
            onChange={(e) => save({ status: e.target.value as MeetingStatus })}
          >
            {MEETING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`report.status.${s}`)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('report.interest')}
            value={meeting.interest ?? ''}
            onChange={(e) =>
              save({ interest: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">—</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {t('report.interestValue', { n })}
              </option>
            ))}
          </SelectField>
        </div>
        <InputField
          label={t('report.nextStep')}
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          onBlur={() => nextStep !== meeting.nextStep && save({ nextStep })}
          maxLength={300}
        />

        <section aria-label={t('report.notes')} className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">{t('report.notes')}</h4>
          {notes.data && notes.data.length === 0 ? (
            <p className="text-sm text-slate-600">{t('report.noNotes')}</p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {notes.data?.map((n) => (
              <li key={n.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                <p className="text-xs text-slate-600">
                  {formatSlot(n.capturedAt)} · {nameOf(n.authorId)}
                </p>
                <p className="whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ul>
          <TextareaField
            label={t('report.newNote')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
          />
          {noteError ? (
            <p role="alert" className="text-sm text-red-700">
              {t('report.noteError')}
            </p>
          ) : null}
          <div>
            <Button
              variant="secondary"
              disabled={adding || !draft.trim()}
              onClick={() => void addNote()}
            >
              {t('report.addNote')}
            </Button>
          </div>
        </section>
      </div>
    </details>
  )
}
