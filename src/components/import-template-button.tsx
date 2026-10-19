import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { downloadBytes } from '@/lib/download'

/** Télécharge un classeur d'import vide : seulement les intitulés de colonnes attendus (généré dans le navigateur, chargé à la demande). */
export function ImportTemplateButton({ variant = 'ghost' }: { variant?: 'ghost' | 'secondary' }) {
  const { t } = useTranslation('import')
  const [error, setError] = useState(false)

  async function download() {
    setError(false)
    try {
      const { buildImportTemplate } = await import('@shared/exports/template.ts')
      const r = await buildImportTemplate()
      downloadBytes(r.filename, r.mime, r.bytes)
    } catch {
      setError(true)
    }
  }

  return (
    <>
      <Button variant={variant} onClick={() => void download()}>
        <Download aria-hidden className="size-4" />
        {t('source.template')}
      </Button>
      {error ? (
        <p role="alert" className="w-full text-center text-sm text-red-700">
          {t('source.templateError')}
        </p>
      ) : null}
    </>
  )
}
