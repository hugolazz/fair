import { ArrowDown, ArrowUp } from 'lucide-react'
import { Fragment, useMemo, type MouseEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PRIORITIES,
  type Priority,
  type Tag,
  type Target,
  type TargetContact,
  type TeamMember,
} from '@/db/schemas/prepare'
import { canPrepareTarget, useCan } from '@/features/auth-team/roles'
import { cn } from '@/lib/cn'
import { AssignPicker } from './assign-picker'
import { Select } from '@/components/ui/select'
import { PriorityBadge } from './atoms'
import { ShowPills } from './show-pills'
import { TagPicker } from './tag-picker'
import {
  gridTemplate,
  minWidthOf,
  tableMinWidth,
  visibleColumns,
  WIDTH_MAX,
  WIDTH_MIN,
  type ColumnKey,
  type ColumnPrefs,
} from './lib/columns'
import { interestOf, newsOf, recontactOf, statusOf } from './lib/column-values'
import { formatSlot } from './lib/format'
import type { Sort, SortKey } from './lib/sort'
import { useColumnDrag } from './use-column-drag'
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
  /** Contact clé (premier contact) de chaque entreprise, par identifiant d'entreprise. */
  keyContacts: Record<string, TargetContact>
  /** Colonne « Actualité » : seulement si l'équipe a activé la case optionnelle, sous l'intitulé qu'elle lui donne. */
  newsEnabled: boolean
  newsTitle: string
  /** Colonnes visibles, leur ordre et leur largeur (« Modifier les colonnes », ou à la souris sur l'en-tête). */
  columns: ColumnPrefs
  onColumnsChange: (next: ColumnPrefs) => void
}

const ROW_HEIGHT = 52
const HEADER_HEIGHT = 48 // en-tête collant (h-12)
// Les colonnes (visibles, largeur) viennent du réglage de l'utilisateur : `lib/columns.ts`.
const GRID = 'grid items-center'

const COLUMNS: { key: SortKey | null; label: ColumnKey }[] = [
  { key: 'priority', label: 'priority' },
  { key: 'name', label: 'company' },
  { key: 'stand', label: 'stand' },
  { key: null, label: 'tags' },
  { key: null, label: 'shows' },
  { key: 'assignee', label: 'assignees' },
  { key: 'meeting', label: 'meeting' },
  { key: 'industry', label: 'industry' },
  { key: 'country', label: 'country' },
  { key: 'city', label: 'city' },
  { key: null, label: 'website' },
  { key: null, label: 'history' },
  { key: 'contacts', label: 'contacts' },
  { key: null, label: 'keyName' },
  { key: null, label: 'keyJob' },
  { key: null, label: 'keyEmail' },
  { key: null, label: 'keyPhone' },
  { key: null, label: 'keyLinkedin' },
  { key: 'interest', label: 'interest' },
  { key: null, label: 'status' },
  { key: null, label: 'recontact' },
  { key: null, label: 'news' },
]

