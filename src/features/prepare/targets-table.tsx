import { ArrowDown, ArrowUp } from 'lucide-react'
import { useMemo, type MouseEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PRIORITIES,
  type Priority,
  type Tag,
  type Target,
  type TeamMember,
} from '@/db/schemas/prepare'
import { canPrepareTarget, useIsAdmin } from '@/features/auth-team/roles'
import { cn } from '@/lib/cn'
import { AssignPicker } from './assign-picker'
import { Select } from '@/components/ui/select'
import { PriorityBadge } from './atoms'
import { ShowPills } from './show-pills'
import { TagPicker } from './tag-picker'
import { formatSlot } from './lib/format'
import type { Sort, SortKey } from './lib/sort'
import { useVirtualRows } from './use-virtual-rows'

export type ListProps = {
  rows: Target[]
  tags: Tag[]
  shows: Tag[]
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
  members: TeamMember[]
  onAssign: (id: string, userId: string) => void
  onUnassign: (id: string, userId: string) => void
  onToggleTag: (id: string, tagId: string, on: boolean) => void
}

const ROW_HEIGHT = 52
const HEADER_HEIGHT = 48 // en-tête collant (h-12)
// case · prio · entreprise · stand · tags · salons · assignés · rdv
const GRID =
  'grid grid-cols-[2.75rem_3rem_minmax(12rem,2.4fr)_4.5rem_minmax(7rem,1.4fr)_minmax(9rem,1.8fr)_minmax(6rem,1fr)_8rem] items-center'
const MIN_WIDTH = 'min-w-[46rem]'

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: 'priority', label: 'priority' },
  { key: 'name', label: 'company' },
  { key: 'stand', label: 'stand' },
  { key: null, label: 'tags' },
  { key: null, label: 'shows' },
  { key: 'assignee', label: 'assignees' },
  { key: 'meeting', label: 'meeting' },
]

/** Tableau dense (desktop) : tri par colonne, sélection (Maj pour une plage), édition rapide de la priorité et de l'objectif. */
export function TargetsTable(p: Props) {
  const { t } = useTranslation('prepare')
  const admin = useIsAdmin()
  const tagById = useMemo(() => new Map(p.tags.map((tag) => [tag.id, tag])), [p.tags])
  const { ref, onScroll, start, end, totalHeight, offsetTop } = useVirtualRows(
    p.rows.length,
    ROW_HEIGHT,
    8,
    { window: true, headerHeight: HEADER_HEIGHT },
  )

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="table"
      aria-rowcount={p.rows.length + 1}
      aria-label={t('title')}
      className="overflow-x-clip"
    >
      <div
        role="row"
        className={cn(
          GRID,
          MIN_WIDTH,
          'sticky top-0 z-10 h-12 bg-slate-50 px-2 text-[13px] font-medium text-slate-600 shadow-[0_1px_0_0_var(--color-slate-200)]',
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

      <div style={{ height: totalHeight }} className={cn(MIN_WIDTH, 'px-2')}>
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
                  const target = e.target as HTMLElement
                  // Les listes (priorité, tags, assignation) sont rendues hors de la ligne mais leurs clics remontent
                  // jusqu'ici par React : on ne les prend pas pour un clic sur la ligne.
                  if (!e.currentTarget.contains(target)) return
                  if (!target.closest('button,input,select,a')) p.onOpen(row.id)
                }}
                className={cn(
                  GRID,
                  'cursor-pointer rounded-2xl text-sm transition-colors duration-200 hover:bg-white',
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
                  <Select
                    value={row.priority ?? ''}
                    disabled={!canPrepareTarget(admin, row.assigneeIds, p.meId)}
                    onChange={(e) =>
                      p.onPriority(row.id, (e.target.value || null) as Priority | null)
                    }
                    aria-label={t('priority.set', { p: row.priority ?? t('priority.none') })}
                    display={<PriorityBadge priority={row.priority} />}
                    className="rounded-full"
                  >
                    {PRIORITIES.map((pr) => (
                      <option key={pr} value={pr}>
                        {t(`priority.${pr}`)}
                      </option>
                    ))}
                    <option value="">{t('priority.none')}</option>
                  </Select>
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
                <div role="cell" className="min-w-0 px-2">
                  <TagPicker
                    target={row}
                    tags={p.tags}
                    tagById={tagById}
                    onToggle={(tagId, on) => p.onToggleTag(row.id, tagId, on)}
                  />
                </div>
                <div role="cell" className="min-w-0 px-2">
                  <ShowPills tagIds={row.tagIds} shows={p.shows} compact max={2} />
                </div>
                <div role="cell" className="min-w-0 px-2">
                  <AssignPicker
                    target={row}
                    members={p.members}
                    meId={p.meId}
                    nameOf={p.nameOf}
                    admin={admin}
                    onAssign={(userId) => p.onAssign(row.id, userId)}
                    onUnassign={(userId) => p.onUnassign(row.id, userId)}
                  />
                </div>
                <div role="cell" className="truncate px-2 text-slate-700">
                  {next ? formatSlot(next.plannedAt) : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
