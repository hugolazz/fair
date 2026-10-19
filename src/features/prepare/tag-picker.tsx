import * as Popover from '@radix-ui/react-popover'
import { Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Tag, Target } from '@/db/schemas/prepare'
import { TagChip } from './atoms'

type Props = {
  target: Target
  tags: readonly Tag[]
  onToggle: (tagId: string, on: boolean) => void
}

const MAX_CHIPS = 3

/** Les tags d'une entreprise dans le tableau : un clic ouvre la liste des tags de l'équipe pour les cocher ou décocher. */
export function TagPicker({ target, tags, onToggle }: Props) {
  const { t } = useTranslation('prepare')
  const byId = new Map(tags.map((tag) => [tag.id, tag]))
  const chosen = new Set(target.tagIds)
  const shown = target.tagIds.flatMap((id) => {
    const tag = byId.get(id)
    return tag ? [tag] : []
  })
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('tagPicker.edit', { name: target.name })}
          className="focus-visible:outline-brand-600 -mx-1 flex min-h-8 max-w-full min-w-0 items-center gap-1 overflow-hidden rounded-full px-1 hover:bg-slate-100"
        >
          {shown.slice(0, MAX_CHIPS).map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
          {shown.length > MAX_CHIPS ? (
            <span className="text-xs text-slate-600">+{shown.length - MAX_CHIPS}</span>
          ) : null}
          {shown.length === 0 ? (
            <span
              aria-hidden
              className="inline-flex size-7 items-center justify-center rounded-full border border-dashed border-[#cfcbbf] text-[11px] font-semibold text-slate-500"
            >
              +
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={t('tagPicker.title')}
          className="animate-rise z-[80] max-h-[min(20rem,var(--radix-popover-content-available-height))] min-w-48 overflow-auto rounded-2xl bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(19,26,24,0.22)] ring-1 ring-slate-200"
        >
          {tags.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-600">{t('tagPicker.none')}</p>
          ) : (
            <ul className="flex flex-col">
              {tags.map((tag) => {
                const on = chosen.has(tag.id)
                return (
                  <li key={tag.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onToggle(tag.id, !on)}
                      className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm text-slate-900 hover:bg-slate-100"
                    >
                      <span
                        aria-hidden
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className={on ? 'flex-1 truncate font-medium' : 'flex-1 truncate'}>
                        {tag.label}
                      </span>
                      {on ? <Check aria-hidden className="text-brand-600 size-4 shrink-0" /> : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
