import { Crosshair, LocateFixed, Maximize, Minus, Plus, X } from 'lucide-react'
import type { RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import type { PinView } from './lib/pins'
import type { Point } from './lib/viewport'
import { DraftMarker, HereMarker, PinMarker } from './plan-pin'
import { PinAnchor, type PlanViewerHandle } from './plan-viewer'
import type { HereMode, HerePosition } from './use-here-mode'

type LayersProps = {
  pins: PinView[]
  selectedId?: string | null
  onPress?: (pin: PinView) => void
  here?: HerePosition
  /** Emplacement du pin en cours de création (édition). */
  draft?: Point | null
}

/** Pins, position « je suis ici » et emplacement en cours de pose, dans la couche d'ancrage du plan. */
export function PlanLayers({ pins, selectedId, onPress, here, draft }: LayersProps) {
  return (
    <>
      {pins.map((pin) => (
        <PinAnchor key={pin.id} x={pin.x} y={pin.y} zIndex={pin.id === selectedId ? 30 : 10}>
          <PinMarker pin={pin} selected={pin.id === selectedId} onPress={onPress} />
        </PinAnchor>
      ))}
      {here ? (
        <PinAnchor x={here.x} y={here.y} zIndex={40}>
          <HereMarker />
        </PinAnchor>
      ) : null}
      {draft ? (
        <PinAnchor x={draft.x} y={draft.y} zIndex={50}>
          <DraftMarker />
        </PinAnchor>
      ) : null}
    </>
  )
}

type ControlsProps = {
  viewer: RefObject<PlanViewerHandle | null>
  large?: boolean
  className?: string
}

/** Zoom avant / arrière / tout le plan : l'alternative visible au pincement et à la molette. */
export function ZoomControls({ viewer, large = false, className }: ControlsProps) {
  const { t } = useTranslation('plan')
  const btn = cn(
    'pointer-events-auto inline-flex items-center justify-center rounded-xl border-2 border-slate-300 bg-white text-slate-900 shadow-md active:bg-slate-100',
    large ? 'size-14' : 'size-11',
  )
  return (
    <div
      role="group"
      aria-label={t('controls.group')}
      className={cn('flex flex-col gap-2', className)}
    >
      <button
        type="button"
        className={btn}
        aria-label={t('controls.zoomIn')}
        onClick={() => viewer.current?.zoomBy(1.6)}
      >
        <Plus aria-hidden className="size-6" />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={t('controls.zoomOut')}
        onClick={() => viewer.current?.zoomBy(1 / 1.6)}
      >
        <Minus aria-hidden className="size-6" />
      </button>
      <button
        type="button"
        className={btn}
        aria-label={t('controls.fit')}
        onClick={() => viewer.current?.fit()}
      >
        <Maximize aria-hidden className="size-5" />
      </button>
    </div>
  )
}

type HereBarProps = {
  mode: HereMode
  onCenter: () => void
  large?: boolean
}

/** Boutons « Je suis ici » / « Me centrer », et bandeau d'instruction pendant la pose. */
export function HereBar({ mode, onCenter, large = false }: HereBarProps) {
  const { t } = useTranslation('plan')
  const size = large ? 'min-h-14 px-5 text-lg' : 'min-h-11 px-4 text-sm'
  const base = cn(
    'pointer-events-auto inline-flex items-center gap-2 rounded-full border-2 font-bold shadow-md',
    size,
  )
  if (mode.placing) {
    return (
      <div
        role="status"
        className="pointer-events-auto flex items-center gap-3 rounded-2xl border-2 border-sky-700 bg-white p-2 pl-4 shadow-lg"
      >
        <Crosshair aria-hidden className="size-5 shrink-0 text-sky-700" />
        <span className="text-base font-semibold">{t('here.placing')}</span>
        {mode.has ? (
          <button
            type="button"
            onClick={mode.clear}
            className="min-h-11 rounded-lg px-3 text-sm font-semibold underline"
          >
            {t('here.clear')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={mode.cancel}
          aria-label={t('here.cancel')}
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-slate-100"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
    )
  }
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={mode.begin}
        className={cn(base, 'border-sky-800 bg-sky-800 text-white active:bg-sky-900')}
      >
        <LocateFixed aria-hidden className="size-5" />
        {mode.has ? t('here.move') : t('here.button')}
      </button>
      {mode.has ? (
        <button
          type="button"
          onClick={onCenter}
          className={cn(base, 'border-slate-300 bg-white text-slate-900 active:bg-slate-100')}
        >
          {t('here.center')}
        </button>
      ) : null}
    </div>
  )
}
