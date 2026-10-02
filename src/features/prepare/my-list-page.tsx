import { Bell, CalendarClock, Target as TargetIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { useReadySession } from '@/features/auth-team/session'
import { useEvent } from '@/features/events/event-context'
import { PriorityBadge, TagChip } from './atoms'
import { dueReminders } from './lib/ics'
import { formatSlot, formatTime } from './lib/format'
import { myList } from './lib/misc'
import { TargetSheet } from './target-sheet'
import { useTargets } from './use-targets'

/** Ma liste : mes cibles du salon, de la plus à la moins prioritaire, avec les rappels de rendez-vous. */
export default function MyListPage() {
  const { t } = useTranslation('prepare')
  const { event } = useEvent()
  const { session, membership } = useReadySession()
  const meId = session.user.id
  const api = useTargets(event.id, membership.teamId)
  const [openId, setOpenId] = useState<string>()
  const [now, setNow] = useState(() => new Date())

  // Les rappels sont recalculés chaque minute tant que la page est ouverte.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const mine = useMemo(() => myList(api.targets ?? [], meId), [api.targets, meId])
  const tagById = useMemo(() => new Map(api.tags.map((tag) => [tag.id, tag])), [api.tags])
  const reminders = useMemo(
    () =>
      dueReminders(
        mine.flatMap((tg) =>
          tg.meetings
            .filter((m) => m.ownerId === meId)
            .map((m) => ({
              meetingId: m.id,
              targetId: tg.id,
              plannedAt: m.plannedAt,
              durationMin: m.durationMin,
              reminderMin: m.reminderMin,
              name: tg.name,
            })),
        ),
        now,
      ),
    [mine, meId, now],
  )

  if (api.loading) return <Loading />
  if (api.error) return <ErrorState message={t('errors.load')} onRetry={api.reload} />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{t('myList.title')}</h2>
        <p className="text-sm text-slate-600">
          {t('myList.subtitle')}{' '}
          {mine.length > 0 ? `· ${t('myList.count', { count: mine.length })}` : ''}
        </p>
      </div>

      {reminders.map((r) => (
        <button
          key={r.meetingId}
          type="button"
          onClick={() => setOpenId(r.targetId)}
          role="alert"
          className="flex min-h-14 items-center gap-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-3 text-left font-medium text-amber-950"
        >
          <Bell aria-hidden className="size-6 shrink-0" />
          {t('myList.reminder', { name: r.name, time: formatTime(r.plannedAt) })}
        </button>
      ))}

      {mine.length === 0 ? (
        <EmptyState
          icon={<TargetIcon className="size-10" />}
          title={t('myList.empty')}
          body={t('myList.emptyHint')}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((tg) => (
            <li key={tg.id}>
              <button
                type="button"
                onClick={() => setOpenId(tg.id)}
                className="hover:border-brand-600 flex min-h-16 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left md:gap-4"
              >
                <PriorityBadge priority={tg.priority} size="lg" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">{tg.name}</span>
                  <span className="block truncate text-sm text-slate-700">
                    {[
                      tg.stand && t('sheet.stand', { stand: tg.stand }),
                      tg.goal && t(`goal.${tg.goal}`),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  {tg.tagIds.length > 0 ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {tg.tagIds.map((id) => {
                        const tag = tagById.get(id)
                        return tag ? <TagChip key={id} tag={tag} /> : null
                      })}
                    </span>
                  ) : null}
                </span>
                {tg.meetings[0] ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
                    <CalendarClock aria-hidden className="size-4" />
                    {formatSlot(tg.meetings[0].plannedAt)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <TargetSheet
        target={api.targets?.find((x) => x.id === openId)}
        api={api}
        meId={meId}
        eventName={event.name}
        eventDate={event.starts_on ?? ''}
        onClose={() => setOpenId(undefined)}
      />
    </div>
  )
}
