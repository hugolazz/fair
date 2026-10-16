import {
  executeImport,
  fetchEventCompanyIds,
  fetchKnownCompanies,
  fetchKnownContacts,
} from '@/db/repositories/import'
import { assignTargets } from '@/db/repositories/targets'
import { defaultDecisions, findDuplicates } from '@/features/import/lib/dedupe'
import { buildPlan } from '@/features/import/lib/plan'
import { newId } from '@/lib/ids'
import { toCleanRow, type CompanyForm } from './lib/manual'

export type AddCompanyResult = {
  /**
   * `created` : nouvelle entreprise · `merged` : l'entreprise existait déjà dans l'équipe (même domaine ou même nom),
   * elle est ajoutée à ce salon · `already` : elle était déjà dans ce salon.
   */
  status: 'created' | 'merged' | 'already'
  /** Cible du salon (nouvelle ou existante) quand elle vient d'être ajoutée. */
  targetId: string | null
}

type Input = {
  teamId: string
  eventId: string
  meId: string
  assignToMe: boolean
  form: CompanyForm
}

/**
 * Ajoute une entreprise au salon sans fichier : la ligne saisie passe par le même rapprochement et les mêmes écritures
 * que l'import, donc une entreprise déjà connue de l'équipe est réutilisée (jamais dupliquée) et son historique suit.
 * Une entreprise existante n'est pas modifiée (seuls les admins modifient les fiches d'entreprise).
 */
export async function addCompanyManually(input: Input): Promise<AddCompanyResult> {
  const row = toCleanRow(input.form)
  const [known, knownContacts, eventCompanyIds] = await Promise.all([
    fetchKnownCompanies(),
    fetchKnownContacts(),
    fetchEventCompanyIds(input.eventId),
  ])
  const groups = findDuplicates([row], known)
  const plan = buildPlan({
    rows: [row],
    groups,
    decisions: defaultDecisions(groups),
    known,
    knownContacts,
    eventCompanyIds,
    teamId: input.teamId,
    eventId: input.eventId,
    batchId: null,
    newId,
  })
  plan.companies = plan.companies.filter((c) => c.isNew)

  const report = await executeImport({
    plan,
    teamId: input.teamId,
    eventId: input.eventId,
    filename: '',
    mapping: null,
    cleaningErrors: [],
    rawByRow: new Map(),
  })
  if (report.errors.length > 0) throw new Error(report.errors[0]?.message ?? 'save failed')

  const targetId = plan.eventCompanies[0]?.id ?? null
  if (targetId && input.assignToMe) {
    await assignTargets(input.teamId, input.eventId, [targetId], input.meId)
  }
  const status = plan.stats.companiesCreated > 0 ? 'created' : targetId ? 'merged' : 'already'
  return { status, targetId }
}
