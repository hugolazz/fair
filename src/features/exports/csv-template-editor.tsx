import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CSV_FIELDS, type CsvColumn, type CsvTemplate } from '@shared/exports/csv.ts'
import { Button } from '@/components/ui/button'
import { InputField, SelectField } from '@/components/ui/field'

const fieldLabel = (key: string) => CSV_FIELDS.find((f) => f.key === key)?.label ?? key

type Props = {
  template: CsvTemplate
  /** Modèle fourni (HubSpot, Salesforce) : lecture seule, duplicable. */
  builtin: boolean
  onChange: (t: CsvTemplate) => void
  onDuplicate: () => void
  onDelete: () => void
}

/** Aperçu (modèle fourni) ou éditeur (modèle personnalisé) du mapping : colonne du CSV ← champ de fair. */
export function CsvTemplateEditor({ template, builtin, onChange, onDuplicate, onDelete }: Props) {
  const { t } = useTranslation('exports')
  const setColumn = (i: number, patch: Partial<CsvColumn>) =>
    onChange({
      ...template,
      columns: template.columns.map((c, k) => (k === i ? { ...c, ...patch } : c)),
    })
  const move = (i: number, d: -1 | 1) => {
    const cols = template.columns.slice()
    const j = i + d
    if (j < 0 || j >= cols.length) return
    ;[cols[i], cols[j]] = [cols[j]!, cols[i]!]
    onChange({ ...template, columns: cols })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3">
      {builtin ? (
        <>
          <p className="text-sm text-slate-700">{t('csv.builtinHint')}</p>
          <table className="w-full text-sm">
            <caption className="sr-only">
              {t('csv.mappingCaption', { name: template.name })}
            </caption>
            <thead>
              <tr className="text-left text-slate-700">
                <th scope="col" className="py-1 pr-3 font-semibold">
                  {t('csv.header')}
                </th>
                <th scope="col" className="py-1 font-semibold">
                  {t('csv.source')}
                </th>
              </tr>
            </thead>
            <tbody>
              {template.columns.map((c) => (
                <tr key={c.header} className="border-t border-slate-100">
                  <td className="py-1 pr-3 font-medium">{c.header}</td>
                  <td className="py-1 text-slate-700">
                    {'field' in c.source
                      ? fieldLabel(c.source.field)
                      : t('csv.fixed', { value: c.source.value })}
                    {c.map ? ` ${t('csv.converted')}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div>
            <Button variant="secondary" onClick={onDuplicate}>
              <Copy aria-hidden className="size-4" />
              {t('csv.duplicate')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <InputField
              label={t('csv.name')}
              value={template.name}
              maxLength={80}
              onChange={(e) => onChange({ ...template, name: e.target.value })}
            />
            <SelectField
              label={t('csv.delimiter')}
              value={template.delimiter}
              onChange={(e) =>
                onChange({ ...template, delimiter: e.target.value === ';' ? ';' : ',' })
              }
            >
              <option value=",">{t('csv.comma')}</option>
              <option value=";">{t('csv.semicolon')}</option>
            </SelectField>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {(
              [
                ['bom', 'csv.bom'],
                ['includeCompaniesWithoutContact', 'csv.withoutContact'],
                ['excludeOptOut', 'csv.excludeOptOut'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={template[key]}
                  onChange={(e) => onChange({ ...template, [key]: e.target.checked })}
                  className="size-4 accent-teal-700"
                />
                {t(label)}
              </label>
            ))}
          </div>

          <ul className="flex flex-col gap-2">
            {template.columns.map((c, i) => (
              <li
                key={i}
                className="grid items-end gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
              >
                <InputField
                  label={t('csv.header')}
                  value={c.header}
                  maxLength={120}
                  onChange={(e) => setColumn(i, { header: e.target.value })}
                />
                <SelectField
                  label={t('csv.sourceType')}
                  value={'field' in c.source ? 'field' : 'value'}
                  onChange={(e) =>
                    setColumn(i, {
                      source:
                        e.target.value === 'field' ? { field: 'company.name' } : { value: '' },
                    })
                  }
                >
                  <option value="field">{t('csv.fromField')}</option>
                  <option value="value">{t('csv.fromValue')}</option>
                </SelectField>
                {'field' in c.source ? (
                  <SelectField
                    label={t('csv.source')}
                    value={c.source.field}
                    onChange={(e) => setColumn(i, { source: { field: e.target.value } })}
                  >
                    {CSV_FIELDS.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </SelectField>
                ) : (
                  <InputField
                    label={t('csv.value')}
                    value={c.source.value}
                    maxLength={500}
                    onChange={(e) => setColumn(i, { source: { value: e.target.value } })}
                  />
                )}
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    className="size-11 px-0"
                    aria-label={t('csv.up', { name: c.header })}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp aria-hidden className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="size-11 px-0"
                    aria-label={t('csv.down', { name: c.header })}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown aria-hidden className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    className="size-11 px-0"
                    aria-label={t('csv.removeColumn', { name: c.header })}
                    onClick={() =>
                      onChange({ ...template, columns: template.columns.filter((_, k) => k !== i) })
                    }
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                onChange({
                  ...template,
                  columns: [...template.columns, { header: '', source: { field: 'company.name' } }],
                })
              }
            >
              <Plus aria-hidden className="size-4" />
              {t('csv.addColumn')}
            </Button>
            <Button variant="ghost" onClick={onDelete}>
              <Trash2 aria-hidden className="size-4" />
              {t('csv.deleteTemplate')}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
