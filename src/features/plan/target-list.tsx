import { MapPin, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Target } from '@/db/schemas/prepare'
import { PriorityBadge } from '@/features/prepare/atoms'
import { useVirtualRows } from '@/features/prepare/use-virtual-rows'
import { cn } from '@/lib/cn'
import { rankTargets } from './lib/pins'

const ROW = 56

type Props = {
  rows: Target[]
  /** Participations déjà placées sur le plan. */
  placed: Set<string>
  /** Numéro de stand saisi : les entreprises au stand correspondant passent en tête. */
  standLabel?: string
  onPick: (row: Target) => void
  /** Texte accessible de l'action d'une ligne (« Placer Carrefour »). */
  pickLabel: (row: Target) => string
  /** Ligne mise en évidence (entreprise « armée » pour le prochain clic sur le plan). */
  activeId?: string | null
  autoFocus?: boolean
  className?: string
}

/**
 * Recherche + liste fenêtrée des entreprises du salon (5 000 lignes sans ralentir). Les non placées d'abord ;
 * Entrée dans la recherche choisit la première ligne : placer un stand se fait au clavier sans quitter le champ.
 */
export function TargetList({
  rows,
  placed,
  standLabel,
  onPick,
  pickLabel,
  activeId,
  autoFocus,
  className,
}: Props) {
  const { t } = useTranslation('plan')
  const [query, setQuery] = useState('')
  const list = useMemo(
    () => rankTargets(rows, { query, placed, ...(standLabel ? { standLabel } : {}) }),
    [rows, query, placed, standLabel],
  )
  const { ref, onScroll, start, end, totalHeight, offsetTop } = useVirtualRows(list.length, ROW, 6)

  return (
    <div className={cn('flex min-h-0 flex-col gap-2', className)}>
      <label className="relative block">
        <span className="sr-only">{t('list.search')}</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-600"
        />
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && list[0]) {
              e.preventDefault()
              onPick(list[0])
            }
          }}
          placeholder={t('list.search')}
          autoComplete="off"
          enterKeyHint="go"
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 text-sm"
        />
      </label>
      {list.length === 0 ? (
        <p
          role="status"
          className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-700"
        >
          {rows.length === 0 ? t('list.noTargets') : t('list.noMatch')}
        </p>
      ) : (
        <div
          ref={ref}
          onScroll={onScroll}
          role="list"
          aria-label={t('list.label')}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div style={{ height: totalHeight }}>
            <div style={{ transform: `translateY(${offsetTop}px)` }}>
              {list.slice(start, end).map((row) => {
                const isPlaced = placed.has(row.id)
                return (
                  <div key={row.id} role="listitem" style={{ height: ROW }} className="pb-1">
                    <button
                      type="button"
                      aria-label={pickLabel(row)}
                      aria-pressed={activeId === undefined ? undefined : activeId === row.id}
                      onClick={() => onPick(row)}
                      className={cn(
                        'flex h-full w-full items-center gap-2 rounded-lg border px-2 text-left hover:bg-slate-100',
                        activeId === row.id
                          ? 'border-brand-600 bg-brand-50 ring-brand-600 ring-2'
                          : 'border-slate-200 bg-white',
                      )}
                    >
                      <PriorityBadge priority={row.priority} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{row.name}</span>
                        <span className="block truncate text-xs text-slate-700">
                          {[row.stand && t('list.stand', { stand: row.stand }), row.industry]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      {isPlaced ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                          <MapPin aria-hidden className="size-3" />
                          {t('list.placed')}
                        </span>
                      ) : null}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
