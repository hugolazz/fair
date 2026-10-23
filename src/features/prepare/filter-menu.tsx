import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PopoverPanel } from '@/components/ui/popover-panel'
import { cn } from '@/lib/cn'

export type FilterOption = { key: string; label: string; color?: string }

type ListProps = {
  options: readonly FilterOption[]
  selected: readonly string[]
  onToggle: (key: string) => void
}

/** Lignes à cocher d'un panneau : pastille de couleur facultative, libellé, coche sur les choix actifs. */
export function OptionToggleList({ options, selected, onToggle }: ListProps) {
  return (
    <ul className="flex flex-col">
      {options.map((o) => {
        const on = selected.includes(o.key)
        return (
          <li key={o.key}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(o.key)}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-sm text-slate-900 hover:bg-slate-100"
            >
              {o.color ? (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: o.color }}
                />
              ) : null}
              <span className={cn('flex-1 truncate', on && 'font-medium')}>{o.label}</span>
              {on ? <Check aria-hidden className="text-brand-text size-4 shrink-0" /> : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

type Props = ListProps & {
  label: string
  onClear: () => void
}

/** Un filtre à choix multiples replié en un bouton : « Priorité », « Tags »… ; le nombre de choix apparaît dessus. */
export function FilterMenu({ label, options, selected, onToggle, onClear }: Props) {
  const { t } = useTranslation('prepare')
  const active = selected.length > 0
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors duration-200',
            active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-900 hover:bg-[#e8e5dc]',
          )}
        >
          {active ? t('filters.withCount', { label, count: selected.length }) : label}
          <ChevronDown aria-hidden className="size-3.5 opacity-70" />
        </button>
      </Popover.Trigger>
      <PopoverPanel aria-label={label} className="min-w-52">
        <OptionToggleList options={options} selected={selected} onToggle={onToggle} />
        {active ? (
          <button
            type="button"
            onClick={onClear}
            className="mt-1 flex min-h-10 w-full items-center rounded-xl border-t border-slate-200 px-3 text-left text-sm text-slate-700 hover:bg-slate-100"
          >
            {t('filters.clear')}
          </button>
        ) : null}
      </PopoverPanel>
    </Popover.Root>
  )
}
