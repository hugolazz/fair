import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

export type FilterOption = { key: string; label: string; color?: string }

type Props = {
  label: string
  options: readonly FilterOption[]
  selected: readonly string[]
  onToggle: (key: string) => void
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
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label={label}
          className="animate-rise z-[80] max-h-[min(20rem,var(--radix-popover-content-available-height))] min-w-52 overflow-auto rounded-2xl bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(19,26,24,0.22)] ring-1 ring-slate-200"
        >
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
                    {on ? <Check aria-hidden className="text-brand-600 size-4 shrink-0" /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
          {active ? (
            <button
              type="button"
              onClick={onClear}
              className="mt-1 flex min-h-10 w-full items-center rounded-xl border-t border-slate-200 px-3 text-left text-sm text-slate-700 hover:bg-slate-100"
            >
              {t('filters.clear')}
            </button>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