/** Tableau dense (desktop) : tri par colonne, sélection (Maj pour une plage), édition rapide de la priorité et de l'objectif. */
export function TargetsTable(p: Props) {
  const { t } = useTranslation('prepare')
  const canPrepareAll = useCan('prepare_all_targets')
  const canAssignOthers = useCan('assign_others')
  const tagById = useMemo(() => new Map(p.tags.map((tag) => [tag.id, tag])), [p.tags])
  const {
    prefs,
    measured,
    headerRef,
    dragging,
    startResize,
    onHandleKey,
    resetWidth,
    startReorder,
    consumeClick,
  } = useColumnDrag(p.columns, p.onColumnsChange)
  const exclude: ColumnKey[] = p.newsEnabled ? [] : ['news']
  const visible = visibleColumns(prefs, exclude)
  const template = gridTemplate(prefs, exclude)
  const minWidth = tableMinWidth(prefs, exclude)
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
        ref={headerRef}
        role="row"
        style={{ gridTemplateColumns: template, minWidth }}
        className={cn(
          GRID,
          'sticky top-0 z-10 h-12 bg-slate-50 px-2 text-[13px] font-medium text-slate-600 shadow-[0_1px_0_0_var(--color-slate-200)]',
        )}
      >
        <div role="columnheader" className="flex justify-center">
          <input
            type="checkbox"
            className="size-5"
            data-no-drag
            aria-label={t('select.all')}
            checked={p.allSelected}
            ref={(el) => {
              if (el) el.indeterminate = p.someSelected && !p.allSelected
            }}
            onChange={p.onToggleAll}
          />
        </div>
        {visible.map((key, index) => {
          const c = COLUMNS.find((x) => x.label === key)!
          const active = c.key !== null && p.sort.key === c.key
          const label = key === 'news' ? p.newsTitle : t(`columns.${c.label}`)
          const moving = dragging?.key === key
          const dropBefore = dragging !== null && dragging.before === key && !moving
          const dropAfter =
            dragging !== null && dragging.before === null && index === visible.length - 1
          const width = prefs.widths[key]
          return (
            <div
              key={key}
              data-col={key}
              role="columnheader"
              aria-sort={active ? (p.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
              onPointerDown={(e) => startReorder(e, key)}
              style={
                moving ? { transform: `translateX(${dragging!.dx}px)`, zIndex: 20 } : undefined
              }
              className={cn(
                'relative h-full cursor-grab touch-none px-2 select-none',
                'flex items-center',
                moving && 'cursor-grabbing rounded bg-slate-200/80 opacity-80 shadow-md',
                dropBefore && 'shadow-[inset_3px_0_0_var(--color-brand-text)]',
                dropAfter && 'shadow-[inset_-3px_0_0_var(--color-brand-text)]',
              )}
            >
              {c.key ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!consumeClick()) p.onSort(c.key!)
                  }}
                  className="-mx-1 inline-flex h-8 items-center gap-1 rounded px-1 hover:bg-slate-200"
                  aria-label={t('columns.sortBy', { column: label })}
                >
                  {label}
                  {active ? (
                    p.sort.dir === 'asc' ? (
                      <ArrowUp aria-hidden className="size-3.5" />
                    ) : (
                      <ArrowDown aria-hidden className="size-3.5" />
                    )
                  ) : null}
                </button>
              ) : (
                label
              )}
              {/* Poignée de largeur : tirer pour élargir ou rétrécir, double-clic pour la largeur d'origine. */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t('columnsMenu.resize', { column: label })}
                aria-valuemin={WIDTH_MIN}
                aria-valuemax={WIDTH_MAX}
                aria-valuenow={width ?? measured[key] ?? minWidthOf(key)}
                tabIndex={0}
                data-no-drag
                data-resize={key}
                onPointerDown={(e) => startResize(e, key)}
                onDoubleClick={() => resetWidth(key)}
                onKeyDown={(e) => onHandleKey(e, key)}
                className="group absolute inset-y-0 right-0 flex w-3 cursor-col-resize touch-none items-center justify-center focus-visible:outline-2"
              >
                <span
                  aria-hidden
                  className="h-5 w-px bg-slate-300 transition-colors group-hover:w-0.5 group-hover:bg-slate-500 group-focus-visible:bg-slate-700"
                />
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ height: totalHeight, minWidth }} className="px-2">
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {p.rows.slice(start, end).map((row, i) => {
            const isSelected = p.selected.has(row.id)
            const next = row.meetings[0]
            const kc = p.keyContacts[row.companyId]
            const text = (value: string, extra = '') => (
              <div role="cell" className={cn('truncate px-2', extra)} title={value || undefined}>
                {value}
              </div>
            )
            const interest = interestOf(row)
            const status = statusOf(row)
            const cells: Record<ColumnKey, ReactNode> = {
              industry: text(row.industry),
              country: text(row.country),
              city: text(row.city),
              website: text(row.domain || row.website),
              history: text(row.history.replace(/\s+/g, ' ').trim()),
              contacts: text(row.contactCount ? String(row.contactCount) : '', 'tabular-nums'),
              keyName: text(kc?.name ?? ''),
              keyJob: text(kc?.jobTitle ?? ''),
              keyEmail: text(kc?.email ?? ''),
              keyPhone: text(kc?.phone ?? ''),
              keyLinkedin: text(kc?.linkedin ?? ''),
              interest: text(
                interest === null ? '' : t('history.interestOf', { n: interest }),
                'tabular-nums',
              ),
              status: text(status ? t(`report.status.${status}`) : ''),
              recontact: text(recontactOf(row) ? t('notepad.yes') : ''),
              news: text(newsOf(row) ? t('notepad.yes') : ''),
              priority: (
                <div role="cell" className="px-2">
                  <Select
                    value={row.priority ?? ''}
                    disabled={!canPrepareTarget(canPrepareAll, row.assigneeIds, p.meId)}
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
              ),
              company: (
                <div role="cell" className="min-w-0 px-2">
                  <button
                    type="button"
                    onClick={() => p.onOpen(row.id)}
                    className="max-w-full truncate text-left text-base font-medium hover:underline"
                  >
                    {row.name}
                  </button>
                </div>
              ),
              stand: (
                <div role="cell" className="truncate px-2">
                  {row.stand}
                </div>
              ),
              tags: (
                <div role="cell" className="min-w-0 px-2">
                  <TagPicker
                    target={row}
                    tags={p.tags}
                    tagById={tagById}
                    onToggle={(tagId, on) => p.onToggleTag(row.id, tagId, on)}
                  />
                </div>
              ),
              shows: (
                <div role="cell" className="min-w-0 px-2">
                  <ShowPills tagIds={row.tagIds} shows={p.shows} compact max={2} />
                </div>
              ),
              assignees: (
                <div role="cell" className="min-w-0 px-2">
                  <AssignPicker
                    target={row}
                    members={p.members}
                    meId={p.meId}
                    nameOf={p.nameOf}
                    canAssignOthers={canAssignOthers}
                    onAssign={(userId) => p.onAssign(row.id, userId)}
                    onUnassign={(userId) => p.onUnassign(row.id, userId)}
                  />
                </div>
              ),
              meeting: (
                <div role="cell" className="truncate px-2 text-slate-700">
                  {next ? formatSlot(next.plannedAt) : ''}
                </div>
              ),
            }
            return (
              <div
                key={row.id}
                role="row"
                aria-rowindex={start + i + 2}
                aria-selected={isSelected}
                style={{ height: ROW_HEIGHT, gridTemplateColumns: template }}
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
                  p.openId === row.id && 'outline-brand-text outline-2 -outline-offset-2',
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
                {visible.map((key) => (
                  <Fragment key={key}>{cells[key]}</Fragment>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
