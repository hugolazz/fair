import { Pencil, Trash2, UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { deleteContact, updateContact } from '@/db/repositories/targets'
import type { TargetContact } from '@/db/schemas/prepare'
import { AddContactForm } from '@/features/manual-entry/add-contact-form'
import { ContactFields } from '@/features/manual-entry/contact-fields'
import {
  validateContact,
  type ContactErrors,
  type ContactForm,
} from '@/features/manual-entry/lib/manual'

type Props = {
  teamId: string
  companyId: string
  contacts: readonly TargetContact[]
  /** Appelé après chaque ajout, modification ou suppression : la fiche recharge ses contacts. */
  onChanged: () => void
  /** Droit « modifier les fiches entreprise et leurs contacts » : sans lui, on peut seulement en ajouter. */
  canEdit: boolean
}

const toForm = (c: TargetContact): ContactForm => {
  const [firstName = '', ...rest] = c.name.split(' ')
  return {
    firstName,
    lastName: rest.join(' '),
    jobTitle: c.jobTitle,
    email: c.email,
    phone: c.phone,
    linkedin: c.linkedin,
  }
}

/** Contacts d'une entreprise : modifier, supprimer ou ajouter, chaque information dans sa case. */
export function ContactsEditor({ teamId, companyId, contacts, onChanged, canEdit }: Props) {
  const { t } = useTranslation('prepare')
  const { t: tm } = useTranslation('manual')
  const [editing, setEditing] = useState<string>()
  const [deleting, setDeleting] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<ContactForm>()
  const [errors, setErrors] = useState<ContactErrors>()
  const [failed, setFailed] = useState(false)

  function startEdit(c: TargetContact) {
    setEditing(c.id)
    setForm(toForm(c))
    setErrors(undefined)
    setFailed(false)
  }

  async function saveEdit(e: FormEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!form) return
    const v = validateContact(form)
    setErrors(v.errors)
    if (!v.value) return
    try {
      await updateContact(id, v.value)
      setEditing(undefined)
      onChanged()
    } catch {
      setFailed(true)
    }
  }

  async function remove(id: string) {
    try {
      await deleteContact(id)
      setDeleting(undefined)
      onChanged()
    } catch {
      setFailed(true)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {contacts.length === 0 ? (
        <p className="text-sm text-slate-600">{t('sheet.noContacts')}</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {contacts.map((c) => (
          <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            {editing === c.id && form ? (
              <form
                noValidate
                aria-label={t('edit.editContact', { name: c.name || c.email })}
                onSubmit={(e) => void saveEdit(e, c.id)}
                className="flex flex-col gap-3"
              >
                <ContactFields value={form} errors={errors} onChange={setForm} />
                <div className="flex gap-2">
                  <Button type="submit" className="min-h-11 flex-1">
                    {tm('addContact.save')}
                  </Button>
                  <Button variant="secondary" onClick={() => setEditing(undefined)}>
                    {tm('addContact.cancel')}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <p className="text-base font-medium">{c.name || c.email}</p>
                {c.jobTitle ? <p className="text-slate-700">{c.jobTitle}</p> : null}
                <p className="break-all text-slate-700">
                  {[c.email, c.phone, c.linkedin].filter(Boolean).join(' · ')}
                </p>
                {deleting === c.id ? (
                  <div role="alert" className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t('edit.confirmDeleteContact')}</span>
                    <Button variant="danger" className="min-h-11" onClick={() => void remove(c.id)}>
                      {t('edit.yesDelete')}
                    </Button>
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      onClick={() => setDeleting(undefined)}
                    >
                      {tm('addContact.cancel')}
                    </Button>
                  </div>
                ) : canEdit ? (
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      className="min-h-11"
                      aria-label={t('edit.editContact', { name: c.name || c.email })}
                      onClick={() => startEdit(c)}
                    >
                      <Pencil aria-hidden className="size-4" />
                      {t('planning.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      className="min-h-11"
                      aria-label={t('edit.deleteContact', { name: c.name || c.email })}
                      onClick={() => setDeleting(c.id)}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      {t('planning.remove')}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="text-sm text-red-700">
          {tm('addContact.error')}
        </p>
      ) : null}
      {adding ? (
        <AddContactForm
          teamId={teamId}
          companyId={companyId}
          existing={contacts}
          onSaved={() => {
            setAdding(false)
            onChanged()
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div>
          <Button variant="secondary" className="min-h-11" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden className="size-4" />
            {tm('addContact.button')}
          </Button>
        </div>
      )}
    </div>
  )
}
