import { CheckSquare, Plus, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Loading } from '@/components/page-states'
import { ImportTemplateButton } from '@/components/import-template-button'
import { Button } from '@/components/ui/button'
import { useCan } from '@/features/auth-team/roles'
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
import { useRemoveFlow } from './use-remove-flow'
import { useTargets } from './use-targets'

/** Préparation du salon : tableau des participants (desktop) / cartes (mobile), filtres, actions en masse, fiche. */
export default function PreparePage() {
  const { t } = useTranslation('prepare')
  const { t: tm } = useTranslation('manual')
  const canImport = useCan('import_participants')
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
    // Un salon ou un tag supprimé ne laisse pas de filtre fantôme qui viderait la liste.
    const live = new Set([...api.tags, ...api.shows].map((x) => x.id))
    const active = {
      ...filters,
      tagIds: filters.tagIds.filter((id) => live.has(id)),
      showIds: filters.showIds.filter((id) => live.has(id)),
    }
    const sorted = sortTargets(filterTargets(api.targets ?? [], active), sort, api.memberName)
    if (!pinned) return sorted
    const byId = new Map((api.targets ?? []).map((x) => [x.id, x]))
    const kept = pinned.flatMap((id) => {
      const target = byId.get(id)
      return target ? [target] : []
    })
    const known = new Set(pinned)
    return [...kept, ...sorted.filter((x) => !known.has(x.id))]
  }, [api.targets, api.tags, api.shows, filters, sort, api.memberName, pinned])
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
  const remove = useRemoveFlow(api, api.targets, (count) => {
    setNotice(t('remove.done', { count }))
    clear()
  })

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
  const noticeBar = notice ? (
    <p
      role="status"
      className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950"
    >
      {notice}
      <Button variant="ghost" className="min-h-9" onClick={() => setNotice(undefined)}>
        {t('errors.dismiss')}
      </Button>
    </p>
  ) : null

  const total = api.targets?.length ?? 0
  if (total === 0) {
    return (
      <>
        {noticeBar}
        <EmptyState
          icon={<Upload className="size-10" />}
          title={t('title')}
          body={t('filters.none')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {canImport ? (
                <Button asChild>
                  <Link to="../import">{t('import')}</Link>
                </Button>
              ) : null}
              <Button variant={canImport ? 'secondary' : 'primary'} onClick={() => setAdding(true)}>
                <Plus aria-hidden className="size-4" />
                {tm('company.open')}
              </Button>
              <ImportTemplateButton variant="secondary" />
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
    shows: api.shows,
    selected,
    openId,
    meId,
    nameOf: api.memberName,
    onToggle,
    onOpen: setOpenId,
  }

  return (
    // Sur bureau, filtres et tableau débordent de la largeur de lecture, centrés sur la page : le bandeau du salon
    // (retour, statut, titre, onglets) garde ainsi la même place d'un onglet à l'autre.
    <div className="flex flex-col gap-3 md:relative md:left-1/2 md:w-[min(calc(100vw-5rem),1680px)] md:-translate-x-1/2">
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

      {noticeBar}

      {/* Mobile : une seule rangée de boutons-icônes (ajouter, rechercher, filtres, sélectionner). */}
      <FilterBar
        filters={filters}
        onChange={changeFilters}
        tags={api.tags}
        shows={api.shows}
        members={api.members}
        meId={meId}
        total={total}
        shown={rows.length}
        collapsible={!isDesktop}
        desktopAction={
          <Button variant="secondary" className="min-h-9" onClick={() => setAdding(true)}>
            <Plus aria-hidden className="size-4" />
            {tm('company.open')}
          </Button>
        }
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
          onUnassign={(id, userId) => void api.actions.unassign([id], userId)}
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
          onTag={(tagId) => void api.actions.toggleTag(ids, tagId, true)}
          onAssign={(userId) => request(ids, userId)}
          onRemove={() => remove.request(ids)}
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
      {remove.dialog}
      {addDialog}
    </div>
  )
}
