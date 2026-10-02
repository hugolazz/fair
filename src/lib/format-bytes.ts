const fr = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** 1 258 291 → « 1,2 Mo ». */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} o`
  if (bytes < 1024 * 1024) return `${fr.format(bytes / 1024)} Ko`
  if (bytes < 1024 ** 3) return `${fr.format(bytes / 1024 ** 2)} Mo`
  return `${fr.format(bytes / 1024 ** 3)} Go`
}
