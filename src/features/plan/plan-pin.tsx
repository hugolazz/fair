import { Navigation, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import type { PinView } from './lib/pins'

// Les pins sont posés sur une image de plan (le plus souvent blanche) : leurs couleurs sont fixes, avec un double
// contour (sombre + blanc) qui reste lisible sur n'importe quel fond. Priorité = couleur ET lettre : jamais la
// couleur seule.

const PRIORITY_COLORS = {
  A: { bg: '#dc2626', fg: '#ffffff' },
  B: { bg: '#f59e0b', fg: '#111827' },
  C: { bg: '#1d4ed8', fg: '#ffffff' },
} as const
const NO_PRIORITY = { bg: '#ffffff', fg: '#111827' }
const STAND_ONLY = { bg: '#475569', fg: '#ffffff' }

const OUTLINE = '0 0 0 2px #0f172a, 0 0 0 4px #ffffff, 0 2px 6px 4px rgba(15, 23, 42, 0.25)'

type PinMarkerProps = {
  pin: PinView
  selected?: boolean
  onPress?: (pin: PinView) => void
}

/** Un stand sur le plan : bouton de 44 px minimum, nom visible une fois assez zoomé. */
export function PinMarker({ pin, selected = false, onPress }: PinMarkerProps) {
  const { t } = useTranslation('plan')
  const { t: tp } = useTranslation('prepare')
  const colors = pin.targetId
    ? pin.priority
      ? PRIORITY_COLORS[pin.priority]
      : NO_PRIORITY
    : STAND_ONLY
  const letter = pin.targetId ? (pin.priority ?? '–') : pin.stand.slice(0, 4)
  const aria = [
    pin.name,
    pin.targetId && pin.stand ? t('pin.stand', { stand: pin.stand }) : null,
    pin.targetId ? (pin.priority ? tp(`priority.${pin.priority}`) : tp('priority.none')) : null,
    pin.suggested ? t('pin.suggested') : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      data-pin
      data-selected={selected || undefined}
      aria-label={aria}
      aria-current={selected || undefined}
      onClick={() => onPress?.(pin)}
      className="group pointer-events-auto absolute top-0 left-0 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-offset-0"
    >
      {selected ? (
        <span
          aria-hidden
          className="absolute size-11 rounded-full bg-sky-500/40 motion-safe:animate-ping"
        />
      ) : null}
      <span
        aria-hidden
        className={cn(
          'relative flex size-8 items-center justify-center text-sm leading-none font-bold',
          pin.targetId ? 'rounded-full' : 'rounded-md text-xs',
          pin.suggested && 'border-2 border-dashed border-slate-900',
          selected && 'scale-125',
        )}
        style={{ background: colors.bg, color: colors.fg, boxShadow: OUTLINE }}
      >
        {letter}
      </span>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 left-full ml-2 max-w-44 -translate-y-1/2 truncate rounded bg-white px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap text-slate-900 shadow ring-1 ring-slate-900/30',
          selected ? 'block' : 'hidden group-data-[zoom=near]/plan:block',
        )}
      >
        {pin.name}
        {pin.targetId && pin.stand ? ` · ${pin.stand}` : ''}
      </span>
    </button>
  )
}

/** « Je suis ici » : point bleu avec icône et étiquette (jamais la couleur seule). */
export function HereMarker() {
  const { t } = useTranslation('plan')
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2"
    >
      <span
        className="relative flex size-10 items-center justify-center rounded-full text-white"
        style={{
          background: '#0369a1',
          boxShadow: '0 0 0 3px #ffffff, 0 2px 8px 3px rgba(2, 6, 23, 0.35)',
        }}
      >
        <span className="absolute inset-0 rounded-full bg-sky-400/50 motion-safe:animate-ping" />
        <Navigation className="relative size-5" />
      </span>
      <span className="absolute top-full left-1/2 mt-2 -translate-x-1/2 rounded-full bg-sky-800 px-2 py-0.5 text-xs font-bold whitespace-nowrap text-white shadow">
        {t('here.marker')}
      </span>
    </div>
  )
}

/** Emplacement du futur pin : cercle en pointillés. */
export function DraftMarker() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-dashed border-slate-900 bg-white/90 text-slate-900 motion-safe:animate-pulse"
      style={{ boxShadow: '0 0 0 2px #ffffff' }}
    >
      <Plus className="size-5" strokeWidth={3} />
    </span>
  )
}

/** Légende : ce que veulent dire les lettres et les couleurs. */
export function PlanLegend({ className }: { className?: string }) {
  const { t } = useTranslation('plan')
  const { t: tp } = useTranslation('prepare')
  const sample = (bg: string, fg: string, text: string, round = true) => (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-6 items-center justify-center text-xs font-bold',
        round ? 'rounded-full' : 'rounded',
      )}
      style={{ background: bg, color: fg, boxShadow: '0 0 0 1px #0f172a' }}
    >
      {text}
    </span>
  )
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm', className)}>
      {(['A', 'B', 'C'] as const).map((p) => (
        <li key={p} className="flex items-center gap-1.5">
          {sample(PRIORITY_COLORS[p].bg, PRIORITY_COLORS[p].fg, p)}
          {tp(`priority.${p}`)}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        {sample(NO_PRIORITY.bg, NO_PRIORITY.fg, '–')}
        {tp('priority.none')}
      </li>
      <li className="flex items-center gap-1.5">
        {sample(STAND_ONLY.bg, STAND_ONLY.fg, 'B12', false)}
        {t('legend.standOnly')}
      </li>
    </ul>
  )
}
