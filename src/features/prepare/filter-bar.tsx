import { Search, SlidersHorizontal, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { PRIORITIES, type Priority, type Tag, type TeamMember } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import { countActiveFilters, emptyFilters, type Filters } from './lib/filter'

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
  tags: Tag[]
  members: TeamMember[]
  meId: string
  total: number
  shown: number
  /** Sur mobile, les filtres sont repliés derrière un bouton. */
  collapsible: boolean
}

function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-9 items-center rounded-full border px-3 text-sm font-medium md:min-h-8',
        pressed
          ? 'border-brand-600 bg-brand-600 text-white'
          : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  )
}

const selectCls = 'min-h-11 rounded-lg border border-slate-300 bg-white px-2 text-sm md:min-h-9'

export function FilterBar({
  filters,
  onChange,
  tags,
  members,
  meId,
  total,
  shown,
  collapsible,
}: Props) {
  const { t } = useTranslation('prepare')
  const [open, setOpen] = useState(false)
  const active = countActiveFilters(filters)
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const togglePriority = (p: Priority | 'none') =>
    set({
      priorities: filters.priorities.includes(p)
        ? filters.priorities.filter((x) => x !== p)
        : [...filters.priorities, p],
    })
  const toggleTag = (id: string) =>
    set({
      tagIds: filters.tagIds.includes(id)
        ? filters.tagIds.filter((x) => x !== id)
        : [...filters.tagIds, id],
    })

  const panel = (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
      <div role="group" aria-label={t('filters.priority')} className="flex flex-wrap gap-1.5">
        {PRIORITIES.map((p) => (
          <Toggle
            key={p}
            pressed={filters.priorities.includes(p)}
            onClick={() => togglePriority(p)}
          >
            {p}
          </Toggle>
        ))}
        <Toggle
          pressed={filters.priorities.includes('none')}
          onClick={() => togglePriority('none')}
        >
          {t('priority.none')}
        </Toggle>
      </div>
      <div role="group" aria-label={t('filters.tagsLabel')} className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <Toggle
            key={tag.id}
            pressed={filters.tagIds.includes(tag.id)}
            onClick={() => toggleTag(tag.id)}
          >
            {tag.label}
          </Toggle>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate-700">{t('filters.assignee')}</span>
        <select
          className={selectCls}
          value={filters.assignee}
          onChange={(e) => set({ assignee: e.target.value })}
        >
          <option value="any">{t('filters.any')}</option>
          <option value={meId}>{t('filters.mine')}</option>
          <option value="none">{t('filters.unassigned')}</option>
          {members
            .filter((m) => m.userId !== meId)
            .map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name}
              </option>
            ))}
        </select>
      </label>
      {active > 0 ? (
        <Button variant="ghost" className="min-h-9" onClick={() => onChange(emptyFilters)}>
          <X aria-hidden className="size-4" />
          {t('filters.reset')}
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className="flex flex-col gap-3" role="search">
      <div className="flex items-center gap-2">
        <label className="relative flex-1 md:max-w-md">
          <span className="sr-only">{t('filters.search')}</span>
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => set({ search: e.target.value })}
            placeholder={t('filters.search')}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pr-3 pl-9 text-base placeholder:text-slate-500 md:min-h-9 md:text-sm"
          />
        </label>
        {collapsible ? (
          <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <SlidersHorizontal aria-hidden className="size-4" />
            {active > 0 ? t('filters.toggleActive', { count: active }) : t('filters.toggle')}
          </Button>
        ) : null}
        <p role="status" className="hidden text-sm whitespace-nowrap text-slate-600 md:block">
          {t('filters.count', { count: shown, total })}
        </p>
      </div>
      {collapsible ? (
        open ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3">{panel}</div>
        ) : null
      ) : (
        panel
      )}
      <p role="status" className="text-sm text-slate-600 md:hidden">
        {t('filters.count', { count: shown, total })}
      </p>
    </div>
  )
}
