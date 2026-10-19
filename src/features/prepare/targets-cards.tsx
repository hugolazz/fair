import { CalendarClock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import { Assignees, PriorityBadge, TagChip } from './atoms'
import { formatSlot } from './lib/format'
import type { ListProps } from './targets-table'
import { useVirtualRows } from './use-virtual-rows'

// Contenu : nom, stand, tags, assignés (≈ 128 px avec les marges) + 8 px d'espacement entre cartes.
const CARD_HEIGHT = 168

type Props = ListProps & { selectMode: boolean; tags: Tag[] }

/** Liste en cartes (mobile) : grosse police, cibles tactiles de 44 px, sélection en mode dédié. */
export function TargetsCards(p: Props) {
  const { t } = useTranslation('prepare')
  const { ref, onScroll, start, end, totalHeight, offsetTop } = useVirtualRows(
    p.rows.length,
    CARD_HEIGHT,
    4,
    { window: true }, // la page entière défile : le titre et les filtres montent avec la liste
  )
  const tagById = new Map(p.tags.map((tag) => [tag.id, tag]))

  return (
    <div ref={ref} onScroll={onScroll} role="list" aria-label={t('title')}>
      <div style={{ height: totalHeight }}>
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {p.rows.slice(start, end).map((row) => {
            const isSelected = p.selected.has(row.id)
            const next = row.meetings[0]
            return (
              <div key={row.id} role="listitem" style={{ height: CARD_HEIGHT }} className="pb-2">
                <div
                  className={cn(
                    'flex h-full items-stretch gap-1 rounded-3xl border bg-white',
                    isSelected ? 'border-brand-600 bg-brand-50' : 'border-slate-200',
                  )}
                >
                  {p.selectMode ? (
                    <label className="flex w-12 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        className="size-6"
                        aria-label={t('select.row', { name: row.name })}
                        checked={isSelected}
                        onChange={() => p.onToggle(row.id, false)}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => (p.selectMode ? p.onToggle(row.id, false) : p.onOpen(row.id))}
                    className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2 text-left"
                  >
                    <span className="flex items-center gap-3">
                      <PriorityBadge priority={row.priority} size="lg" />
                      <span className="min-w-0 flex-1 truncate text-base font-semibold">
                        {row.name}
                      </span>
                    </span>
                    <span className="shrink-0 truncate text-sm leading-5 text-slate-700">
                      {[row.stand && t('sheet.stand', { stand: row.stand }), row.industry]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <span className="flex min-h-6 shrink-0 items-center gap-1 overflow-hidden">
                      {row.tagIds.slice(0, 2).map((id) => {
                        const tag = tagById.get(id)
                        return tag ? <TagChip key={id} tag={tag} /> : null
                      })}
                    </span>
                    <span className="flex items-center justify-between gap-2 text-sm text-slate-700">
                      <Assignees target={row} nameOf={p.nameOf} meId={p.meId} compact />
                      {next ? (
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <CalendarClock aria-hidden className="size-4" />
                          {formatSlot(next.plannedAt)}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
