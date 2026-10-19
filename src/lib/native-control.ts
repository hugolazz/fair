// Aide commune à `Select` et `DateInput` : un vrai champ caché porte la valeur, le bouton visible en est l'affichage.

/** Texte du libellé associé au champ, sans le champ ni son bouton (le libellé peut les envelopper). */
export function labelTextOf(
  control: HTMLSelectElement | HTMLInputElement,
  exclude: (Node | null)[],
): string {
  const label = control.labels?.[0]
  if (!label) return ''
  return Array.from(label.childNodes)
    .filter((n) => !exclude.some((x) => x && (n === x || n.contains(x))))
    .map((n) => n.textContent ?? '')
    .join(' ')
    .trim()
}

/**
 * Pose une valeur comme le ferait un choix natif : React, react-hook-form et les tests voient de vrais événements.
 * Un `<select>` n'émet que « change » ; un `<input>` émet aussi « input » (c'est lui que React écoute).
 */
export function setNativeValue(control: HTMLSelectElement | HTMLInputElement, value: string): void {
  if (control.value === value) return
  const proto = control instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement
  Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set?.call(control, value)
  if (control instanceof HTMLInputElement)
    control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}
