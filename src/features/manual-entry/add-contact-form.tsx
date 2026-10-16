import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { addContact } from '@/db/repositories/targets'
import type { TargetContact } from '@/db/schemas/prepare'
import { ContactFields } from './contact-fields'
import {
  emptyContactForm,
  validateContact,
  type ContactErrors,
  type ContactForm,
} from './lib/manual'

type Props = {
  teamId: string
  companyId: string
  /** Contacts déjà connus de l'entreprise : un même e-mail ou un même nom n'est pas ajouté deux fois. */
  existing: readonly TargetContact[]
  onSaved: (contact: TargetContact) => void
  onCancel: () => void
}

/** Ajout d'un contact à une entreprise : prénom, nom, poste, e-mail, téléphone et LinkedIn, chacun dans sa case. */
export function AddContactForm({ teamId, companyId, existing, onSaved, onCancel }: Props) {
  const { t } = useTranslation('manual')
  const [form, setForm] = useState<ContactForm>(emptyContactForm)
  const [errors, setErrors] = useState<ContactErrors>()
  const [problem, setProblem] = useState<'error' | 'duplicate'>()
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    e.stopPropagation()
    setProblem(undefined)
    const v = validateContact(form)
    setErrors(v.errors)
    if (!v.value) return
    const c = v.value
    const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ').toLowerCase()
    const duplicate = existing.some(
      (x) =>
        (c.email && x.email.toLowerCase() === c.email.toLowerCase()) ||
        (fullName && x.name.toLowerCase() === fullName),
    )
    if (duplicate) {
      setProblem('duplicate')
      return
    }
    setBusy(true)
    try {
      onSaved(await addContact(teamId, companyId, c))
    } catch {
      setProblem('error')
      setBusy(false)
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => void submit(e)}
      aria-label={t('addContact.title')}
      className="flex flex-col gap-3 rounded-xl border border-slate-300 bg-white p-3"
    >
      <h4 className="text-sm font-semibold">{t('addContact.title')}</h4>
      <ContactFields value={form} errors={errors} onChange={setForm} />
      {problem ? (
        <p role="alert" className="text-sm text-red-700">
          {t(problem === 'duplicate' ? 'addContact.duplicate' : 'addContact.error')}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy} className="min-h-12 flex-1">
          {t('addContact.save')}
        </Button>
        <Button variant="secondary" className="min-h-12" onClick={onCancel}>
          {t('addContact.cancel')}
        </Button>
      </div>
    </form>
  )
}
