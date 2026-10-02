import { ArrowLeft, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { Loading } from '@/components/page-states'
import { cn } from '@/lib/cn'
import { PriorityBadge } from '@/features/prepare/atoms'
import { useVirtualRows } from '@/features/prepare/use-virtual-rows'
import { StatusPill } from './field-atoms'
import { useFieldCtx } from './field-context'
import {
  countByScope,
  defaultFilters,
  filterField,
  isHappeningNow,
  sortNow,
  type FieldFilters,
  type FieldRow,
  type Scope,
} from './lib/list'
import { SyncIndicator } from '@/features/offline/sync-indicator'
import { ThemeButton } from './theme-button'
import { UnplannedDialog } from './unplanned-dialog'
import { useFieldRows, useLocalEvent } from './use-field-data'

const CARD_HEIGHT = 104

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border-2 px-4 text-base font-bold whitespace-nowrap',
        pressed
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-white text-slate-900',
      )}
    >
      {children}
    </button>
  )
}

function Card({ row, now }: { row: FieldRow; now: Date }) {
  const { t } = useTranslation('field')
  const soon = isHappeningNow(row.plannedAt, now)
  return (
    <Link
      to={row.id}
      className={cn(
        'flex h-[96px] items-center gap-3 rounded-2xl border-2 bg-white px-3 active:bg-slate-100',
        soon ? 'border-amber-500' : 'border-slate-200',
      )}
    >
      <PriorityBadge priority={row.priority} size="lg" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg leading-tight font-bold">{row.name}</span>
        <span className="block truncate text-base text-slate-700">
          {[row.stand && t('list.stand', { stand: row.stand }), row.industry]
            .filter(Boolean)
            .join(' · ')}
        </span>
        <span className="mt-1 flex items-center gap-2">
          {row.status !== 'to_see' ? <StatusPill status={row.status} /> : null}
          {soon ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-sm font-bold text-amber-900">
              {t('list.now')}
            </span>
          ) : null}
          {row.mine ? (
            <span className="text-brand-700 text-sm font-semibold">{t('list.mineBadge')}</span>
          ) : null}
        </span>
      </span>
      {row.interest ? (
        <span
          aria-label={t('list.interest', { n: row.interest })}
          className="text-brand-700 shrink-0 text-2xl font-bold"
        >
          {row.interest}
          <span className="text-sm text-slate-600">/5</span>
        </span>
      ) : null}
    </Link>
  )
}

/** Accueil du mode terrain : « À voir maintenant ». Gros boutons, recherche instantanée, tout en local. */
export default function FieldHome() {
  const { t } = useTranslation('field')
  const ctx = useFieldCtx()
  const navigate = useNavigate()
  const event = useLocalEvent(ctx.eventId)
  const all = useFieldRows(ctx.eventId, ctx.userId)
  const [filters, setFilters] = useState<FieldFilters>(defaultFilters)
  const [creating, setCreating] = useState(false)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const rows = useMemo(() => sortNow(filterField(all ?? [], filters), now), [all, filters, now])
  const counts = useMemo(() => countByScope(all ?? []), [all])
  const { ref, onScroll, start, end, totalHeight, offsetTop } = useVirtualRows(
    rows.length,
    CARD_HEIGHT,
    4,
  )
  const set = (patch: Partial<FieldFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const scope = (s: Scope, label: string) => (
    <Chip pressed={filters.scope === s} onClick={() => set({ scope: s })}>
      {label} <span className="tabular-nums opacity-80">{counts[s]}</span>
    </Chip>
  )

  if (all === undefined) return <Loading />

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-1">
          <Link
            to={`/events/${ctx.eventId}`}
            aria-label={t('backToEvent')}
            className="inline-flex size-11 items-center justify-center rounded-full hover:bg-slate-100"
          >
            <ArrowLeft aria-hidden className="size-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{t('title')}</h1>
            {event ? <p className="truncate text-sm text-slate-700">{event.name}</p> : null}
          </div>
          <SyncIndicator />
          <ThemeButton />
        </div>
        <label className="relative block">
          <span className="sr-only">{t('searchLabel')}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-slate-600"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder={t('search')}
            enterKeyHint="search"
            autoComplete="off"
            className="h-14 w-full rounded-2xl border-2 border-slate-300 bg-white pr-4 pl-12 text-lg placeholder:text-slate-500"
          />
        </label>
        <div
          role="group"
          aria-label={t('chips.quick')}
          className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1"
        >
          <Chip pressed={filters.mine} onClick={() => set({ mine: !filters.mine })}>
            {t('chips.mine')}
          </Chip>
          <Chip pressed={filters.onlyA} onClick={() => set({ onlyA: !filters.onlyA })}>
            {t('chips.a')}
          </Chip>
          <span aria-hidden className="mx-1 w-px shrink-0 bg-slate-300" />
          {scope('todo', t('chips.todo'))}
          {scope('follow_up', t('chips.followUp'))}
          {scope('done', t('chips.done'))}
          {scope('all', t('chips.all'))}
        </div>
      </header>

      {all.length === 0 ? (
        <div className="m-4 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center">
          <p className="text-lg font-semibold">{t('list.emptyAll')}</p>
          <p className="mt-2 text-slate-700">{t('list.emptyAllHint')}</p>
        </div>
      ) : rows.length === 0 ? (
        <p
          role="status"
          className="m-4 rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center text-lg"
        >
          {t('list.empty')}
        </p>
      ) : (
        <div
          ref={ref}
          onScroll={onScroll}
          role="list"
          aria-label={t('title')}
          className="min-h-0 flex-1 overflow-y-auto px-3 pt-2 pb-28"
        >
          <div style={{ height: totalHeight }}>
            <div style={{ transform: `translateY(${offsetTop}px)` }}>
              {rows.slice(start, end).map((row) => (
                <div key={row.id} role="listitem" style={{ height: CARD_HEIGHT }} className="pb-2">
                  <Card row={row} now={now} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="bg-brand-600 active:bg-brand-700 fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 inline-flex min-h-16 items-center gap-2 rounded-full px-6 text-lg font-bold text-white shadow-xl"
      >
        <Plus aria-hidden className="size-6" />
        {t('unplanned.button')}
      </button>

      {creating ? (
        <UnplannedDialog
          ctx={ctx}
          onClose={() => setCreating(false)}
          onCreated={(id) => navigate(id)}
        />
      ) : null}
    </div>
  )
}
