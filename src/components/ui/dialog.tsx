import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}

export function Dialog({ open, onOpenChange, title, description, children }: Props) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Au-dessus d'une fiche ouverte (z-50) : le fond sombre doit aussi la recouvrir. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-slate-950/70" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-[70] max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl md:inset-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-[1.625rem] leading-[1.15] font-medium tracking-[-0.02em]">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-slate-600">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              className="-m-2 inline-flex size-11 items-center justify-center rounded-full text-slate-600 transition-colors duration-200 hover:bg-slate-100"
              aria-label={t('actions.close')}
            >
              <X aria-hidden className="size-5" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
