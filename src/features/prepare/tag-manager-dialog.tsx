import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { TAG_COLORS, type Tag } from '@/db/schemas/prepare'
import { cn } from '@/lib/cn'
import type { TargetsApi } from './use-targets'

function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (c: string) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {TAG_COLORS.map((c) => (
        <label
          key={c}
          className="flex size-9 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:outline-2"
        >
          <input
            type="radio"
            className="sr-only"
            name={`color-${label}`}
            checked={value === c}
            onChange={() => onChange(c)}
          />
          <span
            aria-hidden
            className={cn(
              'size-6 rounded-full',
              value === c && 'ring-2 ring-slate-900 ring-offset-2',
            )}
            style={{ backgroundColor: c }}
          />
        </label>
      ))}
    </div>
  )
}

function Row({ tag, api, tags }: { tag: Tag; api: TargetsApi; tags: Tag[] }) {
  const { t } = useTranslation('prepare')
  const { t: tc } = useTranslation()
  const [label, setLabel] = useState(tag.label)
  const [confirming, setConfirming] = useState(false)
  const [duplicate, setDuplicate] = useState(false)

  function commit(nextLabel: string, color: string) {
    const clean = nextLabel.trim()
    if (!clean) {
      setLabel(tag.label)
      return
    }
    if (tags.some((x) => x.id !== tag.id && x.label.toLowerCase() === clean.toLowerCase())) {
      setDuplicate(true)
      setLabel(tag.label)
      return
    }
    setDuplicate(false)
    if (clean !== tag.label || color !== tag.color) void api.actions.updateTag(tag.id, clean, color)
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2">
      <div className="flex items-center gap-2">
        <input
          aria-label={t('tagManager.rename', { label: tag.label })}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => commit(label, tag.color)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3"
        />
        <ColorPicker
          value={tag.color}
          onChange={(c) => commit(label, c)}
          label={`${t('tagManager.color')} ${tag.label}`}
        />
        <Button
          variant="ghost"
          aria-label={t('tagManager.delete', { label: tag.label })}
          onClick={() => setConfirming(true)}
        >
          <Trash2 aria-hidden className="size-4" />
        </Button>
      </div>
      {duplicate ? (
        <p role="alert" className="text-sm text-red-700">
          {t('tagManager.duplicate')}
        </p>
      ) : null}
      {confirming ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded bg-red-50 p-2 text-sm"
        >
          <span className="flex-1">{t('tagManager.confirmDelete', { label: tag.label })}</span>
          <Button
            variant="danger"
            className="min-h-9"
            onClick={() => void api.actions.removeTag(tag.id)}
          >
            {tc('actions.delete')}
          </Button>
          <Button variant="secondary" className="min-h-9" onClick={() => setConfirming(false)}>
            {t('assign.cancel')}
          </Button>
        </div>
      ) : null}
    </li>
  )
}

/** Création, renommage, couleur et suppression des tags de l'équipe. */
export function TagManagerDialog({
  open,
  onOpenChange,
  api,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  api: TargetsApi
}) {
  const { t } = useTranslation('prepare')
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string>(TAG_COLORS[0])
  const [error, setError] = useState<string>()

  async function add() {
    const clean = label.trim()
    if (!clean) return
    if (api.tags.some((x) => x.label.toLowerCase() === clean.toLowerCase())) {
      setError(t('tagManager.duplicate'))
      return
    }
    const tag = await api.actions.createTag(clean, color)
    if (tag) {
      setLabel('')
      setError(undefined)
    } else setError(t('tagManager.error'))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('tagManager.title')}
      description={t('tagManager.help')}
    >
      <ul className="mb-4 flex max-h-[45dvh] flex-col gap-2 overflow-y-auto">
        {api.tags.map((tag) => (
          <Row key={tag.id} tag={tag} api={api} tags={api.tags} />
        ))}
      </ul>
      <form
        className="flex flex-col gap-2 border-t border-slate-200 pt-3"
        onSubmit={(e) => {
          e.preventDefault()
          void add()
        }}
      >
        <div className="flex items-center gap-2">
          <input
            aria-label={t('tagManager.new')}
            placeholder={t('tagManager.new')}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3"
          />
          <ColorPicker value={color} onChange={setColor} label={t('tagManager.color')} />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div>
          <Button type="submit">{t('tagManager.add')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
