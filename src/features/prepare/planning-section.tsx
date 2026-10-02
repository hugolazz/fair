import { CalendarPlus, Download, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { InputField, SelectField } from '@/components/ui/field'
import type { Target, TargetMeeting, TeamMember } from '@/db/schemas/prepare'
import { buildIcs } from './lib/ics'
import { formatSlot, fromLocalInputs, toLocalInputs } from './lib/format'
import { MeetingReport } from './meeting-report'
import type { TargetsApi } from './use-targets'

const DURATIONS = [10, 15, 20, 30, 45, 60]
const REMINDERS = [5, 15, 30, 60]

type Props = {
  target: Target
  members: TeamMember[]
  meId: string
  nameOf: (userId: string) => string
  api: TargetsApi
  eventName: string
  defaultDate: string
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/** Créneaux de rendez-vous de la cible : planification optionnelle, rappel, export agenda. */
export function PlanningSection({
  target,
  members,
  meId,
  nameOf,
  api,
  eventName,
  defaultDate,
}: Props) {
  const { t } = useTranslation('prepare')
  const [editing, setEditing] = useState<TargetMeeting | 'new' | null>(null)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(15)
  const [owner, setOwner] = useState(meId)
  const [reminder, setReminder] = useState<number | null>(15)
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  function open(m: TargetMeeting | 'new') {
    setError(undefined)
    if (m === 'new') {
      setDate(defaultDate)
      setTime('')
      setDuration(15)
      setOwner(
        target.assigneeIds.includes(meId) || target.assigneeIds.length === 0
          ? meId
          : target.assigneeIds[0]!,
      )
      setReminder(15)
    } else {
      const l = toLocalInputs(m.plannedAt)
      setDate(l.date)
      setTime(l.time)
      setDuration(m.durationMin)
      setOwner(m.ownerId)
      setReminder(m.reminderMin)
    }
    setEditing(m)
  }

  async function save() {
    const plannedAt = fromLocalInputs(date, time)
    if (!plannedAt) {
      setError(t('planning.invalid'))
      return
    }
    setSaving(true)
    const ok = await api.actions.saveMeeting({
      ...(editing && editing !== 'new' ? { id: editing.id } : {}),
      targetId: target.id,
      ownerId: owner,
      plannedAt,
      durationMin: duration,
      reminderMin: reminder,
    })
    setSaving(false)
    if (ok) setEditing(null)
    else setError(t('planning.error'))
  }

  function exportIcs(m: TargetMeeting) {
    const slug =
      target.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'rdv'
    download(
      `fair-rdv-${slug}.ics`,
      buildIcs({
        uid: m.id,
        title: t('planning.icsTitle', { name: target.name }),
        start: new Date(m.plannedAt),
        durationMin: m.durationMin,
        reminderMin: m.reminderMin,
        location: target.stand
          ? t('planning.icsStand', { stand: target.stand, event: eventName })
          : eventName,
        description: target.prepComment,
      }),
    )
  }

  const ownerOptions = members.length ? members : [{ userId: meId, name: nameOf(meId) }]

  return (
    <section aria-labelledby="planning-title" className="flex flex-col gap-3">
      <h3 id="planning-title" className="font-semibold">
        {t('planning.title')}
      </h3>
      {target.meetings.length === 0 && !editing ? (
        <p className="text-sm text-slate-600">{t('planning.none')}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {target.meetings.map((m) => (
          <li key={m.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <p className="font-medium">{formatSlot(m.plannedAt)}</p>
            <p className="text-sm text-slate-700">
              {t('planning.minutes', { count: m.durationMin })} · {nameOf(m.ownerId)} ·{' '}
              {m.reminderMin === null
                ? t('planning.reminderNone')
                : t('planning.reminderBefore', { count: m.reminderMin })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="secondary" className="min-h-9" onClick={() => open(m)}>
                <Pencil aria-hidden className="size-4" />
                {t('planning.edit')}
              </Button>
              <Button
                variant="secondary"
                className="min-h-9"
                onClick={() => exportIcs(m)}
                title={t('planning.icsHint')}
              >
                <Download aria-hidden className="size-4" />
                {t('planning.ics')}
              </Button>
              <Button
                variant="ghost"
                className="min-h-9"
                onClick={() => void api.actions.deleteMeeting(target.id, m.id)}
              >
                <Trash2 aria-hidden className="size-4" />
                {t('planning.remove')}
              </Button>
            </div>
            <MeetingReport target={target} meeting={m} api={api} nameOf={nameOf} />
          </li>
        ))}
      </ul>

      {editing ? (
        <form
          className="flex flex-col gap-3 rounded-lg border border-slate-300 bg-white p-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <InputField
              label={t('planning.date')}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <InputField
              label={t('planning.time')}
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label={t('planning.duration')}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {t('planning.minutes', { count: d })}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('planning.reminder')}
              value={reminder ?? ''}
              onChange={(e) => setReminder(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">{t('planning.reminderNone')}</option>
              {REMINDERS.map((r) => (
                <option key={r} value={r}>
                  {r === 60
                    ? t('planning.reminderHour')
                    : t('planning.reminderBefore', { count: r })}
                </option>
              ))}
            </SelectField>
          </div>
          <SelectField
            label={t('planning.owner')}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            {ownerOptions.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.userId === meId ? t('assign.me') : m.name}
              </option>
            ))}
          </SelectField>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {t('planning.save')}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t('assign.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button variant="secondary" onClick={() => open('new')}>
            <CalendarPlus aria-hidden className="size-4" />
            {t('planning.add')}
          </Button>
        </div>
      )}
    </section>
  )
}
