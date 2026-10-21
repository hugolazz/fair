import { ArrowLeft, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import { Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { AddCompanyDialog } from '@/features/manual-entry/add-company-dialog'
import {
  executeImport,
  fetchEventCompanyIds,
  fetchKnownCompanies,
  fetchKnownContacts,
  loadLastMapping,
} from '@/db/repositories/import'
import {
  ImportError,
  type ColumnMapping,
  type Decision,
  type ImportReport,
  type KnownCompany,
  type KnownContact,
  type RawTable,
  type StoredMapping,
} from '@/db/schemas/import'
import { useReadySession } from '@/features/auth-team/session'
import { cn } from '@/lib/cn'
import { newId } from '@/lib/ids'
import { defaultDecisions } from './lib/dedupe'
import { detectShowColumns, resolveMapping, toStoredMapping } from './lib/mapping'
import { buildTable } from './lib/parse'
import { buildPlan } from './lib/plan'
import type { Analysis, ParseInput } from './lib/runner'
import { StepMapping } from './step-mapping'
import { StepReport } from './step-report'
import { StepReview } from './step-review'
import { StepSource } from './step-source'
import { useImportWorker } from './use-import-worker'

type Stage = 'source' | 'mapping' | 'review' | 'importing' | 'report'
type Context = { known: KnownCompany[]; contacts: KnownContact[]; eventCompanyIds: Set<string> }

const STEPS = ['source', 'mapping', 'review', 'report'] as const

export default function ImportPage() {
  const { t } = useTranslation('import')
  const { t: tm } = useTranslation('manual')
  const [adding, setAdding] = useState(false)
  const [manualNotice, setManualNotice] = useState<string>()
  const { eventId = '' } = useParams()
  const { membership } = useReadySession()
  const worker = useImportWorker()

  const [stage, setStage] = useState<Stage>('source')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [fileName, setFileName] = useState('')
  const [grid, setGrid] = useState<string[][]>([])
  const [firstRowIsHeader, setFirstRowIsHeader] = useState(true)
  const [stored, setStored] = useState<StoredMapping | null>(null)
  const [table, setTable] = useState<RawTable>()
  const [mapping, setMapping] = useState<ColumnMapping>({})
  // Colonnes de salons cochées (croix = présent) : proposées d'office, décochables à l'étape des colonnes.
  const [showCols, setShowCols] = useState<number[]>([])
  const [restored, setRestored] = useState(0)
  const [context, setContext] = useState<Context>()
  const [analysis, setAnalysis] = useState<Analysis>()
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [batchId, setBatchId] = useState(newId)
  const [progress, setProgress] = useState<[number, number]>([0, 1])
  const [report, setReport] = useState<ImportReport>()

  const plan = useMemo(
    () =>
      analysis && context
        ? buildPlan({
            rows: analysis.rows,
            groups: analysis.groups,
            decisions,
            known: context.known,
            knownContacts: context.contacts,
            eventCompanyIds: context.eventCompanyIds,
            teamId: membership.teamId,
            eventId,
            batchId,
            newId,
          })
        : undefined,
    [analysis, context, decisions, membership.teamId, eventId, batchId],
  )

  const errorText = (e: unknown, fallback: string) =>
    e instanceof ImportError ? t(`errors.${e.code}`) : fallback

  async function onSource(input: ParseInput) {
    setBusy(true)
    setError(undefined)
    try {
      const [rawGrid, last] = await Promise.all([
        worker.parse(input),
        loadLastMapping(eventId).catch(() => null),
      ])
      const tbl = buildTable(rawGrid, true)
      const resolved = resolveMapping(tbl, last)
      setFileName(input.kind === 'file' ? input.name : '')
      setGrid(rawGrid)
      setStored(last)
      setFirstRowIsHeader(true)
      setTable(tbl)
      setMapping(resolved.mapping)
      setShowCols(detectShowColumns(tbl, resolved.mapping))
      setRestored(resolved.restored)
      setStage('mapping')
    } catch (e) {
      setError(errorText(e, t('errors.parse_failed')))
    } finally {
      setBusy(false)
    }
  }

  function onFirstRowIsHeader(value: boolean) {
    try {
      const tbl = buildTable(grid, value)
      const resolved = resolveMapping(
        tbl,
        stored && stored.firstRowIsHeader === value ? stored : null,
      )
      setFirstRowIsHeader(value)
      setTable(tbl)
      setMapping(resolved.mapping)
      setShowCols(detectShowColumns(tbl, resolved.mapping))
      setRestored(resolved.restored)
    } catch (e) {
      setError(errorText(e, t('errors.parse_failed')))
    }
  }

  async function onContinue() {
    if (!table) return
    setBusy(true)
    setError(undefined)
    try {
      let ctx: Context
      try {
        const [known, contacts, eventCompanyIds] = await Promise.all([
          fetchKnownCompanies(),
          fetchKnownContacts(),
          fetchEventCompanyIds(eventId),
        ])
        ctx = { known, contacts, eventCompanyIds }
      } catch {
        setError(t('errors.load'))
        return
      }
      // Une colonne devenue un champ (ou décochée) n'est plus une colonne de salon.
      const shows = detectShowColumns(table, mapping).filter((c) => showCols.includes(c))
      const result = await worker.analyze(table, mapping, shows, ctx.known)
      setContext(ctx)
      setAnalysis(result)
      setDecisions(defaultDecisions(result.groups))
      setStage('review')
    } catch (e) {
      setError(errorText(e, t('errors.parse_failed')))
    } finally {
      setBusy(false)
    }
  }

  async function onStart() {
    if (!plan || !analysis || !table) return
    setStage('importing')
    setProgress([0, 1])
    setError(undefined)
    try {
      const rawByRow = new Map(table.rowNumbers.map((n, i) => [n, table.rows[i]!]))
      const result = await executeImport({
        plan,
        teamId: membership.teamId,
        eventId,
        filename: fileName,
        mapping: toStoredMapping(table, mapping, firstRowIsHeader),
        cleaningErrors: analysis.errors,
        rawByRow,
        onProgress: (done, total) => setProgress([done, total]),
      })
      setReport(result)
      setStage('report')
    } catch {
      setError(t('errors.import'))
      setStage('review')
    }
  }

  function restart() {
    setStage('source')
    setError(undefined)
    setTable(undefined)
    setAnalysis(undefined)
    setContext(undefined)
    setReport(undefined)
    setBatchId(newId())
  }

  const current = stage === 'importing' ? 'review' : stage

  return (
    <div className="flex flex-col gap-6">
      <Link
        to={`/events/${eventId}`}
        className="text-brand-700 inline-flex min-h-11 items-center gap-2 text-sm font-medium"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <ol aria-label={t('steps.label')} className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={s === current ? 'step' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5',
              s === current ? 'bg-brand-600 font-medium text-white' : 'bg-slate-200 text-slate-800',
            )}
          >
            {i + 1}. {t(`steps.${s}`)}
          </li>
        ))}
      </ol>

      {stage === 'source' ? (
        <>
          <StepSource busy={busy} error={error} onSubmit={(i) => void onSource(i)} />
          <section
            aria-labelledby="manual-title"
            className="flex flex-col items-start gap-3 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h2 id="manual-title" className="text-base font-semibold">
              {tm('company.orManual')}
            </h2>
            <p className="text-sm text-slate-700">{tm('company.body')}</p>
            {manualNotice ? (
              <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
                {manualNotice}{' '}
                <Link
                  className="text-brand-700 font-medium underline"
                  to={`/events/${eventId}/participants`}
                >
                  {tm('company.seeParticipants')}
                </Link>
              </p>
            ) : null}
            <Button variant="secondary" onClick={() => setAdding(true)}>
              <Plus aria-hidden className="size-4" />
              {tm('company.open')}
            </Button>
          </section>
          <AddCompanyDialog
            eventId={eventId}
            open={adding}
            onOpenChange={setAdding}
            onAdded={(result, name) => setManualNotice(tm(`company.${result.status}`, { name }))}
          />
        </>
      ) : null}
      {stage === 'mapping' && table ? (
        <StepMapping
          table={table}
          mapping={mapping}
          restored={restored}
          firstRowIsHeader={firstRowIsHeader}
          busy={busy}
          error={error}
          onFirstRowIsHeader={onFirstRowIsHeader}
          showCols={showCols}
          onShowColsChange={setShowCols}
          onMappingChange={setMapping}
          onContinue={() => void onContinue()}
        />
      ) : null}
      {stage === 'review' && analysis && plan ? (
        <>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <StepReview
            analysis={analysis}
            plan={plan}
            decisions={decisions}
            onDecision={(id, d) => setDecisions((prev) => ({ ...prev, [id]: d }))}
            onBulk={(d) => setDecisions(Object.fromEntries(analysis.groups.map((g) => [g.id, d])))}
            onStart={() => void onStart()}
            onBack={() => setStage('mapping')}
          />
        </>
      ) : null}
      {stage === 'importing' ? (
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          <Loading />
          <progress
            aria-label={t('progress.label')}
            className="h-3 w-full"
            value={progress[0]}
            max={progress[1]}
          />
          <p className="text-sm text-slate-600">
            {t('progress.text', { done: progress[0], total: progress[1] })}
          </p>
        </div>
      ) : null}
      {stage === 'report' && report && table ? (
        <StepReport report={report} headers={table.headers} eventId={eventId} onRestart={restart} />
      ) : null}
    </div>
  )
}
