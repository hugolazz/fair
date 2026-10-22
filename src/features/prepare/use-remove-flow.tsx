import { TriangleAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { Target } from '@/db/schemas/prepare'
import type { TargetsApi } from './use-targets'

const SHOWN = 6

type Step = 'confirm' | 'data'

/**
 * Retrait de participants du salon, avec garde-fous : une première confirmation, puis une seconde, plus appuyée, si des
 * entreprises ont déjà des rencontres ou des notes saisies (elles partent avec la participation).
 */
export function useRemoveFlow(
  api: TargetsApi,
  targets: Target[] | undefined,
  onDone: (count: number) => void,
): { request: (ids: string[]) => void; dialog: ReactNode } {
  const { t } = useTranslation('prepare')
  const [pending, setPending] = useState<{ ids: string[]; step: Step }>()

  const withData = (ids: string[]) => {
    const set = new Set(ids)
    return (targets ?? []).filter((x) => set.has(x.id) && x.meetings.length > 0)
  }
  const close = () => setPending(undefined)
  const confirm = async () => {
    if (!pending) return
    const { ids, step } = pending
    if (step === 'confirm' && withData(ids).length > 0) {
      setPending({ ids, step: 'data' })
      return
    }
    close()
    if (await api.actions.remove(ids)) onDone(ids.length)
  }

  let dialog: ReactNode = null
  if (pending) {
    const entered = pending.step === 'data' ? withData(pending.ids) : []
    dialog = (
      <Dialog
        open
        onOpenChange={(open) => !open && close()}
        title={
          pending.step === 'data'
            ? t('remove.dataTitle')
            : t('remove.title', { count: pending.ids.length })
        }
        description={
          pending.step === 'data'
            ? t('remove.dataBody', { count: entered.length })
            : t('remove.body', { count: pending.ids.length })
        }
      >
        {pending.step === 'data' ? (
          <div className="mb-4 flex gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
            <ul className="flex flex-col gap-1">
              {entered.slice(0, SHOWN).map((x) => (
                <li key={x.id}>{x.name}</li>
              ))}
              {entered.length > SHOWN ? (
                <li>{t('remove.more', { count: entered.length - SHOWN })}</li>
              ) : null}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-col gap-2">
          <Button variant="danger" onClick={() => void confirm()}>
            {pending.step === 'data' ? t('remove.confirmData') : t('remove.confirm')}
          </Button>
          <Button variant="ghost" onClick={close}>
            {t('remove.cancel')}
          </Button>
        </div>
      </Dialog>
    )
  }
  return {
    request: (ids) => ids.length > 0 && setPending({ ids, step: 'confirm' }),
    dialog,
  }
}
