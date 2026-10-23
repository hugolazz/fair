import { Crop, ImagePlus, Trash2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { fetchTeamLogoUrl, removeTeamLogo, uploadTeamLogo } from '@/db/repositories/teams'
import { useAsync } from '@/lib/use-async'
import { LogoCropDialog } from './logo-crop-dialog'

/** Logo de l'équipe : affiché en haut de l'accueil et en en-tête des PDF d'export. Réservé aux administrateurs pour le modifier. */
export function TeamLogo({ teamId, canEdit }: { teamId: string; canEdit: boolean }) {
  const { t } = useTranslation('settings')
  const logo = useAsync(() => fetchTeamLogoUrl(teamId), [teamId])
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [cropping, setCropping] = useState(false)

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(false)
    try {
      await action()
      logo.reload()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="mt-2 font-medium">{t('logo.title')}</h3>
      <p className="text-sm text-slate-700">{t('logo.hint')}</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-40 items-center justify-center rounded-lg border border-slate-200 bg-white p-2">
          {logo.data ? (
            <img
              src={logo.data}
              alt={t('logo.alt')}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <span className="text-sm text-slate-600">{t('logo.none')}</span>
          )}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
              <ImagePlus aria-hidden className="size-4" />
              {logo.data ? t('logo.replace') : t('logo.upload')}
            </Button>
            {logo.data ? (
              <Button variant="secondary" disabled={busy} onClick={() => setCropping(true)}>
                <Crop aria-hidden className="size-4" />
                {t('logo.crop.open')}
              </Button>
            ) : null}
            {logo.data ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void run(() => removeTeamLogo(teamId))}
              >
                <Trash2 aria-hidden className="size-4" />
                {t('logo.remove')}
              </Button>
            ) : null}
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              tabIndex={-1}
              aria-label={t('logo.upload')}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void run(() => uploadTeamLogo(teamId, file))
              }}
            />
          </div>
        ) : null}
      </div>
      {cropping ? (
        <LogoCropDialog
          teamId={teamId}
          onClose={() => setCropping(false)}
          onSaved={() => {
            setCropping(false)
            logo.reload()
          }}
        />
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {t('logo.error')}
        </p>
      ) : null}
    </div>
  )
}
