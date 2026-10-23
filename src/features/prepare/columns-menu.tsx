import * as Popover from '@radix-ui/react-popover'
import { Columns3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { PopoverPanel } from '@/components/ui/popover-panel'
import {
  ALWAYS_VISIBLE,
  BASE_COLUMNS,
  DEFAULT_PREFS,
  isDefaultPrefs,
  OPTIONAL_COLUMNS,
  toggleColumn,
  type ColumnKey,
  type ColumnPrefs,
} from './lib/columns'

/**
 * « Modifier les colonnes » : cocher les colonnes visibles du tableau, dont des colonnes supplémentaires (décochées par
 * défaut). La largeur et la place se règlent directement sur l'en-tête du tableau.
 */
export function ColumnsMenu({
  prefs,
  onChange,
  exclude,
  newsTitle,
}: {
  prefs: ColumnPrefs
  onChange: (next: ColumnPrefs) => void
  /** Colonnes qui n'existent pas pour cette équipe (ex. « Actualité » sans la case optionnelle). */
  exclude: readonly ColumnKey[]
  /** Intitulé de la case optionnelle de l'équipe, qui nomme sa colonne. */
  newsTitle: string
}) {
  const { t } = useTranslation('prepare')
  const row = (key: ColumnKey) => {
    const label = key === 'news' ? newsTitle : t(`columns.${key}`)
    const fixed = ALWAYS_VISIBLE.includes(key)
    return (
      <li key={key}>
        <label className="flex min-h-10 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="size-5"
            checked={!prefs.hidden.includes(key)}
            disabled={fixed}
            onChange={(e) => onChange(toggleColumn(prefs, key, e.target.checked))}
          />
          <span className="flex-1 text-sm font-medium text-slate-900">{label}</span>
          {fixed ? <span className="text-xs text-slate-600">{t('columnsMenu.always')}</span> : null}
        </label>
      </li>
    )
  }
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
        <ul className="flex flex-col">{BASE_COLUMNS.map(row)}</ul>
        <p className="mt-2 border-t border-slate-200 pt-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
          {t('columnsMenu.more')}
        </p>
        <ul className="flex flex-col">
          {OPTIONAL_COLUMNS.filter((k) => !exclude.includes(k)).map(row)}
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
