import { ArrowLeft, Camera, Mic, MicOff, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Loading } from '@/components/page-states'
import {
  addPhoto,
  removePhoto,
  setCompanyTag,
  updateMeeting,
  type MeetingPatch,
} from '@/db/repositories/field'
import { db } from '@/db/local/db'
import { cn } from '@/lib/cn'
import { PriorityBadge } from '@/features/prepare/atoms'
import { InterestPicker, StatusButtons } from './field-atoms'
import { useFieldCtx } from './field-context'
import { compressImage } from './photo'
import { SyncBadge } from './sync-badge'
import { ThemeButton } from './theme-button'
import { useCompanyTags, useFiche } from './use-field-data'
import { useDictation } from './use-dictation'
import { useDraftNote } from './use-draft-note'

/** Photos de la rencontre : miniatures lues depuis le fichier stocké en local. */
function usePhotoUrls(ids: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = ids.join(',')
  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    void (async () => {
      const next: Record<string, string> = {}
      for (const id of key ? key.split(',') : []) {
        const b = await db.blobs.get(id)
        if (b) {
          const url = URL.createObjectURL(b.blob)
          created.push(url)
          next[id] = url
        }
      }
      if (!cancelled) setUrls(next)
    })()
    return () => {
      cancelled = true
      created.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [key])
  return urls
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-base font-semibold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-14 rounded-xl border-2 border-slate-300 bg-white px-3 text-lg"
        autoComplete="off"
      />
    </label>
  )
}

/** Champ structuré : saisie locale immédiate, enregistrement à chaque frappe (fusionné dans l'outbox). */
function StructuredFields({
  meeting,
  save,
}: {
  meeting: {
    need?: string | null
    budget?: string | null
    timing?: string | null
    decision_maker?: string | null
    next_step?: string | null
  }
  save: (p: MeetingPatch) => void
}) {
  const { t } = useTranslation('field')
  const [vals, setVals] = useState({
    need: meeting.need ?? '',
    budget: meeting.budget ?? '',
    timing: meeting.timing ?? '',
    decision_maker: meeting.decision_maker ?? '',
    next_step: meeting.next_step ?? '',
  })
  const set = (k: keyof typeof vals) => (v: string) => {
    setVals((s) => ({ ...s, [k]: v }))
    save({ [k]: v === '' ? null : v })
  }
  return (
    <div className="flex flex-col gap-3 pt-3">
      <Field label={t('fiche.need')} value={vals.need} onChange={set('need')} />
      <Field label={t('fiche.budget')} value={vals.budget} onChange={set('budget')} />
      <Field label={t('fiche.timing')} value={vals.timing} onChange={set('timing')} />
      <Field
        label={t('fiche.decisionMaker')}
        value={vals.decision_maker}
        onChange={set('decision_maker')}
      />
      <Field label={t('fiche.nextStep')} value={vals.next_step} onChange={set('next_step')} />
    </div>
  )
}

/**
 * Fiche rencontre. Le champ de note est actif dès l'ouverture : 1 tap (ouvrir la fiche) puis on écrit ou dicte,
 * sans bouton « enregistrer ». Tout est écrit en local à chaque modification.
 */
