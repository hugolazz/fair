import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { downloadTeamLogo, LOGO_MAX_BYTES, uploadTeamLogo } from '@/db/repositories/teams'
import {
  clampInsets,
  fitOutput,
  insetsToRect,
  NO_INSETS,
  padRect,
  rectToInsets,
  trimBounds,
  type Insets,
} from './lib/logo-crop'

type Loaded = { url: string; bitmap: ImageBitmap }
const SIDES: (keyof Insets)[] = ['left', 'top', 'right', 'bottom']

/** Recadrage du logo : quatre curseurs (un par bord) avec aperçu, et un rognage automatique des marges vides. */
export function LogoCropDialog({
  teamId,
  onClose,
  onSaved,
}: {
  teamId: string
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation('settings')
  const [loaded, setLoaded] = useState<Loaded>()
  const [insets, setInsets] = useState<Insets>(NO_INSETS)
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error' | 'saveError'>(
    'loading',
  )
  const urlRef = useRef<string>(undefined)
  const bitmapRef = useRef<ImageBitmap>(undefined)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const blob = await downloadTeamLogo(teamId)
        const bitmap = await createImageBitmap(blob)
        if (cancelled) return
        urlRef.current = URL.createObjectURL(blob)
        bitmapRef.current = bitmap
        setLoaded({ url: urlRef.current, bitmap })
        setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    })()
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      bitmapRef.current?.close()
    }
  }, [teamId])

  const rect = useMemo(
    () => (loaded ? insetsToRect(insets, loaded.bitmap.width, loaded.bitmap.height) : undefined),
    [insets, loaded],
  )

  function autoTrim() {
    if (!loaded) return
    const { bitmap } = loaded
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return
    ctx.drawImage(bitmap, 0, 0)
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data
    const bounds = trimBounds(data, bitmap.width, bitmap.height)
    if (bounds)
      setInsets(
        rectToInsets(padRect(bounds, bitmap.width, bitmap.height), bitmap.width, bitmap.height),
      )
  }

  async function save() {
    if (!loaded || !rect) return
    setState('saving')
    try {
      const out = fitOutput(rect.w, rect.h)
      const canvas = document.createElement('canvas')
      canvas.width = out.w
      canvas.height = out.h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas')
      ctx.drawImage(loaded.bitmap, rect.x, rect.y, rect.w, rect.h, 0, 0, out.w, out.h)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob || blob.size > LOGO_MAX_BYTES) throw new Error('too large')
      await uploadTeamLogo(teamId, new File([blob], 'logo.png', { type: 'image/png' }))
      onSaved()
    } catch {
      setState('saveError')
    }
  }

  const unchanged = SIDES.every((s) => insets[s] === 0)
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('logo.crop.title')}
      description={t('logo.crop.hint')}
    >
      {state === 'loading' ? (
        <p className="text-sm text-slate-700">{t('logo.crop.loading')}</p>
      ) : null}
      {state === 'error' ? (
        <p role="alert" className="text-sm text-red-700">
          {t('logo.crop.loadError')}
        </p>
      ) : null}
      {loaded ? (
        <div className="flex flex-col gap-4">
          {/* Aperçu : la zone conservée reste claire, le reste est assombri. Damier = transparence. */}
          <div
            className="relative mx-auto max-w-full overflow-hidden rounded-lg border border-slate-200 bg-[conic-gradient(#e5e5e5_25%,#fff_0_50%,#e5e5e5_0_75%,#fff_0)] bg-[length:16px_16px]"
            style={{
              aspectRatio: `${loaded.bitmap.width} / ${loaded.bitmap.height}`,
              maxHeight: '45dvh',
            }}
          >
            <img src={loaded.url} alt={t('logo.alt')} className="block size-full object-fill" />
            <div
              aria-hidden
              className="pointer-events-none absolute border border-white shadow-[0_0_0_9999px_rgb(0_0_0/0.5)]"
              style={{
                left: `${insets.left}%`,
                top: `${insets.top}%`,
                right: `${insets.right}%`,
                bottom: `${insets.bottom}%`,
              }}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {SIDES.map((side) => (
              <label key={side} className="flex flex-col gap-1 text-sm">
                <span>
                  {t(`logo.crop.${side}`)}{' '}
                  <span className="text-slate-600">({Math.round(insets[side])} %)</span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={45}
                  step={1}
                  className="min-h-11 w-full"
                  value={Math.round(insets[side])}
                  onChange={(e) =>
                    setInsets((cur) => clampInsets({ ...cur, [side]: Number(e.target.value) }))
                  }
                />
              </label>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={autoTrim}>
              {t('logo.crop.auto')}
            </Button>
            <Button variant="ghost" disabled={unchanged} onClick={() => setInsets(NO_INSETS)}>
              {t('logo.crop.reset')}
            </Button>
          </div>
          {state === 'saveError' ? (
            <p role="alert" className="text-sm text-red-700">
              {t('logo.crop.saveError')}
            </p>
          ) : null}
          <div className="flex flex-col gap-2">
            <Button disabled={state === 'saving' || unchanged} onClick={() => void save()}>
              {t('logo.crop.save')}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t('logo.crop.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" onClick={onClose}>
          {t('logo.crop.cancel')}
        </Button>
      )}
    </Dialog>
  )
}
