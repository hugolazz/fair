import { CheckCircle2, Download, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { ImportReport } from '@/db/schemas/import'
import { buildErrorsCsv } from './lib/errors-csv'
import { ErrorList } from './step-review'

type Props = { report: ImportReport; headers: string[]; eventId: string; onRestart: () => void }

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <dd className="text-2xl font-semibold tabular-nums">{value.toLocaleString('fr-FR')}</dd>
      <dt className="text-sm text-slate-600">{label}</dt>
    </div>
  )
}

export function StepReport({ report, headers, eventId, onRestart }: Props) {
  const { t } = useTranslation('import')
  const hasErrors = report.errors.length > 0

  function download() {
    const csv = buildErrorsCsv(
      report.errors,
      headers,
      { row: t('csv.row'), reason: t('csv.reason') },
      (e) => (e.message ? `${t(`errors.${e.code}`)} : ${e.message}` : t(`errors.${e.code}`)),
    )
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'fair-import-erreurs.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="flex flex-col gap-6" aria-labelledby="report-title">
      <div className="flex items-center gap-3">
        {hasErrors ? (
          <TriangleAlert aria-hidden className="size-6 text-amber-700" />
        ) : (
          <CheckCircle2 aria-hidden className="size-6 text-emerald-700" />
        )}
        <div>
          <h2 id="report-title" className="text-lg font-semibold">
            {t('report.title')}
          </h2>
          <p role="status" className="text-sm text-slate-700">
            {hasErrors ? t('report.partial') : t('report.done')}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t('report.imported')} value={report.rowsImported} />
        <Stat label={t('report.skipped')} value={report.skipped.length} />
        <Stat label={t('report.errors')} value={report.errors.length} />
        <Stat label={t('report.companiesCreated')} value={report.companiesCreated} />
        <Stat label={t('report.companiesMerged')} value={report.companiesMerged} />
        <Stat label={t('report.alreadyInEvent')} value={report.alreadyInEvent} />
        <Stat label={t('report.contactsCreated')} value={report.contactsCreated} />
        <Stat label={t('report.contactsLinked')} value={report.contactsLinked} />
      </dl>

      {hasErrors ? (
        <div className="flex flex-col gap-3">
          <div>
            <Button variant="secondary" onClick={download}>
              <Download aria-hidden className="size-4" />
              {t('report.exportErrors')}
            </Button>
          </div>
          <ErrorList errors={report.errors} />
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to={`/events/${eventId}`}>{t('back')}</Link>
        </Button>
        <Button variant="secondary" onClick={onRestart}>
          {t('report.newImport')}
        </Button>
      </div>
    </section>
  )
}
