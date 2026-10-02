import { Download, FileSpreadsheet, FileText, Loader2, Table2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BUILTIN_TEMPLATES, type CsvTemplate } from '@shared/exports/csv.ts'
import { applyFilters } from '@shared/exports/select.ts'
import { COLUMNS, TABLE_TITLES, type TableId } from '@shared/exports/tables.ts'
import {
  MEETING_STATUSES,
  NO_FILTERS,
  type ExportFilters,
  type Priority,
} from '@shared/exports/types.ts'
import { ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { ServerExportError } from '@/db/repositories/exports'
import { useEvent } from '@/features/events/event-context'
import { cn } from '@/lib/cn'
import { CheckGroup } from './check-group'
import { CsvTemplateEditor } from './csv-template-editor'
import { downloadBytes } from './download'
import { chooseMode, SERVER_THRESHOLD, volume, type ModePref } from './lib/mode'
import { allColumns, buildRequest, isValid, type FormState, type PdfKind } from './lib/request'
import {
  deleteCustomTemplate,
  loadCustomTemplates,
  newCustomTemplate,
  saveCustomTemplate,
} from './lib/templates'
import { runExport, type ExportOutcome } from './run-export'
import { useExportData } from './use-export-data'

const formatBytes = (n: number) =>
  n < 1024
    ? `${n} o`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(0)} Ko`
      : `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {hint ? <p className="text-sm text-slate-700">{hint}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Choice({
  checked,
  onSelect,
  icon,
  title,
  body,
  name,
}: {
  checked: boolean
  onSelect: () => void
  icon: React.ReactNode
  title: string
  body: string
  name: string
}) {
  return (
    <label
      className={cn(
        'flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
        checked ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50',
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span aria-hidden className="text-brand-700 mt-0.5">
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-slate-700">{body}</span>
      </span>
    </label>
  )
}

/** Exports en masse : Excel, CSV pour CRM, PDF de compte-rendu, avec filtres, colonnes et génération locale ou serveur. */
export default function ExportsPage() {
  const { t } = useTranslation('exports')
  const { t: tp } = useTranslation('prepare')
  const { event } = useEvent()
  const { data, error, loading, reload } = useExportData(event.id)

  const [custom, setCustom] = useState<CsvTemplate[]>(() => loadCustomTemplates())
  const [state, setState] = useState<FormState>({
    kind: 'xlsx',
    pdfKind: 'pdf-global',
    filters: NO_FILTERS,
    columns: allColumns(),
    template: BUILTIN_TEMPLATES[0]!,
  })
  const [pref, setPref] = useState<ModePref>('auto')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<ExportOutcome | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const templates = [...BUILTIN_TEMPLATES, ...custom]
  const isBuiltin = BUILTIN_TEMPLATES.some((b) => b.id === state.template.id)
  const set = (patch: Partial<FormState>) => setState((s) => ({ ...s, ...patch }))
  const setFilters = (patch: Partial<ExportFilters>) =>
    set({ filters: { ...state.filters, ...patch } })

  const filtered = useMemo(
    () => (data ? applyFilters(data, state.filters) : null),
    [data, state.filters],
  )

  if (loading && !data) return <Loading />
  if (error || !data || !filtered) return <ErrorState message={t('errors.load')} onRetry={reload} />

  const mode = chooseMode(pref, data)
  const nothing = filtered.targets.length === 0

  function changeTemplate(next: CsvTemplate) {
    set({ template: next })
    if (!BUILTIN_TEMPLATES.some((b) => b.id === next.id)) setCustom(saveCustomTemplate(next))
  }

  async function generate() {
    setBusy(true)
    setOutcome(null)
    setFailure(null)
    try {
      const result = await runExport({
        eventId: event.id,
        data: data!,
        request: buildRequest(state),
        pref,
      })
      setOutcome(result)
      if (result.kind === 'file')
        downloadBytes(result.result.filename, result.result.mime, result.result.bytes)
    } catch (e) {
      setFailure(
        e instanceof ServerExportError
          ? `server.${e.code}`
          : e instanceof Error && e.message === 'no salesperson'
            ? 'server.nothing_to_export'
            : 'generic',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        <p className="text-sm text-slate-700">{t('subtitle')}</p>
      </div>

      <Section title={t('format.title')}>
        <div role="radiogroup" aria-label={t('format.title')} className="grid gap-3 md:grid-cols-3">
          <Choice
            name="kind"
            checked={state.kind === 'xlsx'}
            onSelect={() => set({ kind: 'xlsx' })}
            icon={<FileSpreadsheet className="size-6" />}
            title={t('format.xlsx')}
            body={t('format.xlsxBody')}
          />
          <Choice
            name="kind"
            checked={state.kind === 'csv'}
            onSelect={() => set({ kind: 'csv' })}
            icon={<Table2 className="size-6" />}
            title={t('format.csv')}
            body={t('format.csvBody')}
          />
          <Choice
            name="kind"
            checked={state.kind === 'pdf'}
            onSelect={() => set({ kind: 'pdf' })}
            icon={<FileText className="size-6" />}
            title={t('format.pdf')}
            body={t('format.pdfBody')}
          />
        </div>

        {state.kind === 'pdf' ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-semibold">{t('pdf.legend')}</legend>
            {(['pdf-global', 'pdf-reps', 'pdf-meetings'] as PdfKind[]).map((k) => (
              <label key={k} className="flex min-h-9 cursor-pointer items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="pdfKind"
                  checked={state.pdfKind === k}
                  onChange={() => set({ pdfKind: k })}
                  className="mt-1 size-4 accent-teal-700"
                />
                <span>
                  <span className="font-medium">{t(`pdf.${k}`)}</span>
                  <span className="block text-slate-700">{t(`pdf.${k}Body`)}</span>
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {state.kind === 'csv' ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                {t('csv.template')}
                <select
                  value={state.template.id}
                  onChange={(e) => {
                    const next = templates.find((x) => x.id === e.target.value)
                    if (next) set({ template: next })
                  }}
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base"
                >
                  <optgroup label={t('csv.builtin')}>
                    {BUILTIN_TEMPLATES.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                  {custom.length > 0 ? (
                    <optgroup label={t('csv.custom')}>
                      {custom.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <Button
                variant="secondary"
                onClick={() => {
                  const next = newCustomTemplate(custom)
                  setCustom(saveCustomTemplate(next))
                  set({ template: next })
                }}
              >
                {t('csv.new')}
              </Button>
            </div>
            <CsvTemplateEditor
              template={state.template}
              builtin={isBuiltin}
              onChange={changeTemplate}
              onDuplicate={() => {
                const copy = {
                  ...newCustomTemplate(custom, state.template),
                  name: t('csv.copyName', { name: state.template.name }),
                }
                setCustom(saveCustomTemplate(copy))
                set({ template: copy })
              }}
              onDelete={() => {
                setCustom(deleteCustomTemplate(state.template.id))
                set({ template: BUILTIN_TEMPLATES[0]! })
              }}
            />
          </div>
        ) : null}
      </Section>

      <Section title={t('filters.title')} hint={t('filters.hint')}>
        <div className="grid gap-4 md:grid-cols-2">
          <CheckGroup
            legend={t('filters.status')}
            selected={state.filters.statuses}
            onChange={(statuses) => setFilters({ statuses })}
            options={[
              ...MEETING_STATUSES.map((s) => ({ value: s, label: tp(`report.status.${s}`) })),
              { value: 'none' as const, label: t('filters.noMeeting') },
            ]}
          />
          <CheckGroup
            legend={t('filters.priority')}
            selected={state.filters.priorities}
            onChange={(priorities) => setFilters({ priorities })}
            options={[
              ...(['A', 'B', 'C'] as Priority[]).map((p) => ({
                value: p,
                label: tp(`priority.${p}`),
              })),
              { value: 'none' as const, label: tp('priority.none') },
            ]}
          />
          <CheckGroup
            legend={t('filters.salesperson')}
            selected={state.filters.assigneeIds}
            onChange={(assigneeIds) => setFilters({ assigneeIds })}
            options={data.members.map((m) => ({ value: m.userId, label: m.name }))}
          />
          <CheckGroup
            legend={t('filters.tags')}
            selected={state.filters.tagIds}
            onChange={(tagIds) => setFilters({ tagIds })}
            options={data.tags.map((tag) => ({ value: tag.id, label: tag.label }))}
          />
        </div>
        <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm font-medium">
          {t('filters.count', {
            companies: filtered.targets.length,
            meetings: filtered.meetings.length,
            contacts: filtered.contacts.length,
            notes: filtered.notes.length,
          })}
        </p>
      </Section>

      {state.kind === 'xlsx' ? (
        <Section title={t('columns.title')} hint={t('columns.hint')}>
          <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(COLUMNS) as TableId[]).map((id) => (
              <div key={id} className="flex flex-col gap-1">
                <CheckGroup
                  legend={TABLE_TITLES[id]}
                  selected={state.columns[id]}
                  onChange={(keys) =>
                    set({
                      columns: {
                        ...state.columns,
                        [id]: COLUMNS[id].map((c) => c.key).filter((k) => keys.includes(k)),
                      },
                    })
                  }
                  options={COLUMNS[id].map((c) => ({ value: c.key, label: c.label }))}
                />
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    className="min-h-9"
                    onClick={() =>
                      set({ columns: { ...state.columns, [id]: COLUMNS[id].map((c) => c.key) } })
                    }
                  >
                    {t('columns.all')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-9"
                    onClick={() => set({ columns: { ...state.columns, [id]: [] } })}
                  >
                    {t('columns.none')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title={t('generate.title')}>
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold">{t('generate.where')}</legend>
          {(['auto', 'local', 'server'] as ModePref[]).map((p) => (
            <label key={p} className="flex min-h-9 cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="mode"
                checked={pref === p}
                onChange={() => setPref(p)}
                className="mt-1 size-4 accent-teal-700"
              />
              <span>
                <span className="font-medium">{t(`generate.${p}`)}</span>
                <span className="block text-slate-700">
                  {t(`generate.${p}Body`, { count: SERVER_THRESHOLD })}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-sm text-slate-700">
          {t(mode === 'server' ? 'generate.willServer' : 'generate.willLocal', {
            volume: volume(filtered),
          })}
        </p>
        <div>
          <Button
            onClick={() => void generate()}
            disabled={busy || nothing || !isValid(state)}
            className="min-h-12"
          >
            {busy ? (
              <Loader2 aria-hidden className="size-5 motion-safe:animate-spin" />
            ) : (
              <Download aria-hidden className="size-5" />
            )}
            {busy ? t('generate.busy') : t('generate.button')}
          </Button>
          {nothing ? <p className="mt-2 text-sm text-amber-900">{t('generate.nothing')}</p> : null}
        </div>

        <div aria-live="polite" className="flex flex-col gap-2">
          {outcome?.kind === 'file' ? (
            <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-medium">
                {t('result.downloaded', {
                  name: outcome.result.filename,
                  size: formatBytes(outcome.result.bytes.length),
                })}
              </p>
              {outcome.where === 'fallback' ? <p>{t('result.fallback')}</p> : null}
              <Button
                variant="secondary"
                className="mt-2 min-h-9"
                onClick={() =>
                  downloadBytes(outcome.result.filename, outcome.result.mime, outcome.result.bytes)
                }
              >
                {t('result.again')}
              </Button>
            </div>
          ) : null}
          {outcome?.kind === 'link' ? (
            <div role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
              <p className="font-medium">
                {t('result.ready', {
                  name: outcome.link.filename,
                  size: formatBytes(outcome.link.bytes),
                })}
              </p>
              <p>
                {t('result.expires', {
                  time: new Date(outcome.link.expiresAt).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  }),
                })}
              </p>
              <Button asChild className="mt-2 min-h-11">
                <a href={outcome.link.url} download={outcome.link.filename}>
                  <Download aria-hidden className="size-4" />
                  {t('result.download')}
                </a>
              </Button>
            </div>
          ) : null}
          {failure ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
              {t(`errors.${failure}`)}
            </p>
          ) : null}
        </div>
      </Section>
    </div>
  )
}
