import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SelectField } from '@/components/ui/field'
import {
  IMPORT_FIELDS,
  type ColumnMapping,
  type ImportField,
  type RawTable,
} from '@/db/schemas/import'
import { cleanRows } from './lib/clean'

type Props = {
  table: RawTable
  mapping: ColumnMapping
  restored: number
  firstRowIsHeader: boolean
  busy: boolean
  error: string | undefined
  onFirstRowIsHeader: (value: boolean) => void
  onMappingChange: (mapping: ColumnMapping) => void
  onContinue: () => void
}

export function StepMapping({
  table,
  mapping,
  restored,
  firstRowIsHeader,
  busy,
  error,
  onFirstRowIsHeader,
  onMappingChange,
  onContinue,
}: Props) {
  const { t } = useTranslation('import')

  function setField(field: ImportField, value: string) {
    const next: ColumnMapping = { ...mapping }
    if (value === '') delete next[field]
    else {
      const col = Number(value)
      // Une colonne ne sert qu'à un champ : on la retire de l'ancien.
      for (const f of IMPORT_FIELDS) if (next[f] === col) delete next[f]
      next[field] = col
    }
    onMappingChange(next)
  }

  const preview = table.rows.slice(0, 5)
  const canContinue = mapping.companyName !== undefined
  const hasContactColumns =
    mapping.contactName !== undefined ||
    mapping.contactFirstName !== undefined ||
    mapping.contactLastName !== undefined ||
    mapping.email !== undefined
  // Lignes qui contiennent plusieurs contacts : à signaler avant l'import, avec les décalages éventuels.
  const multi = useMemo(() => {
    if (!canContinue || !hasContactColumns) return { many: 0, mismatch: 0 }
    const rows = cleanRows(table, mapping).rows
    return {
      many: rows.filter((r) => r.contacts.length > 1).length,
      mismatch: rows.filter((r) => r.warnings.includes('contacts_mismatch')).length,
    }
  }, [table, mapping, canContinue, hasContactColumns])

  return (
    <section className="flex flex-col gap-5" aria-labelledby="mapping-title">
      <div>
        <h2 id="mapping-title" className="text-lg font-semibold">
          {t('mapping.title')}
        </h2>
        <p className="text-sm text-slate-600">{t('mapping.help')}</p>
        <p className="mt-1 text-sm text-slate-600">
          {t('mapping.rowsDetected', { count: table.rows.length })}
        </p>
      </div>

      {restored > 0 ? (
        <p role="status" className="bg-brand-50 text-brand-900 rounded-lg p-3 text-sm">
          {t('mapping.restored', { count: restored })}
        </p>
      ) : null}

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={firstRowIsHeader}
          onChange={(e) => onFirstRowIsHeader(e.target.checked)}
        />
        {t('mapping.firstRowIsHeader')}
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        {IMPORT_FIELDS.map((field) => (
          <SelectField
            key={field}
            label={
              t(`mapping.fields.${field}`) +
              (field === 'companyName' ? ` (${t('mapping.required')})` : '')
            }
            value={mapping[field] === undefined ? '' : String(mapping[field])}
            onChange={(e) => setField(field, e.target.value)}
          >
            <option value="">{t('mapping.ignore')}</option>
            {table.headers.map((h, i) => (
              <option key={i} value={i}>
                {h}
              </option>
            ))}
          </SelectField>
        ))}
      </div>

      {hasContactColumns ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-slate-600">{t('mapping.multiContactsHint')}</p>
          {multi.many > 0 ? (
            <p role="status" className="bg-brand-50 text-brand-900 rounded-lg p-3">
              {t('mapping.multiContactsFound', { count: multi.many })}
            </p>
          ) : null}
          {multi.mismatch > 0 ? (
            <p role="alert" className="rounded-lg bg-amber-100 p-3 text-amber-950">
              {t('mapping.multiContactsMismatch', { count: multi.mismatch })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold">{t('mapping.preview')}</h3>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                {table.headers.map((h, i) => (
                  <th key={i} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, r) => (
                <tr key={r} className="border-t border-slate-100">
                  {row.map((cell, c) => (
                    <td key={c} className="max-w-56 truncate px-3 py-2">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!canContinue ? (
        <p role="alert" className="text-sm text-red-700">
          {t('mapping.companyRequired')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div>
        <Button disabled={!canContinue || busy} onClick={onContinue}>
          {busy ? t('mapping.loading') : t('mapping.continue')}
        </Button>
      </div>
    </section>
  )
}
