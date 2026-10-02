import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PRIORITIES, type Priority, type Tag, type Target } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'

const PRIORITY_STYLE: Record<Priority, string> = {
  A: 'bg-red-100 text-red-900 border-red-300',
  B: 'bg-amber-100 text-amber-900 border-amber-300',
  C: 'bg-slate-200 text-slate-800 border-slate-300',
}

/** Priorité : la lettre est toujours affichée (jamais la couleur seule). */
export function PriorityBadge({
  priority,
  size = 'md',
}: {
  priority: Priority | null
  size?: 'md' | 'lg'
}) {
  const { t } = useTranslation('prepare')
  const box = size === 'lg' ? 'size-9 text-base' : 'size-7 text-sm'
  return priority ? (
    <span
      title={t(`priority.${priority}`)}
      aria-label={t(`priority.${priority}`)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border font-bold',
        box,
        PRIORITY_STYLE[priority],
      )}
    >
      {priority}
    </span>
  ) : (
    <span
      title={t('priority.none')}
      aria-label={t('priority.none')}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md border border-dashed border-slate-400 text-slate-500',
        box,
      )}
    >
      –
    </span>
  )
}

/** Choix A / B / C / aucune, en boutons radio (cibles tactiles de 44 px). */
export function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority | null
  onChange: (p: Priority | null) => void
}) {
  const { t } = useTranslation('prepare')
  const options: (Priority | null)[] = [...PRIORITIES, null]
  return (
    <div role="radiogroup" aria-label={t('priority.label')} className="flex gap-2">
      {options.map((p) => (
        <label
          key={p ?? 'none'}
          className={cn(
            'flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
            value === p
              ? 'border-brand-600 bg-brand-50 text-brand-900 ring-brand-600 ring-1'
              : 'border-slate-300 bg-white',
          )}
        >
          <input
            type="radio"
            className="sr-only"
            name="priority"
            checked={value === p}
            onChange={() => onChange(p)}
          />
          {p ?? t('priority.none')}
        </label>
      ))}
    </div>
  )
}

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium whitespace-nowrap text-slate-800">
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
      {tag.label}
    </span>
  )
}

/** Commerciaux assignés (initiales + nom) avec alerte quand plusieurs visent la même entreprise. */
export function Assignees({
  target,
  nameOf,
  meId,
  compact = false,
}: {
  target: Target
  nameOf: (userId: string) => string
  meId: string
  compact?: boolean
}) {
  const { t } = useTranslation('prepare')
  if (target.assigneeIds.length === 0)
    return <span className="text-slate-500">{compact ? '–' : t('assign.unassigned')}</span>
  const contested = target.assigneeIds.length > 1
  const names = target.assigneeIds.map((u) => (u === meId ? t('assign.me') : nameOf(u)))
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        contested && 'rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-900',
      )}
      title={
        contested
          ? t('assign.contested', { count: names.length, names: names.join(', ') })
          : names.join(', ')
      }
    >
      {contested ? <Users aria-hidden className="size-4 shrink-0" /> : null}
      <span className="truncate">
        {contested && compact
          ? t('assign.contestedShort', { count: names.length })
          : names.join(', ')}
      </span>
    </span>
  )
}
