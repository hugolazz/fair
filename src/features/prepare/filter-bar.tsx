import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { PRIORITIES, type Priority, type Tag, type TeamMember } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import { FilterMenu } from './filter-menu'
import { countActiveFilters, emptyFilters, type Filters } from './lib/filter'

type Props = {
  filters: Filters
  onChange: (f: Filters) => void
  tags: Tag[]
  members: TeamMember[]
  meId: string
  total: number
  shown: number
  /** Sur mobile, une seule rangée de boutons-icônes ; recherche et filtres s'ouvrent dessous. */
  collapsible: boolean
  /** Boutons-icônes placés avant / après recherche et filtres sur la rangée mobile. */
  before?: React.ReactNode
  after?: React.ReactNode
  /** Action de page à droite de la rangée sur bureau (par exemple « Ajouter une entreprise »). */
  desktopAction?: React.ReactNode
}

const iconBtn =
  'relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-200'

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
        'inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-medium transition-colors duration-200 md:min-h-9',
        pressed ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900 hover:bg-[#e8e5dc]',
      )}
    >
      {children}
    </button>
  )
}

const selectCls =
  'min-h-11 rounded-full border-0 bg-slate-100 px-4 text-[13px] font-medium text-slate-900 md:min-h-9'

export function FilterBar({
  filters,
  onChange,
  tags,
  members,
  meId,
  total,
  shown,
  collapsible,
  before,
  after,
  desktopAction,
}: Props) {
  const { t } = useTranslation('prepare')
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
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
      <div role="group" aria-label={t('filters.priority')} className="flex flex-wrap gap-2">
        <Toggle pressed={filters.priorities.length === 0} onClick={() => set({ priorities: [] })}>
          {t('filters.all')}
        </Toggle>
        {PRIORITIES.map((p) => (
          <Toggle
            key={p}
            pressed={filters.priorities.includes(p)}
            onClick={() => togglePriority(p)}
          >
            {t('filters.priorityLabel', { p })}
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
        <Select
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
        </Select>
      </label>
      {active > 0 ? (
        <Button variant="ghost" className="min-h-9" onClick={() => onChange(emptyFilters)}>
          <X aria-hidden className="size-4" />
          {t('filters.reset')}
        </Button>
      ) : null}
    </div>
  )

  if (collapsible) {
    const searchOpen = searching || filters.search !== ''
    return (
      <div className="flex flex-col gap-2" role="search">
        <div className="flex items-center gap-2">
          {before}
          <button
            type="button"
            aria-label={t('filters.searchToggle')}
            aria-expanded={searchOpen}
            onClick={() => setSearching((s) => !s)}
            className={cn(
              iconBtn,
              filters.search !== '' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900',
            )}
          >
            <Search aria-hidden className="size-5" />
          </button>
          <button
            type="button"
            aria-label={
              active > 0 ? t('filters.toggleActive', { count: active }) : t('filters.toggle')
            }
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={cn(
              iconBtn,
              active > 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900',
            )}
          >
            <SlidersHorizontal aria-hidden className="size-5" />
          </button>
          {after}
          <p role="status" className="ml-auto text-[13px] whitespace-nowrap text-slate-600">
            {t('filters.count', { count: shown, total })}
          </p>
        </div>
        {searchOpen ? (
          <label className="relative block">
            <span className="sr-only">{t('filters.search')}</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
            />
            <input
              type="search"
              autoFocus={filters.search === ''}
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
              placeholder={t('filters.search')}
              className="min-h-11 w-full rounded-full border-0 bg-slate-100 pr-4 pl-10 text-base placeholder:text-slate-500"
            />
          </label>
        ) : null}
        {open ? (
          <div className="rounded-3xl bg-white p-4 shadow-[0_0_0_1px_var(--color-slate-200)]">
            {panel}
          </div>
        ) : null}
      </div>
    )
  }

  const assigneeLabel =
    filters.assignee === 'any'
      ? t('filters.any')
      : filters.assignee === 'none'
        ? t('filters.unassigned')
        : filters.assignee === meId
          ? t('filters.mine')
          : (members.find((m) => m.userId === filters.assignee)?.name ?? t('filters.any'))
  const withTags = (f: Partial<Filters>) => onChange({ ...filters, ...f })

  // Bureau : une seule rangée. Recherche, puis les filtres repliés en boutons, puis le compteur et l'action de page.
  return (
    <div className="flex flex-wrap items-center gap-2" role="search">
      <label className="relative w-56 max-w-full">
        <span className="sr-only">{t('filters.search')}</span>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500"
        />
        <input
          type="search"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder={t('filters.searchShort')}
          className="min-h-9 w-full rounded-full border-0 bg-slate-100 pr-4 pl-10 text-[13px] placeholder:text-slate-500"
        />
      </label>
      <FilterMenu
        label={t('filters.priority')}
        options={[
          ...PRIORITIES.map((p) => ({
            key: p as string,
            label: t('filters.priorityLabel', { p }),
          })),
          { key: 'none', label: t('priority.none') },
        ]}
        selected={filters.priorities}
        onToggle={(key) => togglePriority(key as Priority | 'none')}
        onClear={() => withTags({ priorities: [] })}
      />
      {tags.length > 0 ? (
        <FilterMenu
          label={t('filters.tag')}
          options={tags.map((tag) => ({ key: tag.id, label: tag.label, color: tag.color }))}
          selected={filters.tagIds}
          onToggle={toggleTag}
          onClear={() => withTags({ tagIds: [] })}
        />
      ) : null}
      <Select
        aria-label={t('filters.assignee')}
        value={filters.assignee}
        onChange={(e) => set({ assignee: e.target.value })}
        display={
          <span className="inline-flex items-center gap-1.5">
            {filters.assignee === 'any'
              ? t('filters.assignee')
              : `${t('filters.assignee')} · ${assigneeLabel}`}
            <ChevronDown aria-hidden className="size-3.5 opacity-70" />
          </span>
        }
        className={cn(
          'inline-flex min-h-9 items-center rounded-full px-4 text-[13px] font-medium transition-colors duration-200',
          filters.assignee === 'any'
            ? 'bg-slate-100 text-slate-900 hover:bg-[#e8e5dc]'
            : 'bg-slate-900 text-white',
        )}
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
      </Select>
      {active > 0 ? (
        <Button variant="ghost" className="min-h-9 px-3" onClick={() => onChange(emptyFilters)}>
          <X aria-hidden className="size-4" />
          {t('filters.reset')}
        </Button>
      ) : null}
      <p role="status" className="ml-auto text-[13px] whitespace-nowrap text-slate-600">
        {t('filters.count', { count: shown, total })}
      </p>
      {desktopAction}
    </div>
  )
}
