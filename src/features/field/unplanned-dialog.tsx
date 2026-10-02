import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InputField, TextareaField } from '@/components/ui/field'
import { createUnplanned, type FieldCtx } from '@/db/repositories/field'

type Props = { ctx: FieldCtx; onClose: () => void; onCreated: (targetId: string) => void }

/** Rencontre imprévue en 3 champs : entreprise (obligatoire), contact, note. Écrit en local, marche sans réseau. */
export function UnplannedDialog({ ctx, onClose, onCreated }: Props) {
  const { t } = useTranslation('field')
  const [company, setCompany] = useState('')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!company.trim()) {
      setError(t('unplanned.required'))
      return
    }
    setBusy(true)
    try {
      const { targetId } = await createUnplanned(ctx, {
        companyName: company,
        contactName: contact,
        note,
      })
      onCreated(targetId)
    } catch {
      setError(t('unplanned.error'))
      setBusy(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t('unplanned.title')}
      description={t('unplanned.help')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <InputField
          label={t('unplanned.company')}
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          error={error}
          autoFocus
          autoCapitalize="words"
          autoComplete="off"
          enterKeyHint="next"
        />
        <InputField
          label={t('unplanned.contact')}
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          autoCapitalize="words"
          autoComplete="off"
          enterKeyHint="next"
        />
        <TextareaField
          label={t('unplanned.note')}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button type="submit" disabled={busy} className="min-h-14 text-base">
          {t('unplanned.submit')}
        </Button>
      </form>
    </Dialog>
  )
}
