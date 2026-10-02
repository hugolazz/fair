import { z } from 'zod'
import { CUSTOM_TEMPLATE, type CsvTemplate } from '@shared/exports/csv.ts'

// Modèles de mapping CSV personnalisés : propres à ce navigateur (localStorage), envoyés tels quels au serveur
// lors d'une génération côté serveur. Les modèles HubSpot et Salesforce sont fournis et non modifiables.

const KEY = 'fair.csvTemplates.v1'

const templateSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  delimiter: z.enum([',', ';']),
  bom: z.boolean(),
  includeCompaniesWithoutContact: z.boolean(),
  excludeOptOut: z.boolean(),
  columns: z
    .array(
      z.object({
        header: z.string().max(120),
        source: z.union([
          z.object({ field: z.string() }),
          z.object({ value: z.string().max(500) }),
        ]),
        map: z.record(z.string(), z.string()).optional(),
      }),
    )
    .min(1)
    .max(100),
})

export type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

/** Modèles enregistrés ; une entrée corrompue est ignorée sans empêcher les autres. */
export function loadCustomTemplates(storage: Storage = localStorage): CsvTemplate[] {
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.flatMap((item) => {
      const r = templateSchema.safeParse(item)
      return r.success ? [r.data as CsvTemplate] : []
    })
  } catch {
    return []
  }
}

function write(list: CsvTemplate[], storage: Storage) {
  try {
    storage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* stockage indisponible : le modèle ne sera pas gardé */
  }
}

/** Ajoute ou remplace (par identifiant) un modèle. */
export function saveCustomTemplate(t: CsvTemplate, storage: Storage = localStorage): CsvTemplate[] {
  const list = [...loadCustomTemplates(storage).filter((x) => x.id !== t.id), t]
  write(list, storage)
  return list
}

export function deleteCustomTemplate(id: string, storage: Storage = localStorage): CsvTemplate[] {
  const list = loadCustomTemplates(storage).filter((x) => x.id !== id)
  write(list, storage)
  return list
}

/** Nouveau modèle personnalisé (copie du modèle par défaut) avec un identifiant et un nom uniques. */
export function newCustomTemplate(
  existing: CsvTemplate[],
  base: CsvTemplate = CUSTOM_TEMPLATE,
): CsvTemplate {
  let n = existing.length + 1
  while (existing.some((t) => t.name === `Modèle ${n}`)) n++
  return {
    ...base,
    id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: `Modèle ${n}`,
    columns: base.columns.map((c) => ({ ...c })),
  }
}
