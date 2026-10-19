import { MapPin, Trash2 } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router-dom'
import { ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import {
  addPin,
  deletePlan,
  getPlanImageUrl,
  listPins,
  listPlans,
  movePin,
  removePin,
  restorePin,
  type PlanCtx,
} from '@/db/repositories/plans'
import { listTargets } from '@/db/repositories/targets'
import type { PlanPin } from '@/db/schemas/plan'
import { useIsAdmin } from '@/features/auth-team/roles'
import { useReadySession } from '@/features/auth-team/session'
import { useAsync } from '@/lib/use-async'
import { buildPinViews, placedTargetIds, type PinView } from './lib/pins'
import type { Point } from './lib/viewport'
import { HereBar, PlanLayers, ZoomControls } from './plan-layers'
import { PlanLegend } from './plan-pin'
import { PlanUploader } from './plan-uploader'
import { PlanViewer, type PlanViewerHandle } from './plan-viewer'
import { PinChooser, PinDetails } from './pin-panels'
import { TargetList } from './target-list'
import { useHereMode } from './use-here-mode'
import type { Target } from '@/db/schemas/prepare'

type Last = { kind: 'added' | 'removed'; pinId: string; label: string }
const NO_PINS: PlanPin[] = []

/**
 * Plan du salon : ajouter l'image (PNG, JPEG, WebP ou PDF), poser les stands, les relier aux entreprises.
 * `?target=<id>` (lien « Voir sur le plan » d'une fiche) centre le plan sur le stand de l'entreprise.
 */
export default function PlanPage() {
  const { t } = useTranslation('plan')
  const { t: tc } = useTranslation()
  const { eventId = '' } = useParams()
  const [params] = useSearchParams()
  const focusId = params.get('target')
  const { membership } = useReadySession()
  const admin = useIsAdmin()
  const ctx = useMemo<PlanCtx>(
    () => ({ teamId: membership.teamId, eventId }),
    [membership.teamId, eventId],
  )

  const plans = useAsync(() => listPlans(eventId), [eventId])
  const targets = useAsync(() => listTargets(eventId), [eventId])
  const [chosen, setChosen] = useState<string | null>(null)
  const plan = plans.data?.find((p) => p.id === chosen) ?? plans.data?.[0]
  const pins = useAsync(() => (plan ? listPins(plan.id) : Promise.resolve(NO_PINS)), [plan?.id])
  const image = useAsync(
    () => (plan?.attachmentId ? getPlanImageUrl(plan.attachmentId) : Promise.resolve(null)),
    [plan?.attachmentId],
  )
  const hereMode = useHereMode(plan?.id)
  const viewer = useRef<PlanViewerHandle>(null)

  const [draft, setDraft] = useState<Point | null>(null)
  // `undefined` = on suit la demande « voir sur le plan » ; `null` = rien de sélectionné.
  const [selectedId, setSelectedId] = useState<string | null | undefined>(undefined)
  const [armedId, setArmedId] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [last, setLast] = useState<Last | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState(false)

  const rows = useMemo<Target[]>(() => targets.data ?? [], [targets.data])
  const rawPins = useMemo(
    () => (pins.data ?? NO_PINS).filter((p) => p.floorplanId === plan?.id),
    [pins.data, plan?.id],
  )
  const views = useMemo(() => buildPinViews(rawPins, rows), [rawPins, rows])
  const placed = useMemo(() => placedTargetIds(rawPins), [rawPins])
  const focusPin = focusId ? views.find((p) => p.targetId === focusId) : undefined
  const effectiveSelectedId = selectedId === undefined ? (focusPin?.id ?? null) : selectedId
  const selected = views.find((p) => p.id === effectiveSelectedId)
  const selectedRaw = rawPins.find((p) => p.id === effectiveSelectedId)
  const armed = rows.find((r) => r.id === armedId)

  // « Annuler » reste proposé quelques secondes après un ajout ou une suppression.
  useEffect(() => {
    if (!last) return
    const timer = setTimeout(() => setLast(null), 10_000)
    return () => clearTimeout(timer)
  }, [last])

  if (plans.error) return <ErrorState message={t('errors.load')} onRetry={plans.reload} />
  if (!plans.data || (targets.loading && !targets.data)) return <Loading />
  if (!plan) {
    if (!admin) {
      return (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <h2 className="text-lg font-semibold">{t('empty.title')}</h2>
          <p className="mt-1 text-slate-700">{t('empty.bodyReadOnly')}</p>
        </div>
      )
    }
    return (
      <PlanUploader
        ctx={ctx}
        onCreated={(id) => {
          setChosen(id)
          plans.reload()
        }}
      />
    )
  }

  /** Enregistre une modification ; en cas d'échec, le dit et recharge l'état réel. */
  async function act(run: () => Promise<unknown>) {
    setActionError(false)
    try {
      await run()
    } catch {
      setActionError(true)
    }
    pins.reload()
  }

  const idle = () => {
    setDraft(null)
    setArmedId(null)
    setMoving(null)
    hereMode.cancel()
  }

  async function place(
    point: Point,
    input: { targetId: string | null; standLabel: string | null },
  ) {
    if (!plan) return
    const label = rows.find((r) => r.id === input.targetId)?.name ?? input.standLabel ?? ''
    setSelectedId(null)
    setDraft(null)
    setArmedId(null)
    await act(async () => {
      const pinId = await addPin(ctx, { floorplanId: plan.id, x: point.x, y: point.y, ...input })
      setLast({ kind: 'added', pinId, label })
    })
  }

  const onTap = (p: Point) => {
    if (hereMode.handleTap(p)) return
    if (!admin) {
      setSelectedId(null)
      return
    }
    if (moving) {
      const id = moving
      setMoving(null)
      void act(() => movePin(id, p.x, p.y))
      return
    }
    if (armed) {
      void place(p, { targetId: armed.id, standLabel: null })
      return
    }
    setSelectedId(null)
    setDraft(p)
  }

  const onPress = (pin: PinView) => {
    idle()
    setSelectedId(pin.id)
  }

  const onPickRow = (row: Target) => {
    if (placed.has(row.id)) {
      // Déjà placée : on la retrouve sur le plan.
      const pin = views.find((p) => p.targetId === row.id)
      if (pin) {
        idle()
        setSelectedId(pin.id)
        viewer.current?.focus({ x: pin.x, y: pin.y })
      }
      return
    }
    if (!admin) return
    setDraft(null)
    setSelectedId(null)
    setArmedId(armedId === row.id ? null : row.id)
  }

  const undo = () => {
    if (!last) return
    const { kind, pinId } = last
    setLast(null)
    void act(() => (kind === 'added' ? removePin(pinId) : restorePin(pinId)))
  }

  const crosshair = !!(draft || armed || moving || hereMode.placing)

  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          idle()
          setSelectedId(null)
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        {plans.data.length > 1 ? (
          <label className="flex items-center gap-2 text-sm font-medium">
            {t('select')}
            <Select
              value={plan.id}
              onChange={(e) => {
                setChosen(e.target.value)
                idle()
                setSelectedId(null)
              }}
              className="min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm"
            >
              {plans.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <h2 className="text-lg font-semibold">{plan.name}</h2>
        )}
        <span className="text-sm text-slate-700">
          {t('edit.progress', { placed: placed.size, total: rows.length })}
        </span>
        <div className={admin ? 'ml-auto flex flex-wrap items-start gap-2' : 'hidden'}>
          <PlanUploader
            ctx={ctx}
            variant="button"
            onCreated={(id) => {
              setChosen(id)
              plans.reload()
            }}
          />
          {confirmDelete ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-lg bg-red-50 p-2 text-sm text-red-900"
            >
              {t('edit.deleteConfirm')}
              <Button
                variant="danger"
                className="min-h-9"
                onClick={() => {
                  setConfirmDelete(false)
                  setChosen(null)
                  idle()
                  setSelectedId(null)
                  void deletePlan(plan).then(plans.reload, () => setActionError(true))
                }}
              >
                {t('edit.deletePlan')}
              </Button>
              <Button
                variant="secondary"
                className="min-h-9"
                onClick={() => setConfirmDelete(false)}
              >
                {t('edit.cancel')}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
              <Trash2 aria-hidden className="size-4" />
              {t('edit.deletePlan')}
            </Button>
          )}
        </div>
      </div>

      {pins.error || image.error ? (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-900"
        >
          {t('errors.load')}
          <Button
            variant="secondary"
            className="min-h-9"
            onClick={() => {
              pins.reload()
              image.reload()
            }}
          >
            {tc('actions.retry')}
          </Button>
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {t('edit.saveError')}
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="relative h-[68dvh] min-h-[22rem] overflow-hidden rounded-xl border border-slate-300">
          {image.data ? (
            <PlanViewer
              ref={viewer}
              viewKey={plan.id}
              src={image.data}
              width={plan.width}
              height={plan.height}
              label={t('viewerLabel')}
              focus={
                focusPin && focusId ? { x: focusPin.x, y: focusPin.y, key: focusId } : undefined
              }
              cursor={crosshair ? 'crosshair' : 'grab'}
              onTap={onTap}
              className="absolute inset-0"
            >
              <PlanLayers
                pins={views}
                selectedId={effectiveSelectedId}
                onPress={onPress}
                draft={draft}
                {...(hereMode.here ? { here: hereMode.here } : {})}
              />
            </PlanViewer>
          ) : (
            <p role="status" className="p-6 text-slate-700">
              {image.error ? t('errors.image') : t('upload.processing')}
            </p>
          )}
          <p className="sr-only">{t('keyboardHelp')}</p>
          <ZoomControls viewer={viewer} className="pointer-events-none absolute top-2 right-2" />
          <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-col items-start gap-2">
            {armed ? (
              <Banner onCancel={() => setArmedId(null)}>
                {t('edit.armed', { name: armed.name })}
              </Banner>
            ) : null}
            {moving ? <Banner onCancel={() => setMoving(null)}>{t('edit.moving')}</Banner> : null}
            <HereBar
              mode={hereMode}
              onCenter={() =>
                hereMode.here && viewer.current?.focus({ x: hereMode.here.x, y: hereMode.here.y })
              }
            />
          </div>
        </div>

        <aside className="flex h-[68dvh] min-h-[22rem] flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3">
          {last ? (
            <p
              role="status"
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-100 p-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {t(last.kind === 'added' ? 'edit.added' : 'edit.removed', { name: last.label })}
              </span>
              <Button variant="secondary" className="min-h-9 shrink-0" onClick={undo}>
                {t('edit.undo')}
              </Button>
            </p>
          ) : null}
          {draft ? (
            <PinChooser
              key={`${draft.x}-${draft.y}`}
              rows={rows}
              placed={placed}
              onCancel={() => setDraft(null)}
              onCreate={(input) => void place(draft, input)}
            />
          ) : selected && selectedRaw ? (
            <PinDetails
              key={selected.id}
              pin={selected}
              raw={selectedRaw}
              rows={rows}
              placed={placed}
              onMove={() => setMoving(selected.id)}
              onRemove={() => {
                setLast({ kind: 'removed', pinId: selected.id, label: selected.name })
                setSelectedId(null)
                void act(() => removePin(selected.id))
              }}
              onClose={() => setSelectedId(null)}
              onChanged={pins.reload}
              readOnly={!admin}
            />
          ) : (
            <section className="flex min-h-0 flex-1 flex-col gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                <MapPin aria-hidden className="size-4" />
                {t('edit.companies')}
              </h2>
              {admin ? <p className="text-sm text-slate-700">{t('edit.help')}</p> : null}
              <TargetList
                className="flex-1"
                rows={rows}
                placed={placed}
                activeId={armedId}
                pickLabel={(r) =>
                  t(placed.has(r.id) ? 'edit.show' : 'edit.place', { name: r.name })
                }
                onPick={onPickRow}
              />
            </section>
          )}
        </aside>
      </div>

      <details className="rounded-xl border border-slate-200 bg-white p-3">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          {t('legend.title')}
        </summary>
        <PlanLegend className="pt-2" />
      </details>
    </div>
  )
}

function Banner({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  const { t } = useTranslation('plan')
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-center gap-3 rounded-xl border-2 border-slate-900 bg-white p-2 pl-3 text-sm font-semibold shadow-lg"
    >
      {children}
      <Button variant="secondary" className="min-h-9" onClick={onCancel}>
        {t('edit.cancel')}
      </Button>
    </div>
  )
}
