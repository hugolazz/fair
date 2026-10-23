import * as Popover from '@radix-ui/react-popover'
import { ArrowDown, ArrowUp, Columns3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { PopoverPanel } from '@/components/ui/popover-panel'
import {
  ALWAYS_VISIBLE,
  DEFAULT_PREFS,
  isDefaultPrefs,
  shiftColumn,
  toggleColumn,
  type ColumnPrefs,
} from './lib/columns'

/**
 * « Modifier les colonnes » : cocher les colonnes visibles et, au clavier, les remonter ou les descendre. La largeur et
 * la place se règlent aussi directement sur l'en-tête du tableau, à la souris.
 */
export function ColumnsMenu({
  prefs,
  onChange,
}: {
  prefs: ColumnPrefs
  onChange: (next: ColumnPrefs) => void
}) {
  const { t } = useTranslation('prepare')
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button variant="secondary" className="min-h-9">
          <Columns3 aria-hidden className="size-4" />
          {t('columnsMenu.button')}
        </Button>
      </Popover.Trigger>
      <PopoverPanel
        aria-label={t('columnsMenu.title')}
        align="end"
        className="max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[20rem] p-3"
      >
        <p className="mb-2 text-sm text-slate-700">{t('columnsMenu.help')}</p>
        <ul className="flex flex-col">
          {prefs.order.map((key, index) => {
            const visible = !prefs.hidden.includes(key)
            const fixed = ALWAYS_VISIBLE.includes(key)
            const label = t(`columns.${key}`)
            return (
              <li
                key={key}
                className="flex items-center gap-1 border-t border-slate-100 first:border-0"
              >
                <label className="flex min-h-10 flex-1 cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-5"
                    checked={visible}
                    disabled={fixed}
                    onChange={(e) => onChange(toggleColumn(prefs, key, e.target.checked))}
                  />
                  <span className="flex-1 text-sm font-medium text-slate-900">{label}</span>
                  {fixed ? (
                    <span className="text-xs text-slate-600">{t('columnsMenu.always')}</span>
                  ) : null}
                </label>
                <Button
                  variant="ghost"
                  className="size-9 min-h-9 px-0"
                  aria-label={t('columnsMenu.moveUp', { column: label })}
                  disabled={index === 0}
                  onClick={() => onChange(shiftColumn(prefs, key, -1))}
                >
                  <ArrowUp aria-hidden className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  className="size-9 min-h-9 px-0"
                  aria-label={t('columnsMenu.moveDown', { column: label })}
                  disabled={index === prefs.order.length - 1}
                  onClick={() => onChange(shiftColumn(prefs, key, 1))}
                >
                  <ArrowDown aria-hidden className="size-4" />
                </Button>
              </li>
            )
          })}
        </ul>
        <div className="mt-1 border-t border-slate-200 pt-2">
          <Button
            variant="ghost"
            className="min-h-9"
            disabled={isDefaultPrefs(prefs)}
            onClick={() => onChange(DEFAULT_PREFS)}
          >
            {t('columnsMenu.reset')}
          </Button>
        </div>
      </PopoverPanel>
    </Popover.Root>
  )
}