export default function FieldFiche() {
  const { t } = useTranslation('field')
  const ctx = useFieldCtx()
  const { targetId = '' } = useParams()
  const navigate = useNavigate()
  const fiche = useFiche(targetId, ctx.userId)
  const tags = useCompanyTags()
  const { text, setText, state } = useDraftNote(ctx, targetId)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const urls = usePhotoUrls((fiche?.photos ?? []).map((p) => p.id))

  const dictation = useDictation((spoken) => {
    if (spoken)
      setText(
        `${textRef.current?.value ? `${textRef.current.value.trimEnd()} ` : ''}${spoken}`,
        'dictated',
      )
  })

  if (fiche === undefined) return <Loading />
  if (fiche === null) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <p className="text-lg">{t('fiche.notFound')}</p>
        <Link
          to=".."
          className="mt-4 inline-flex min-h-14 items-center text-lg font-bold underline"
        >
          {t('back')}
        </Link>
      </div>
    )
  }

  const { target, company, meeting } = fiche
  const status = meeting?.status ?? 'to_see'
  const save = (patch: MeetingPatch) => void updateMeeting(ctx, targetId, patch)

  async function onPhoto(file: File | undefined) {
    if (!file) return
    const { blob, mime } = await compressImage(file)
    await addPhoto(ctx, targetId, blob, mime)
  }

  const micHint = dictation.error ? t(`dictation.${dictation.error}`) : null

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          type="button"
          onClick={() => navigate('..', { relative: 'path' })}
          aria-label={t('back')}
          className="inline-flex size-12 items-center justify-center rounded-full hover:bg-slate-100"
        >
          <ArrowLeft aria-hidden className="size-6" />
        </button>
        <PriorityBadge priority={target.priority} size="lg" />
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate text-xl leading-tight font-bold">{company?.name ?? '…'}</h1>
          <p className="truncate text-sm text-slate-700">
            {[
              target.stand_label && t('list.stand', { stand: target.stand_label }),
              company?.industry,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <SyncBadge eventId={ctx.eventId} />
        <ThemeButton />
      </header>

      <main className="flex flex-1 flex-col gap-5 px-3 py-4 pb-28">
        <section aria-labelledby="note-title" className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 id="note-title" className="text-lg font-bold">
              {t('fiche.note')}
            </h2>
            <span role="status" className="text-sm text-slate-700">
              {state === 'dirty'
                ? t('fiche.saving')
                : state === 'saved'
                  ? `${t('fiche.saved')} ✓`
                  : t('fiche.noteHint')}
            </span>
          </div>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('fiche.notePlaceholder')}
            aria-labelledby="note-title"
            rows={5}
            autoFocus
            autoCapitalize="sentences"
            spellCheck
            className="min-h-40 w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-lg leading-snug placeholder:text-slate-500"
          />
          {dictation.interim ? (
            <p className="px-1 text-base text-slate-700 italic">{dictation.interim}</p>
          ) : null}
          {micHint ? (
            <p role="alert" className="rounded-xl bg-amber-100 p-3 text-base text-amber-900">
              {micHint}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              aria-pressed={dictation.listening}
              onClick={() => {
                if (dictation.listening) return dictation.stop()
                dictation.start()
                textRef.current?.focus()
              }}
              className={cn(
                'flex min-h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 text-lg font-bold',
                dictation.listening
                  ? 'border-red-700 bg-red-700 text-white'
                  : 'border-slate-300 bg-white',
              )}
            >
              {dictation.listening ? (
                <MicOff aria-hidden className="size-6" />
              ) : (
                <Mic aria-hidden className="size-6" />
              )}
              {dictation.listening ? t('dictation.stop') : t('dictation.start')}
            </button>
            <button
              type="button"
              onClick={() => photoInput.current?.click()}
              className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-slate-300 bg-white text-lg font-bold"
            >
              <Camera aria-hidden className="size-6" />
              {t('fiche.photoAdd')}
            </button>
            <input
              ref={photoInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label={t('fiche.photo')}
              tabIndex={-1}
              onChange={(e) => {
                void onPhoto(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {fiche.photos.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {fiche.photos.map((p) => (
                <li key={p.id} className="relative">
                  {urls[p.id] ? (
                    <img
                      src={urls[p.id]}
                      alt={t('fiche.photoAlt')}
                      className="size-24 rounded-xl border-2 border-slate-300 object-cover"
                    />
                  ) : (
                    <div className="size-24 rounded-xl bg-slate-200" />
                  )}
                  <span className="absolute bottom-1 left-1 rounded bg-slate-900/80 px-1.5 text-xs font-semibold text-white">
                    {p.status === 'uploaded' ? t('fiche.photoSent') : t('fiche.photoPending')}
                  </span>
                  <button
                    type="button"
                    onClick={() => void removePhoto(p.id)}
                    aria-label={t('fiche.photoRemove')}
                    className="absolute -top-2 -right-2 inline-flex size-9 items-center justify-center rounded-full bg-red-700 text-white"
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section aria-label={t('status.label')}>
          <StatusButtons value={status} onChange={(s) => save({ status: s })} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{t('fiche.interest')}</h2>
          <InterestPicker
            value={meeting?.interest ?? null}
            onChange={(n) => save({ interest: n })}
          />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{t('fiche.tags')}</h2>
          {tags.length === 0 ? <p className="text-slate-700">{t('fiche.noTags')}</p> : null}
          <div role="group" aria-label={t('fiche.tags')} className="flex flex-wrap gap-2">
            {tags.map((tag) => {
              const on = fiche.tagIds.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => void setCompanyTag(ctx.teamId, target.company_id, tag.id, !on)}
                  className={cn(
                    'inline-flex min-h-14 items-center gap-2 rounded-full border-2 px-5 text-base font-bold',
                    on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-3 rounded-full"
                    style={{ backgroundColor: tag.color ?? '#475569' }}
                  />
                  {tag.label}
                </button>
              )
            })}
          </div>
        </section>

        <details className="rounded-2xl border-2 border-slate-300 bg-white px-4 py-3">
          <summary className="min-h-11 cursor-pointer text-lg font-bold">
            {t('fiche.details')}
          </summary>
          <StructuredFields key={meeting?.id ?? 'new'} meeting={meeting ?? {}} save={save} />
        </details>

        {fiche.notes.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-lg font-bold">{t('fiche.previousNotes')}</h2>
            <ul className="flex flex-col gap-2">
              {fiche.notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-base whitespace-pre-wrap"
                >
                  {n.body}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-slate-50 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-xl">
          <button
            type="button"
            onClick={() => navigate('..', { relative: 'path' })}
            className="bg-brand-600 active:bg-brand-700 min-h-16 w-full rounded-2xl text-xl font-bold text-white"
          >
            {t('fiche.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
