import type {
  CleanRow,
  Decision,
  DuplicateGroup,
  DuplicateTarget,
  KnownCompany,
} from '@/db/schemas/import'

type Candidate = { domain: string | null; key: string }

/** Deux sociétés sont la même si leur domaine est identique, ou si leur nom normalisé l'est et que leurs domaines ne se contredisent pas. */
function compatible(a: Candidate, b: Candidate): boolean {
  return !a.domain || !b.domain || a.domain === b.domain
}

/**
 * Regroupe les lignes qui sont des doublons : d'une société déjà connue de l'équipe (rapprochement)
 * ou d'une ligne plus haute du même fichier. La première occurrence dans le fichier reste la référence.
 */
export function findDuplicates(rows: CleanRow[], known: KnownCompany[]): DuplicateGroup[] {
  const knownByDomain = new Map<string, KnownCompany>()
  const knownByKey = new Map<string, KnownCompany[]>()
  for (const k of known) {
    if (k.domain && !knownByDomain.has(k.domain)) knownByDomain.set(k.domain, k)
    const list = knownByKey.get(k.nameKey)
    if (list) list.push(k)
    else knownByKey.set(k.nameKey, [k])
  }

  const fileByDomain = new Map<string, { rowNumber: number; name: string }>()
  const fileByKey = new Map<string, { rowNumber: number; name: string; domain: string | null }[]>()
  const groups = new Map<string, DuplicateGroup>()

  const add = (
    target: DuplicateTarget,
    id: string,
    rowNumber: number,
    reason: 'domain' | 'name',
  ) => {
    const g = groups.get(id)
    if (g) g.rowNumbers.push(rowNumber)
    else groups.set(id, { id, target, rowNumbers: [rowNumber], reason })
  }

  for (const row of rows) {
    const me: Candidate = { domain: row.company.domain || null, key: row.company.nameKey }

    const kd = me.domain ? knownByDomain.get(me.domain) : undefined
    if (kd) {
      add(
        { kind: 'known', companyId: kd.id, name: kd.name },
        `known:${kd.id}`,
        row.rowNumber,
        'domain',
      )
      continue
    }
    const kn = knownByKey
      .get(me.key)
      ?.find((k) => compatible(me, { domain: k.domain, key: k.nameKey }))
    if (kn) {
      add(
        { kind: 'known', companyId: kn.id, name: kn.name },
        `known:${kn.id}`,
        row.rowNumber,
        'name',
      )
      continue
    }

    const fd = me.domain ? fileByDomain.get(me.domain) : undefined
    const fn = fileByKey.get(me.key)?.find((f) => compatible(me, { domain: f.domain, key: me.key }))
    const first = fd ?? fn
    if (first) {
      add(
        { kind: 'file', rowNumber: first.rowNumber, name: first.name },
        `file:${first.rowNumber}`,
        row.rowNumber,
        fd ? 'domain' : 'name',
      )
      continue
    }

    // Nouvelle société : devient la référence pour les lignes suivantes.
    const ref = { rowNumber: row.rowNumber, name: row.company.name }
    if (me.domain) fileByDomain.set(me.domain, ref)
    const list = fileByKey.get(me.key)
    if (list) list.push({ ...ref, domain: me.domain })
    else fileByKey.set(me.key, [{ ...ref, domain: me.domain }])
  }
  return [...groups.values()]
}

/** Par défaut, on fusionne : conserve l'historique des sociétés connues et regroupe les contacts d'une même société. */
export function defaultDecisions(groups: DuplicateGroup[]): Record<string, Decision> {
  return Object.fromEntries(groups.map((g) => [g.id, 'merge' as Decision]))
}
