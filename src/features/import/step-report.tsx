import { CheckCircle2, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { ImportReport } from '@/db/schemas/import'
import { buildErrorsCsv } from './lib/errors-csv'
import { summaryText } from './lib/summary'
import { ErrorList, Stat } from './step-review'

type Props = { report: ImportReport; headers: string[]; eventId: string; onRestart: () => void }

/**
 * Résultat de l'import. Toujours présenté comme une réussite (coche verte) : les lignes qui n'ont pas pu être importées
 * ne sont qu'une note, à récupérer si on veut, jamais une alerte.
 */
export function StepReport({ report, headers, eventId, onRestart }: Props) {
  const { t } = useTranslation('import')
  const left = report.errors.length

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
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden className="mt-0.5 size-7 shrink-0 text-emerald-700" />
        <div>
          <h2 id="report-title" className="text-lg font-semibold">
            {t('report.title')}
          </h2>
          <p role="status" className="text-xl leading-snug font-medium">
            {summaryText(
              t,
              report.companiesCreated + report.companiesMerged,
              report.contactsCreated,
              'report',
            )}
          </p>
        </div>
      </div>

      {left > 0 ? (
        <div className="flex flex-col gap-3 rounded-xl bg-slate-100 p-4">
          <p className="text-sm text-slate-800">{t('report.leftAside', { count: left })}</p>
          <div>
            <Button variant="secondary" onClick={download}>
              <Download aria-hidden className="size-4" />
              {t('report.exportErrors')}
            </Button>
          </div>
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm text-slate-700">
              {t('report.seeLines')}
            </summary>
            <div className="pt-2">
              <ErrorList errors={report.errors} />
            </div>
          </details>
        </div>
      ) : null}

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-slate-700">
          {t('report.detail')}
        </summary>
        <dl className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-4">
          <Stat label={t('report.imported')} value={report.rowsImported} />
          <Stat label={t('report.skipped')} value={report.skipped.length} />
          <Stat label={t('report.errors')} value={left} />
          <Stat label={t('report.companiesCreated')} value={report.companiesCreated} />
          <Stat label={t('report.companiesMerged')} value={report.companiesMerged} />
          <Stat label={t('report.alreadyInEvent')} value={report.alreadyInEvent} />
          <Stat label={t('report.contactsCreated')} value={report.contactsCreated} />
          <Stat label={t('report.contactsLinked')} value={report.contactsLinked} />
        </dl>
      </details>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link to={`/events/${eventId}/participants`}>{t('report.validate')}</Link>
        </Button>
        <Button variant="secondary" onClick={onRestart}>
          {t('report.newImport')}
        </Button>
      </div>
    </section>
  )
}
