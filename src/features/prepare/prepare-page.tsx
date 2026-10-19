import { CheckSquare, Plus, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { useIsAdmin } from '@/features/auth-team/roles'
import { useReadySession } from '@/features/auth-team/session'
import { AddCompanyDialog } from '@/features/manual-entry/add-company-dialog'
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
  const { t: tm } = useTranslation('manual')
  const admin = useIsAdmin()
  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string>()
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

  // Après un changement de priorité, la liste garde son ordre : sinon la ligne saute à sa nouvelle place (ou sort du
  // filtre) et on la perd de vue. Le tri et les filtres reprennent la main dès qu'on les touche.
  const [pinned, setPinned] = useState<string[]>()
  const rows = useMemo(() => {
    const sorted = sortTargets(filterTargets(api.targets ?? [], filters), sort, api.memberName)
    if (!pinned) return sorted
    const byId = new Map((api.targets ?? []).map((x) => [x.id, x]))
    const kept = pinned.flatMap((id) => {
      const target = byId.get(id)
      return target ? [target] : []
    })
    const known = new Set(pinned)
    return [...kept, ...sorted.filter((x) => !known.has(x.id))]
  }, [api.targets, filters, sort, api.memberName, pinned])
  const keepOrder = () => setPinned((prev) => prev ?? rows.map((r) => r.id))
  const changeFilters = (next: Filters) => {
    setPinned(undefined)
    setFilters(next)
  }
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

  const addDialog = (
    <AddCompanyDialog
      eventId={event.id}
      open={adding}
      onOpenChange={setAdding}
      onAdded={(result, name) => {
        setNotice(tm(`company.${result.status}`, { name }))
        api.reload()
        // La fiche s'ouvre dès que la liste rechargée contient la nouvelle cible.
        if (result.targetId) setOpenId(result.targetId)
      }}
    />
  )

  if (api.loading) return <Loading />
  if (api.error) return <ErrorState message={t('errors.load')} onRetry={api.reload} />
  const total = api.targets?.length ?? 0
  if (total === 0) {
    return (
      <>
        <EmptyState
          icon={<Upload className="size-10" />}
          title={t('title')}
          body={t('filters.none')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {admin ? (
                <Button asChild>
                  <Link to="../import">{t('import')}</Link>
                </Button>
              ) : null}
              <Button variant={admin ? 'secondary' : 'primary'} onClick={() => setAdding(true)}>
                <Plus aria-hidden className="size-4" />
                {tm('company.open')}
              </Button>
            </div>
          }
        />
        {addDialog}
      </>
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

      {isDesktop ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" />
            {tm('company.open')}
          </Button>
        </div>
      ) : null}

      {/* Mobile : une seule rangée de boutons-icônes (ajouter, rechercher, filtres, sélectionner). */}
      <FilterBar
        filters={filters}
        onChange={changeFilters}
        tags={api.tags}
        members={api.members}
        meId={meId}
        total={total}
        shown={rows.length}
        collapsible={!isDesktop}
        before={
          <Button
            variant="secondary"
            className="size-11 shrink-0 px-0"
            aria-label={tm('company.open')}
            onClick={() => setAdding(true)}
          >
            <Plus aria-hidden className="size-5" />
          </Button>
        }
        after={
          <Button
            variant={selectMode ? 'primary' : 'secondary'}
            className="size-11 shrink-0 px-0"
            aria-pressed={selectMode}
            aria-label={selectMode ? t('select.done') : t('select.mode')}
            onClick={() => (selectMode ? clear() : setSelectMode(true))}
          >
            <CheckSquare aria-hidden className="size-5" />
          </Button>
        }
      />

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
          onSort={(key: SortKey) => {
            setPinned(undefined)
            setSort((s) =>
              s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
            )
          }}
          allSelected={allSelected}
          someSelected={selected.size > 0}
          onToggleAll={toggleAll}
          onPriority={(id, p) => {
            keepOrder()
            void api.actions.setPriority([id], p)
          }}
          members={api.members}
          onAssign={(id, userId) => request([id], userId)}
          onToggleTag={(id, tagId, on) => void api.actions.toggleTag([id], tagId, on)}
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
          onPriority={(p) => {
            keepOrder()
            void api.actions.setPriority(ids, p)
          }}
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
      {addDialog}
    </div>
  )
}
