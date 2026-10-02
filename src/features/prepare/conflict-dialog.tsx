import { TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import type { Conflict } from './lib/misc'

type Props = {
  /** Commercial qu'on essaie d'assigner. */
  userName: string
  conflicts: Conflict[]
  nameOf: (userId: string) => string
  onResolve: (choice: 'add' | 'replace' | 'skip' | 'cancel') => void
}

const SHOWN = 8

/** Alerte quand une assignation vise des entreprises déjà ciblées par un autre commercial. */
export function ConflictDialog({ userName, conflicts, nameOf, onResolve }: Props) {
  const { t } = useTranslation('prepare')
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onResolve('cancel')}
      title={t('assign.conflictTitle')}
      description={t('assign.conflictBody', { count: conflicts.length, name: userName })}
    >
      <div className="mb-4 flex gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
        <ul className="flex flex-col gap-1">
          {conflicts.slice(0, SHOWN).map((c) => (
            <li key={c.target.id}>
              {t('assign.conflictItem', {
                name: c.target.name,
                others: c.others.map(nameOf).join(', '),
              })}
            </li>
          ))}
          {conflicts.length > SHOWN ? (
            <li>{t('assign.more', { count: conflicts.length - SHOWN })}</li>
          ) : null}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <Button onClick={() => onResolve('add')}>
          {t('assign.addAnyway')}
          <span className="text-xs font-normal opacity-90">— {t('assign.addAnywayHint')}</span>
        </Button>
        <Button variant="secondary" onClick={() => onResolve('replace')}>
          {t('assign.replace')}
          <span className="text-xs font-normal text-slate-600">— {t('assign.replaceHint')}</span>
        </Button>
        <Button variant="secondary" onClick={() => onResolve('skip')}>
          {t('assign.skipConflicts')}
        </Button>
        <Button variant="ghost" onClick={() => onResolve('cancel')}>
          {t('assign.cancel')}
        </Button>
      </div>
    </Dialog>
  )
}
