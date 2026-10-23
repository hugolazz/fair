import * as Popover from '@radix-ui/react-popover'
import { Columns3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { PopoverPanel } from '@/components/ui/popover-panel'
import {
  ALWAYS_VISIBLE,
  COLUMN_KEYS,
  DEFAULT_PREFS,
  isDefaultPrefs,
  SCALE_MAX,
  SCALE_MIN,
  SCALE_STEP,
  scaleOf,
  setScale,
  toggleColumn,
  type ColumnPrefs,
} from './lib/columns'

/** « Modifier les colonnes » : cocher les colonnes visibles du tableau et régler la largeur de chacune. */
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
        className="max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[22rem] p-3"
      >
        <p className="mb-2 text-sm text-slate-700">{t('columnsMenu.help')}</p>
        <ul className="flex flex-col">
          {COLUMN_KEYS.map((key) => {
            const visible = !prefs.hidden.includes(key)
            const fixed = ALWAYS_VISIBLE.includes(key)
            const label = t(`columns.${key}`)
            const percent = scaleOf(prefs, key)
            return (
              <li
                key={key}
                className="flex flex-col gap-1 border-t border-slate-100 py-2 first:border-0"
              >
                <label className="flex min-h-9 cursor-pointer items-center gap-3">
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
                <label className="flex items-center gap-3 pl-8">
                  <span className="sr-only">{t('columnsMenu.width', { column: label })}</span>
                  <input
                    type="range"
                    min={SCALE_MIN}
                    max={SCALE_MAX}
                    step={SCALE_STEP}
                    value={percent}
                    disabled={!visible}
                    aria-label={t('columnsMenu.width', { column: label })}
                    aria-valuetext={`${percent} %`}
                    onChange={(e) => onChange(setScale(prefs, key, Number(e.target.value)))}
                    className="min-h-9 flex-1"
                  />
                  <span aria-hidden className="w-11 text-right text-xs text-slate-600 tabular-nums">
                    {percent} %
                  </span>
                </label>
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
