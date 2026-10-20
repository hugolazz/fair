import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { Decision, DuplicateGroup, ImportPlan, RowError } from '@/db/schemas/import'
import type { Analysis } from './lib/runner'
import { summaryText } from './lib/summary'

type Props = {
  analysis: Analysis
  plan: ImportPlan
  decisions: Record<string, Decision>
  onDecision: (groupId: string, decision: Decision) => void
  onBulk: (decision: Decision) => void
  onStart: () => void
  onBack: () => void
}

const DECISIONS: Decision[] = ['merge', 'skip', 'create']
const MAX_GROUPS_SHOWN = 200

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <dd className="text-2xl font-semibold tabular-nums">{value.toLocaleString('fr-FR')}</dd>
      <dt className="text-sm text-slate-600">{label}</dt>
    </div>
  )
}

function rowsLabel(t: (key: string, o?: Record<string, unknown>) => string, numbers: number[]) {
  const shown = numbers.slice(0, 5).join(', ')
  return numbers.length > 5
    ? t('review.rowsMore', { rows: shown, count: numbers.length - 5 })
    : t('review.rows', { rows: shown })
}

/**
 * Vérification avant l'import : une phrase de synthèse, puis seulement ce qui demande une décision (doublons) ou une
 * attention (lignes écartées). Les chiffres détaillés restent à un clic.
 */
export function StepReview({
  analysis,
  plan,
  decisions,
  onDecision,
  onBulk,
  onStart,
  onBack,
}: Props) {
  const { t } = useTranslation('import')
  const { groups, errors, removed, rows } = analysis
  const dupRows = groups.reduce((n, g) => n + g.rowNumbers.length, 0)
  const invalidValues = plan.warnings.filter((w) => w.code !== 'domain_conflict').length
  const toImport = plan.stats.rowsImported
  const companies = plan.stats.companiesCreated + plan.stats.companiesMerged

  return (
    <section className="flex flex-col gap-6" aria-labelledby="review-title">
      <h2 id="review-title" className="text-lg font-semibold">
        {t('review.title')}
      </h2>

      {toImport === 0 ? (
        <p role="status" className="text-slate-700">
          {t('review.nothing')}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p role="status" className="text-xl leading-snug font-medium">
            {summaryText(t, companies, plan.stats.contactsCreated, 'review')}
          </p>
          {plan.stats.companiesMerged > 0 ? (
            <p className="text-sm text-slate-600">
              {t('review.summaryKnown', { count: plan.stats.companiesMerged })}
            </p>
          ) : null}
        </div>
      )}

      {groups.length > 0 ? (
        <div>
          <h3 className="font-semibold">{t('review.duplicatesTitle', { count: groups.length })}</h3>
          <p className="mt-1 text-sm text-slate-600">{t('review.duplicatesHelp')}</p>
          <div className="my-3 flex flex-wrap items-center gap-2">
            <span className="text-sm">{t('review.bulk')}</span>
            {DECISIONS.map((d) => (
              <Button key={d} variant="secondary" onClick={() => onBulk(d)}>
                {t(`review.decision.${d}`)}
              </Button>
            ))}
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {groups.slice(0, MAX_GROUPS_SHOWN).map((g) => (
              <GroupItem
                key={g.id}
                group={g}
                decision={decisions[g.id] ?? 'merge'}
                onDecision={onDecision}
              />
            ))}
          </ul>
          {groups.length > MAX_GROUPS_SHOWN ? (
            <p className="mt-2 text-sm text-slate-600">… +{groups.length - MAX_GROUPS_SHOWN}</p>
          ) : null}
        </div>
      ) : null}

      {errors.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-white p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">
            {t('review.leftAside', { count: errors.length })}
          </summary>
          <div className="pt-2">
            <ErrorList errors={errors} />
          </div>
        </details>
      ) : null}

      <details className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-slate-700">
          {t('review.detail')}
        </summary>
        <dl className="grid grid-cols-2 gap-3 pt-2 md:grid-cols-4">
          <Stat label={t('review.stats.ready')} value={rows.length} />
          <Stat label={t('review.stats.empty')} value={removed.empty} />
          <Stat label={t('review.stats.errors')} value={errors.length} />
          <Stat label={t('review.stats.duplicates')} value={dupRows} />
          <Stat label={t('review.stats.companies')} value={plan.stats.companiesCreated} />
          <Stat label={t('review.stats.merged')} value={plan.stats.companiesMerged} />
          <Stat label={t('review.stats.contacts')} value={plan.stats.contactsCreated} />
        </dl>
        {removed.repeatedHeader > 0 ? (
          <p className="pt-3 text-slate-600">
            {t('review.removedHeaders', { count: removed.repeatedHeader })}
          </p>
        ) : null}
        {invalidValues > 0 ? (
          <p className="pt-1 text-slate-600">{t('review.warnings', { count: invalidValues })}</p>
        ) : null}
      </details>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onBack}>
          {t('review.back')}
        </Button>
        <Button disabled={toImport === 0} onClick={onStart}>
          {t('review.start')}
        </Button>
      </div>
    </section>
  )
}

function GroupItem({
  group,
  decision,
  onDecision,
}: {
  group: DuplicateGroup
  decision: Decision
  onDecision: (groupId: string, d: Decision) => void
}) {
  const { t } = useTranslation('import')
  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-medium">{group.target.name}</p>
        <p className="text-sm text-slate-600">
          {t(`review.kind.${group.target.kind}`)} · {rowsLabel(t, group.rowNumbers)}
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label={t('review.decision.label', { name: group.target.name })}
        className="flex shrink-0 gap-1"
      >
        {DECISIONS.map((d) => (
          <label
            key={d}
            className="has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 flex min-h-11 cursor-pointer items-center rounded-lg border border-slate-300 px-3 text-sm has-[:checked]:font-medium has-[:focus-visible]:outline-2"
          >
            <input
              type="radio"
              className="sr-only"
              name={`decision-${group.id}`}
              checked={decision === d}
              onChange={() => onDecision(group.id, d)}
            />
            {t(`review.decision.${d}`)}
          </label>
        ))}
      </div>
    </li>
  )
}

export function ErrorList({ errors }: { errors: RowError[] }) {
  const { t } = useTranslation('import')
  return (
    <div>
      <h3 className="font-semibold">{t('review.errorsTitle')}</h3>
      <p className="text-sm text-slate-600">{t('review.errorsHelp')}</p>
      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
        {errors.slice(0, 20).map((e) => (
          <li key={`${e.rowNumber}-${e.code}`} className="flex flex-col gap-0.5 p-3">
            <span className="font-medium">
              {t('csv.row')} {e.rowNumber} · {t(`errors.${e.code}`)}
            </span>
            <span className="truncate text-slate-600">
              {e.message ?? e.raw.filter(Boolean).join(' | ')}
            </span>
          </li>
        ))}
      </ul>
      {errors.length > 20 ? (
        <p className="mt-2 text-sm text-slate-600">… +{errors.length - 20}</p>
      ) : null}
    </div>
  )
}
