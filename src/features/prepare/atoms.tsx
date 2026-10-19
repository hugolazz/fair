import { Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PRIORITIES, type Priority, type Tag, type Target } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import { initialsOfName } from '@/lib/person'

/** Le « + » en pointillés : emplacement vide à remplir (assignation, tags). */
export const ADD_DOT =
  'inline-flex size-7 items-center justify-center rounded-full border border-dashed border-[#cfcbbf] text-[11px] font-semibold text-slate-500'

const PRIORITY_STYLE: Record<Priority, string> = {
  A: 'bg-[#fbe9e6] text-[#a8352a]',
  B: 'bg-[#fbf0d9] text-gold-700',
  C: 'bg-[#eeece6] text-slate-600',
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
  const box = size === 'lg' ? 'size-10 text-base' : 'size-8 text-[13px]'
  return priority ? (
    <span
      title={t(`priority.${priority}`)}
      aria-label={t(`priority.${priority}`)}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
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
        'inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-[#cfcbbf] text-slate-500',
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
  disabled = false,
}: {
  value: Priority | null
  onChange: (p: Priority | null) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('prepare')
  const options: (Priority | null)[] = [...PRIORITIES, null]
  return (
    <div role="radiogroup" aria-label={t('priority.label')} className="flex gap-2">
      {options.map((p) => (
        <label
          key={p ?? 'none'}
          className={cn(
            'flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full px-5 text-sm font-medium transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
            disabled && 'cursor-not-allowed opacity-60',
            value === p
              ? 'bg-slate-900 text-white'
              : 'bg-slate-100 text-slate-900 hover:bg-[#e8e5dc]',
          )}
        >
          <input
            type="radio"
            className="sr-only"
            name="priority"
            disabled={disabled}
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-slate-800">
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
  if (target.assigneeIds.length === 0) {
    return compact ? (
      <span className={ADD_DOT}>
        <span aria-hidden>+</span>
        <span className="sr-only">{t('assign.unassigned')}</span>
      </span>
    ) : (
      <span className="text-slate-500">{t('assign.unassigned')}</span>
    )
  }
  const contested = target.assigneeIds.length > 1
  const names = target.assigneeIds.map((u) => (u === meId ? t('assign.me') : nameOf(u)))
  if (compact) {
    // Avatars (initiales) : le nom complet reste lisible par les lecteurs d'écran et au survol.
    return (
      <span
        className="inline-flex items-center"
        title={
          contested
            ? t('assign.contested', { count: names.length, names: names.join(', ') })
            : names.join(', ')
        }
      >
        {target.assigneeIds.slice(0, 3).map((u, i) => (
          <span
            key={u}
            aria-hidden
            className={cn(
              'bg-brand-50 text-brand-700 inline-flex size-7 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white',
              i > 0 && '-ml-2',
              contested && 'text-gold-700 bg-[#fbf0d9]',
            )}
          >
            {initialsOfName(nameOf(u))}
          </span>
        ))}
        <span className="sr-only">
          {contested
            ? t('assign.contested', { count: names.length, names: names.join(', ') })
            : names.join(', ')}
        </span>
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5',
        contested && 'text-gold-700 rounded-full bg-[#fbf0d9] px-2.5 py-0.5',
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
