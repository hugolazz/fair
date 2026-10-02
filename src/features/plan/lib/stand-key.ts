/**
 * Clé de comparaison d'un numéro de stand : majuscules, sans espaces ni ponctuation, sans zéros de tête
 * (« a-05 », « A5 » et « A 05 » donnent « A5 »). Même règle que la fonction SQL `stand_key()` (migration
 * 20261002000007) ; `tests/rls/plan.test.ts` vérifie qu'elles donnent le même résultat.
 * C'est la clé qui reliera plus tard un numéro détecté par OCR à l'entreprise du salon.
 */
export function standKey(label: string | null | undefined): string | null {
  if (!label) return null
  const key = label
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/(^|[^0-9])0+(?=[0-9])/g, '$1')
  return key === '' ? null : key
}
