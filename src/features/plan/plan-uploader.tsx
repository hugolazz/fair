import { FileUp, Loader2 } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { createPlan, type PlanCtx } from '@/db/repositories/plans'
import { cn } from '@/lib/cn'
import { isPdf, PlanFileError, prepareFloorplanImage } from './plan-file'

type Props = {
  ctx: PlanCtx
  onCreated: (planId: string) => void
  /** `zone` : grande zone de dépôt (aucun plan) ; `button` : simple bouton (ajouter un autre plan). */
  variant?: 'zone' | 'button'
}

/**
 * Ajout d'un plan : image ou PDF (première page convertie en image). L'image est optimisée dans le navigateur
 * puis envoyée dans le stockage privé de l'équipe.
 */
export function PlanUploader({ ctx, onCreated, variant = 'zone' }: Props) {
  const { t } = useTranslation('plan')
  const input = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<{ busy: false } | { busy: true; pdf: boolean }>({
    busy: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  async function handle(file: File | undefined) {
    if (!file) return
    setError(null)
    setState({ busy: true, pdf: isPdf(file) })
    try {
      const image = await prepareFloorplanImage(file)
      const name = file.name.replace(/\.[^.]+$/, '').trim() || t('defaultName')
      onCreated(await createPlan(ctx, name, image))
    } catch (e) {
      setError(e instanceof PlanFileError ? e.reason : 'generic')
    } finally {
      setState({ busy: false })
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    void handle(e.dataTransfer.files[0])
  }

  const busy = state.busy
  const picker = (
    <>
      <Button
        variant={variant === 'zone' ? 'primary' : 'secondary'}
        disabled={busy}
        onClick={() => input.current?.click()}
        className={variant === 'zone' ? 'min-h-12' : undefined}
      >
        {busy ? (
          <Loader2 aria-hidden className="size-4 motion-safe:animate-spin" />
        ) : (
          <FileUp aria-hidden className="size-4" />
        )}
        {variant === 'zone' ? t('upload.button') : t('upload.another')}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label={t('upload.button')}
        onChange={(e) => {
          void handle(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )

  const status = (
    <>
      {busy ? (
        <p role="status" className="text-sm text-slate-700">
          {state.pdf ? t('upload.convertingPdf') : t('upload.processing')}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-900">
          {t(`upload.errors.${error}`)}
        </p>
      ) : null}
    </>
  )

  if (variant === 'button') {
    return (
      <div className="flex flex-col gap-2">
        {picker}
        {status}
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed bg-white px-6 py-12 text-center',
        dragging ? 'border-brand-600 bg-brand-50' : 'border-slate-300',
      )}
    >
      <h2 className="text-lg font-semibold">{t('empty.title')}</h2>
      <p className="max-w-md text-slate-700">{t('empty.bodyEdit')}</p>
      {picker}
      <p className="text-sm text-slate-600">{t('upload.hint')}</p>
      {status}
    </div>
  )
}
