import { Bell, CalendarClock, CircleCheck, Plus, Search, Target as TargetIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { useCan } from '@/features/auth-team/roles'
import { useReadySession } from '@/features/auth-team/session'
import { AddCompanyDialog } from '@/features/manual-entry/add-company-dialog'
import { useEvent } from '@/features/events/event-context'
import { PriorityBadge, TagChip } from './atoms'
import { dueReminders } from './lib/ics'
import { formatSlot, formatTime } from './lib/format'
import { isSeenBy, matchesSearch, myList } from './lib/misc'
import { cn } from '@/lib/cn'
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
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string>()
  const canAdd = useCan('add_companies')
  const { t: tm } = useTranslation('manual')
  const [now, setNow] = useState(() => new Date())

  // Les rappels sont recalculés chaque minute tant que la page est ouverte.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // Toutes mes cibles (les rappels et le compteur) ; la liste affichée suit la recherche.
  const allMine = useMemo(() => myList(api.targets ?? [], meId), [api.targets, meId])
  const mine = useMemo(
    () => (search.trim() ? allMine.filter((tg) => matchesSearch(tg, search)) : allMine),
    [allMine, search],
  )
  const tagById = useMemo(() => new Map(api.tags.map((tag) => [tag.id, tag])), [api.tags])
  const reminders = useMemo(
    () =>
      dueReminders(
        allMine.flatMap((tg) =>
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
    [allMine, meId, now],
  )

  if (api.loading) return <Loading />
  if (api.error) return <ErrorState message={t('errors.load')} onRetry={api.reload} />

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{t('myList.title')}</h2>
        <p className="text-sm text-slate-600">
          {t('myList.subtitle')}{' '}
          {allMine.length > 0 ? `· ${t('myList.count', { count: allMine.length })}` : ''}
        </p>
      </div>

      {notice ? (
        <p
          role="status"
          className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          {notice}
          <Button variant="ghost" className="min-h-9" onClick={() => setNotice(undefined)}>
            {t('errors.dismiss')}
          </Button>
        </p>
      ) : null}

      <div className="flex items-center gap-2" role="search">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t('myList.search')}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('myList.search')}
            className="min-h-11 w-full rounded-full border-0 bg-slate-100 pr-4 pl-10 text-base placeholder:text-slate-500 md:text-[13px]"
          />
        </label>
        {canAdd ? (
          <Button
            variant="secondary"
            className="size-11 shrink-0 px-0"
            aria-label={tm('company.open')}
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden className="size-5" />
          </Button>
        ) : null}
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

      {allMine.length === 0 ? (
        <EmptyState
          icon={<TargetIcon className="size-10" />}
          title={t('myList.empty')}
          body={t('myList.emptyHint')}
        />
      ) : mine.length === 0 ? (
        <p role="status" className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700">
          {t('myList.noResult')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((tg) => {
            const seen = isSeenBy(tg, meId)
            return (
              <li key={tg.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(tg.id)}
                  data-seen={seen ? 'true' : undefined}
                  className={cn(
                    'hover:border-brand-600 flex min-h-16 w-full items-center gap-3 rounded-xl border p-3 text-left md:gap-4',
                    seen
                      ? 'border-slate-200 bg-slate-100 text-slate-600'
                      : 'border-slate-200 bg-white',
                  )}
                >
                  <span className={seen ? 'opacity-60 grayscale' : undefined}>
                    <PriorityBadge priority={tg.priority} size="lg" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{tg.name}</span>
                    <span
                      className={cn(
                        'block truncate text-sm',
                        seen ? 'text-slate-600' : 'text-slate-700',
                      )}
                    >
                      {[tg.stand && t('sheet.stand', { stand: tg.stand }), tg.industry]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {tg.tagIds.length > 0 ? (
                      <span className={cn('mt-1 flex flex-wrap gap-1', seen && 'grayscale')}>
                        {tg.tagIds.map((id) => {
                          const tag = tagById.get(id)
                          return tag ? <TagChip key={id} tag={tag} /> : null
                        })}
                      </span>
                    ) : null}
                  </span>
                  {seen ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
                      <CircleCheck aria-hidden className="size-4" />
                      {t('myList.seen')}
                    </span>
                  ) : tg.meetings[0] ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium">
                      <CalendarClock aria-hidden className="size-4" />
                      {formatSlot(tg.meetings[0].plannedAt)}
                    </span>
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <AddCompanyDialog
        eventId={event.id}
        open={adding}
        onOpenChange={setAdding}
        alwaysAssign
        onAdded={(result, name) => {
          setNotice(tm(`company.${result.status}`, { name }))
          api.reload()
          if (result.targetId) setOpenId(result.targetId)
        }}
      />

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
