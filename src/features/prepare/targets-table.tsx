import { ArrowDown, ArrowUp } from 'lucide-react'
import type { MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PRIORITIES, type Priority, type Tag, type Target } from '@/db/schemas/prepare'
import { canPrepareTarget, useIsAdmin } from '@/features/auth-team/roles'
import { cn } from '@/lib/cn'
import { Assignees, PriorityBadge, TagChip } from './atoms'
import { formatSlot } from './lib/format'
import type { Sort, SortKey } from './lib/sort'
import { useVirtualRows } from './use-virtual-rows'

export type ListProps = {
  rows: Target[]
  tags: Tag[]
  selected: Set<string>
  openId: string | undefined
  meId: string
  nameOf: (userId: string) => string
  onToggle: (id: string, shift: boolean) => void
  onOpen: (id: string) => void
}

type Props = ListProps & {
  sort: Sort
  onSort: (key: SortKey) => void
  allSelected: boolean
  someSelected: boolean
  onToggleAll: () => void
  onPriority: (id: string, p: Priority | null) => void
}

const ROW_HEIGHT = 52
// case · prio · entreprise · stand · secteur · tags · assignés · rdv · contacts
const GRID =
  'grid grid-cols-[2.75rem_3rem_minmax(12rem,2.4fr)_4.5rem_minmax(7rem,1.2fr)_minmax(7rem,1.4fr)_minmax(6rem,1fr)_8rem_4.5rem] items-center'
const MIN_WIDTH = 'min-w-[50rem]'

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: 'priority', label: 'priority' },
  { key: 'name', label: 'company' },
  { key: 'stand', label: 'stand' },
  { key: 'industry', label: 'industry' },
  { key: null, label: 'tags' },
  { key: 'assignee', label: 'assignees' },
  { key: 'meeting', label: 'meeting' },
  { key: null, label: 'contacts' },
]

/** Tableau dense (desktop) : tri par colonne, sélection (Maj pour une plage), édition rapide de la priorité et de l'objectif. */
export function TargetsTable(p: Props) {
  const { t } = useTranslation('prepare')
  const admin = useIsAdmin()
  const { ref, onScroll, start, end, totalHeight, offsetTop } = useVirtualRows(
    p.rows.length,
    ROW_HEIGHT,
  )
  const tagById = new Map(p.tags.map((tag) => [tag.id, tag]))
  const nextPriority = (cur: Priority | null): Priority | null =>
    cur === null ? 'A' : cur === 'C' ? null : PRIORITIES[PRIORITIES.indexOf(cur) + 1]!

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="table"
      aria-rowcount={p.rows.length + 1}
      aria-label={t('title')}
      className="max-h-[calc(100dvh-17rem)] min-h-80 overflow-auto rounded-3xl bg-white p-2 shadow-[0_0_0_1px_var(--color-slate-200)]"
    >
      <div
        role="row"
        className={cn(
          GRID,
          MIN_WIDTH,
          'sticky top-0 z-10 h-10 bg-white text-[13px] font-medium text-slate-600 shadow-[0_1px_0_0_var(--color-slate-200)]',
        )}
      >
        <div role="columnheader" className="flex justify-center">
          <input
            type="checkbox"
            className="size-5"
            aria-label={t('select.all')}
            checked={p.allSelected}
            ref={(el) => {
              if (el) el.indeterminate = p.someSelected && !p.allSelected
            }}
            onChange={p.onToggleAll}
          />
        </div>
        {COLUMNS.map((c) => {
          const active = c.key !== null && p.sort.key === c.key
          return (
            <div
              key={c.label}
              role="columnheader"
              aria-sort={active ? (p.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              className="px-2"
            >
              {c.key ? (
                <button
                  type="button"
                  onClick={() => p.onSort(c.key!)}
                  className="-mx-1 inline-flex h-8 items-center gap-1 rounded px-1 hover:bg-slate-200"
                  aria-label={t('columns.sortBy', { column: t(`columns.${c.label}`) })}
                >
                  {t(`columns.${c.label}`)}
                  {active ? (
                    p.sort.dir === 'asc' ? (
                      <ArrowUp aria-hidden className="size-3.5" />
                    ) : (
                      <ArrowDown aria-hidden className="size-3.5" />
                    )
                  ) : null}
                </button>
              ) : (
                t(`columns.${c.label}`)
              )}
            </div>
          )
        })}
      </div>

      <div style={{ height: totalHeight }} className={MIN_WIDTH}>
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {p.rows.slice(start, end).map((row, i) => {
            const isSelected = p.selected.has(row.id)
            const next = row.meetings[0]
            return (
              <div
                key={row.id}
                role="row"
                aria-rowindex={start + i + 2}
                aria-selected={isSelected}
                style={{ height: ROW_HEIGHT }}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('button,input,select,a')) p.onOpen(row.id)
                }}
                className={cn(
                  GRID,
                  'cursor-pointer rounded-2xl text-sm transition-colors duration-200 hover:bg-slate-50',
                  isSelected && 'bg-brand-50 hover:bg-brand-50',
                  p.openId === row.id && 'outline-brand-600 outline-2 -outline-offset-2',
                )}
              >
                <div role="cell" className="flex justify-center">
                  <input
                    type="checkbox"
                    className="size-5"
                    aria-label={t('select.row', { name: row.name })}
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e: MouseEvent) => p.onToggle(row.id, e.shiftKey)}
                  />
                </div>
                <div role="cell" className="px-2">
                  <button
                    type="button"
                    disabled={!canPrepareTarget(admin, row.assigneeIds, p.meId)}
                    onClick={() => p.onPriority(row.id, nextPriority(row.priority))}
                    className="rounded-full disabled:cursor-not-allowed"
                    aria-label={t('priority.set', { p: row.priority ?? t('priority.none') })}
                  >
                    <PriorityBadge priority={row.priority} />
                  </button>
                </div>
                <div role="cell" className="min-w-0 px-2">
                  <button
                    type="button"
                    onClick={() => p.onOpen(row.id)}
                    className="max-w-full truncate text-left text-base font-medium hover:underline"
                  >
                    {row.name}
                  </button>
                </div>
                <div role="cell" className="truncate px-2">
                  {row.stand}
                </div>
                <div role="cell" className="truncate px-2 text-slate-700">
                  {row.industry}
                </div>
                <div role="cell" className="flex min-w-0 items-center gap-1 overflow-hidden px-2">
                  {row.tagIds.slice(0, 3).map((id) => {
                    const tag = tagById.get(id)
                    return tag ? <TagChip key={id} tag={tag} /> : null
                  })}
                  {row.tagIds.length > 3 ? (
                    <span className="text-xs text-slate-600">+{row.tagIds.length - 3}</span>
                  ) : null}
                </div>
                <div role="cell" className="min-w-0 px-2">
                  <Assignees target={row} nameOf={p.nameOf} meId={p.meId} compact />
                </div>
                <div role="cell" className="truncate px-2 text-slate-700">
                  {next ? formatSlot(next.plannedAt) : ''}
                </div>
                <div role="cell" className="px-2 text-slate-700 tabular-nums">
                  {row.contactCount || ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
