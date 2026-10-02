import { FileSpreadsheet, Upload } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { TextareaField } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import type { ParseInput } from './lib/runner'

type Props = {
  busy: boolean
  error: string | undefined
  onSubmit: (input: ParseInput) => void
}

export function StepSource({ busy, error, onSubmit }: Props) {
  const { t } = useTranslation('import')
  const [file, setFile] = useState<File>()
  const [paste, setPaste] = useState('')
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function submit() {
    if (file) onSubmit({ kind: 'file', name: file.name, buffer: await file.arrayBuffer() })
    else if (paste.trim()) onSubmit({ kind: 'paste', text: paste })
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) {
      setFile(dropped)
      setPaste('')
    }
  }

  return (
    <section className="flex flex-col gap-5" aria-labelledby="source-title">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-white px-6 py-10 text-center',
          dragging ? 'border-brand-600 bg-brand-50' : 'border-slate-300',
        )}
      >
        <FileSpreadsheet aria-hidden className="size-10 text-slate-500" />
        <h2 id="source-title" className="text-lg font-semibold">
          {t('source.fileTitle')}
        </h2>
        <p className="max-w-md text-sm text-slate-600">{t('source.fileHelp')}</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.txt,.xlsx,.xls,text/csv"
          className="sr-only"
          aria-label={t('source.chooseFile')}
          onChange={(e) => {
            setFile(e.target.files?.[0])
            setPaste('')
          }}
        />
        <Button variant="secondary" onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden className="size-4" />
          {t('source.chooseFile')}
        </Button>
        <p className="text-sm text-slate-600">{t('source.dropHere')}</p>
        {file ? (
          <p role="status" className="text-sm font-medium">
            {t('source.selected', { name: file.name })}
          </p>
        ) : null}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{t('source.orPaste')}</p>
        <TextareaField
          label={t('source.pasteLabel')}
          placeholder={t('source.pastePlaceholder')}
          rows={6}
          value={paste}
          onChange={(e) => {
            setPaste(e.target.value)
            if (e.target.value) setFile(undefined)
          }}
          className="font-mono text-sm"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div>
        <Button disabled={busy || (!file && !paste.trim())} onClick={() => void submit()}>
          {busy ? t('source.analyzing') : t('source.analyze')}
        </Button>
      </div>
    </section>
  )
}
