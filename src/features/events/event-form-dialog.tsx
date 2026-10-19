import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { InputField, TextareaField } from '@/components/ui/field'
import { emptyEventForm, eventFormSchema, type EventFormValues } from '@/db/schemas/event'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  initialValues?: EventFormValues
  onSubmit: (values: EventFormValues) => Promise<void>
}

export function EventFormDialog({ open, onOpenChange, title, initialValues, onSubmit }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title}>
      {/* Le contenu est démonté à la fermeture : le formulaire repart des valeurs initiales. */}
      <EventForm
        initialValues={initialValues}
        onClose={() => onOpenChange(false)}
        onSubmit={onSubmit}
      />
    </Dialog>
  )
}

type FormProps = {
  initialValues: EventFormValues | undefined
  onClose: () => void
  onSubmit: (values: EventFormValues) => Promise<void>
}

function EventForm({ initialValues, onClose, onSubmit }: FormProps) {
  const { t } = useTranslation('events')
  const { t: tc } = useTranslation()
  const [submitError, setSubmitError] = useState<string>()
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: initialValues ?? emptyEventForm,
  })

  const err = (key: keyof EventFormValues) => {
    const message = errors[key]?.message
    return message ? t(message) : undefined
  }

  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(async (values) => {
          try {
            setSubmitError(undefined)
            await onSubmit(values)
            onClose()
          } catch {
            setSubmitError(t('errors.save'))
          }
        })}
      >
        <InputField
          label={t('fields.name')}
          placeholder={t('fields.namePlaceholder')}
          error={err('name')}
          {...register('name')}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label={t('fields.startsOn')}
            type="date"
            error={err('startsOn')}
            {...register('startsOn')}
          />
          <InputField
            label={t('fields.endsOn')}
            type="date"
            error={err('endsOn')}
            {...register('endsOn')}
          />
        </div>
        <InputField
          label={t('fields.venue')}
          placeholder={t('fields.venuePlaceholder')}
          {...register('venue')}
        />
        <InputField label={t('fields.city')} {...register('city')} />
        <TextareaField
          label={t('fields.goals')}
          placeholder={t('fields.goalsPlaceholder')}
          {...register('goals')}
        />
        {submitError ? (
          <p role="alert" className="text-sm text-red-700">
            {submitError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {tc('actions.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {tc('actions.save')}
          </Button>
        </div>
      </form>
    </>
  )
}
