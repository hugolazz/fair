import { Check, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Tag } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import { showAbbrev, showsOf, showTiming } from './lib/shows'

/**
 * Un salon où l'entreprise était (coche, pastille pleine) ou sera (horloge, pastille en pointillés). Le libellé est
 * toujours écrit et le passé / futur se lit aussi à la forme : jamais à la couleur seule.
 */
export function ShowPill({ tag, compact = false }: { tag: Tag; compact?: boolean }) {
  const { t } = useTranslation('prepare')
  const timing = showTiming(tag.label)
  const Icon = timing === 'past' ? Check : timing === 'upcoming' ? Clock : null
  return (
    <span
      className={cn(
        'inline-flex max-w-full min-w-0 shrink items-center gap-1 rounded-full border font-medium whitespace-nowrap',
        compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]',
        timing === 'upcoming' ? 'border-dashed' : 'border-transparent',
      )}
      style={{
        color: tag.color,
        backgroundColor:
          timing === 'upcoming' ? 'transparent' : `color-mix(in srgb, ${tag.color} 14%, white)`,
        borderColor: timing === 'upcoming' ? tag.color : undefined,
      }}
      title={compact ? tag.label : undefined}
      data-show-pill=""
    >
      {Icon ? <Icon aria-hidden className="size-3.5 shrink-0" /> : null}
      {compact ? (
        <>
          <span aria-hidden className="truncate">
            {showAbbrev(tag.label)}
          </span>
          <span className="sr-only">{tag.label}</span>
        </>
      ) : (
        <span className="truncate">{tag.label}</span>
      )}
      {timing ? (
        <span className="sr-only">{timing === 'past' ? t('shows.past') : t('shows.upcoming')}</span>
      ) : null}
    </span>
  )
}

/** Les salons d'une entreprise ; `max` limite le nombre de pastilles affichées (le reste devient « +N »). */
export function ShowPills({
  tagIds,
  shows,
  compact = false,
  max,
}: {
  tagIds: readonly string[]
  shows: readonly Tag[]
  compact?: boolean
  max?: number
}) {
  const { t } = useTranslation('prepare')
  const list = showsOf(tagIds, shows)
  if (list.length === 0) return null
  const shown = max === undefined ? list : list.slice(0, max)
  const hidden = list.slice(shown.length)
  return (
    <span
      className={cn(
        'flex min-w-0 items-center',
        compact ? 'gap-1 overflow-hidden' : 'flex-wrap gap-2',
      )}
    >
      {shown.map((tag) => (
        <ShowPill key={tag.id} tag={tag} compact={compact} />
      ))}
      {hidden.length > 0 ? (
        <span
          className="shrink-0 text-xs font-medium whitespace-nowrap text-slate-600"
          title={hidden.map((tag) => tag.label).join(', ')}
        >
          {t('shows.more', { count: hidden.length })}
        </span>
      ) : null}
    </span>
  )
}
