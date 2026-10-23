import * as Popover from '@radix-ui/react-popover'
import { useTranslation } from 'react-i18next'
import { PopoverPanel } from '@/components/ui/popover-panel'
import type { Tag, Target } from '@/db/schemas/prepare'
import { ADD_DOT, TagChip } from './atoms'
import { OptionToggleList } from './filter-menu'

type Props = {
  target: Target
  tags: readonly Tag[]
  tagById: ReadonlyMap<string, Tag>
  onToggle: (tagId: string, on: boolean) => void
}

const MAX_CHIPS = 3

/** Les tags d'une entreprise dans le tableau : un clic ouvre la liste des tags de l'équipe pour les cocher ou décocher. */
export function TagPicker({ target, tags, tagById, onToggle }: Props) {
  const { t } = useTranslation('prepare')
  const shown = target.tagIds.flatMap((id) => {
    const tag = tagById.get(id)
    return tag ? [tag] : []
  })
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('tagPicker.edit', { name: target.name })}
          className="focus-visible:outline-brand-text -mx-1 flex min-h-8 max-w-full min-w-0 items-center gap-1 overflow-hidden rounded-full px-1 hover:bg-slate-100"
        >
          {shown.slice(0, MAX_CHIPS).map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
          {shown.length > MAX_CHIPS ? (
            <span className="text-xs text-slate-600">+{shown.length - MAX_CHIPS}</span>
          ) : null}
          {shown.length === 0 ? (
            <span aria-hidden className={ADD_DOT}>
              +
            </span>
          ) : null}
        </button>
      </Popover.Trigger>
      <PopoverPanel aria-label={t('tagPicker.title')} className="min-w-48">
        {tags.length === 0 ? (
          <p className="px-3 py-2 text-sm text-slate-600">{t('tagPicker.none')}</p>
        ) : (
          <OptionToggleList
            options={tags.map((tag) => ({ key: tag.id, label: tag.label, color: tag.color }))}
            selected={target.tagIds}
            onToggle={(tagId) => onToggle(tagId, !target.tagIds.includes(tagId))}
          />
        )}
      </PopoverPanel>
    </Popover.Root>
  )
}
