import { CheckSquare, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { useReadySession } from '@/features/auth-team/session'
import { useEvent } from '@/features/events/event-context'
import { useMediaQuery } from '@/lib/use-media-query'
import { BulkBar } from './bulk-bar'
import { FilterBar } from './filter-bar'
import { emptyFilters, filterTargets, type Filters } from './lib/filter'
import { rangeSelect } from './lib/misc'
import { sortTargets, type Sort, type SortKey } from './lib/sort'
import { TargetSheet } from './target-sheet'
import { TargetsCards } from './targets-cards'
import { TargetsTable } from './targets-table'
import { useAssignFlow } from './use-assign-flow'
import { useTargets } from './use-targets'

/** Préparation du salon : tableau des participants (desktop) / cartes (mobile), filtres, actions en masse, fiche. */
export default function PreparePage() {
  const { t } = useTranslation('prepare')
  const { event } = useEvent()
  const { session, membership } = useReadySession()
  const meId = session.user.id
  const api = useTargets(event.id, membership.teamId)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [sort, setSort] = useState<Sort>({ key: 'priority', dir: 'asc' })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [selectMode, setSelectMode] = useState(false)
  const [openId, setOpenId] = useState<string>()
  const anchor = useRef<string>(undefined)
  const { request, dialog } = useAssignFlow(api, api.targets)

  const rows = useMemo(
    () => sortTargets(filterTargets(api.targets ?? [], filters), sort, api.memberName),
    [api.targets, filters, sort, api.memberName],
  )
  const openTarget = api.targets?.find((x) => x.id === openId)

  function onToggle(id: string, shift: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (shift && anchor.current) {
        for (const x of rangeSelect(
          rows.map((r) => r.id),
          anchor.current,
          id,
        ))
          next.add(x)
      } else if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    anchor.current = id
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))
  const ids = [...selected]
  const clear = () => {
    setSelected(new Set())
    setSelectMode(false)
  }

  if (api.loading) return <Loading />
  if (api.error) return <ErrorState message={t('errors.load')} onRetry={api.reload} />
  const total = api.targets?.length ?? 0
  if (total === 0) {
    return (
      <EmptyState
        icon={<Upload className="size-10" />}
        title={t('title')}
        body={t('filters.none')}
        action={
          <Button asChild>
            <Link to="../import">{t('import')}</Link>
          </Button>
        }
      />
    )
  }

  const common = {
    rows,
    tags: api.tags,
    selected,
    openId,
    meId,
    nameOf: api.memberName,
    onToggle,
    onOpen: setOpenId,
  }

  return (
    <div className="flex flex-col gap-3">
      {api.actionError ? (
        <p
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-900"
        >
          {t('errors.save')}
          <Button variant="ghost" className="min-h-9" onClick={api.dismissActionError}>
            {t('errors.dismiss')}
          </Button>
        </p>
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <FilterBar
            filters={filters}
            onChange={setFilters}
            tags={api.tags}
            members={api.members}
            meId={meId}
            total={total}
            shown={rows.length}
            collapsible={!isDesktop}
          />
        </div>
        {!isDesktop ? (
          <Button
            variant={selectMode ? 'primary' : 'secondary'}
            aria-pressed={selectMode}
            onClick={() => (selectMode ? clear() : setSelectMode(true))}
          >
            <CheckSquare aria-hidden className="size-4" />
            {selectMode ? t('select.done') : t('select.mode')}
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p
          role="status"
          className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-700"
        >
          {t('filters.empty')}
        </p>
      ) : isDesktop ? (
        <TargetsTable
          {...common}
          sort={sort}
          onSort={(key: SortKey) =>
            setSort((s) =>
              s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
            )
          }
          allSelected={allSelected}
          someSelected={selected.size > 0}
          onToggleAll={toggleAll}
          onPriority={(id, p) => void api.actions.setPriority([id], p)}
          onGoal={(id, g) => void api.actions.setGoal([id], g)}
        />
      ) : (
        <TargetsCards {...common} selectMode={selectMode} />
      )}

      {selected.size > 0 ? (
        <BulkBar
          count={selected.size}
          tags={api.tags}
          members={api.members}
          meId={meId}
          onPriority={(p) => void api.actions.setPriority(ids, p)}
          onGoal={(g) => void api.actions.setGoal(ids, g)}
          onTag={(tagId, on) => void api.actions.toggleTag(ids, tagId, on)}
          onAssign={(userId) => request(ids, userId)}
          onUnassign={(userId) => void api.actions.unassign(ids, userId)}
          onClear={clear}
        />
      ) : null}

      <TargetSheet
        target={openTarget}
        api={api}
        meId={meId}
        eventName={event.name}
        eventDate={event.starts_on ?? ''}
        onClose={() => setOpenId(undefined)}
      />
      {dialog}
    </div>
  )
}
