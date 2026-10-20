type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * Phrase de synthèse de l'import : « 50 entreprises et 63 contacts … ». Les accords au pluriel viennent des clés `n.*` ;
 * sans contact, on ne les mentionne pas. `scope` choisit le temps de la phrase : avant l'import (« seront ajoutés »)
 * ou après (« ajoutés »).
 */
export function summaryText(
  t: Translate,
  companies: number,
  contacts: number,
  scope: 'review' | 'report',
): string {
  const c = t('n.company', { count: companies })
  if (contacts === 0) return t(`${scope}.summaryNoContact`, { companies: c })
  return t(`${scope}.summary`, { companies: c, contacts: t('n.contact', { count: contacts }) })
}
