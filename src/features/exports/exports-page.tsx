import { Download, FileSpreadsheet, FileText, Loader2, Table2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ExportKind } from '@shared/exports/service.ts'
import { ErrorState, Loading } from '@/components/page-states'
import { Button } from '@/components/ui/button'
import { useEvent } from '@/features/events/event-context'
import { cn } from '@/lib/cn'
import { downloadBytes } from './download'
import { useExportData } from './use-export-data'

type Format = Exclude<ExportKind, 'pdf-bilan'>

const FORMATS: { kind: Format; icon: React.ReactNode }[] = [
  { kind: 'xlsx', icon: <FileSpreadsheet className="size-6" /> },
  { kind: 'csv', icon: <Table2 className="size-6" /> },
  { kind: 'pdf', icon: <FileText className="size-6" /> },
]

/** Export du salon : le fichier importé, enrichi de tout ce qui s'est passé pendant le salon. Trois formats, aucun réglage. */
export default function ExportsPage() {
  const { t } = useTranslation('exports')
  const { event } = useEvent()
  const { data, error, loading, reload } = useExportData(event.id)
  const [kind, setKind] = useState<Format>('xlsx')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  if (loading && !data) return <Loading />
  if (error || !data) return <ErrorState message={t('errors.load')} onRetry={reload} />

  const empty = data.targets.length === 0
  const contacts = data.contacts.length

  async function generate() {
    setBusy(true)
    setDone(null)
    setFailed(false)
    try {
      // Les bibliothèques Excel et PDF ne sont chargées qu'à ce moment.
      const { generateExport } = await import('@shared/exports/service.ts')
      const r = await generateExport(data!, kind)
      downloadBytes(r.filename, r.mime, r.bytes)
      setDone(r.filename)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold">{t('title')}</h2>
        <p className="text-sm text-slate-700">{t('subtitle')}</p>
        <p className="mt-1 text-sm text-slate-700">
          {t('summary', { companies: data.targets.length, contacts })}
        </p>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">{t('format.title')}</legend>
        {FORMATS.map((f) => (
          <label
            key={f.kind}
            className={cn(
              'flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
              kind === f.kind
                ? 'border-brand-600 bg-brand-50'
                : 'border-slate-200 bg-white hover:bg-slate-50',
            )}
          >
            <input
              type="radio"
              name="format"
              checked={kind === f.kind}
              onChange={() => setKind(f.kind)}
              className="sr-only"
            />
            <span aria-hidden className="text-brand-700 mt-0.5">
              {f.icon}
            </span>
            <span>
              <span className="block font-semibold">{t(`format.${f.kind}`)}</span>
              <span className="block text-sm text-slate-700">{t(`format.${f.kind}Body`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {empty ? (
        <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm text-slate-800">
          {t('generate.nothing')}
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {t('errors.generic')}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">
          {t('result.downloaded', { name: done })}
        </p>
      ) : null}

      <div>
        <Button className="min-h-12" disabled={busy || empty} onClick={() => void generate()}>
          {busy ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Download aria-hidden className="size-4" />
          )}
          {busy ? t('generate.busy') : t('generate.button')}
        </Button>
      </div>
    </div>
  )
}
