import { expect, type Locator, type Page } from '@playwright/test'

export const API = 'http://127.0.0.1:54399'
export const PASSWORD = 'e2e-password-1'
export const USERS = {
  admin: 'admin@fair.test',
  marie: 'marie@fair.test',
  paul: 'paul@fair.test',
  newcomer: 'newcomer@fair.test',
} as const

/** Repart d'une base vierge : `team` = équipe avec un admin et deux commerciaux, `none` = comptes sans équipe. */
export async function resetBackend(seed: 'team' | 'none' = 'team'): Promise<void> {
  const res = await fetch(`${API}/__e2e/reset?seed=${seed}`, { method: 'POST' })
  expect(res.ok).toBe(true)
}

/** Requête SQL de préparation (hors RLS), pour poser des données sans passer par l'interface. */
export async function sql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await fetch(`${API}/__e2e/exec`, {
    method: 'POST',
    body: JSON.stringify({ sql: query, params }),
  })
  const body = (await res.json()) as T[] | { message: string }
  if (!Array.isArray(body)) throw new Error(body.message)
  return body
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('Adresse e-mail').fill(email)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
}

/** Ouvre « Modifier la fiche » depuis la fiche d'une entreprise et renvoie son dialogue. */
export async function openEdit(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Modifier la fiche' }).click()
  const edit = page.getByRole('dialog', { name: /^Modifier la fiche/ })
  await expect(edit).toBeVisible()
  return edit
}

export async function logout(page: Page): Promise<void> {
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible()
}

/** Salon + entreprises (stands) créés en base pour un test qui n'a pas besoin de refaire l'import. */
export async function seedEvent(
  name: string,
  companies: { name: string; stand?: string }[],
): Promise<{ eventId: string; teamId: string; targetIds: Record<string, string> }> {
  const [team] = await sql<{ id: string }>('select id from teams limit 1')
  const [event] = await sql<{ id: string }>(
    `insert into events (id, team_id, name, status) values (gen_random_uuid(), $1, $2, 'preparing') returning id`,
    [team!.id, name],
  )
  const targetIds: Record<string, string> = {}
  for (const c of companies) {
    const [company] = await sql<{ id: string }>(
      `insert into companies (id, team_id, name, name_normalized) values (gen_random_uuid(), $1, $2, lower($2)) returning id`,
      [team!.id, c.name],
    )
    const [ec] = await sql<{ id: string }>(
      `insert into event_companies (id, team_id, event_id, company_id, stand_label)
       values (gen_random_uuid(), $1, $2, $3, $4) returning id`,
      [team!.id, event!.id, company!.id, c.stand ?? null],
    )
    targetIds[c.name] = ec!.id
  }
  return { eventId: event!.id, teamId: team!.id, targetIds }
}

/**
 * Attend la fin des animations d'apparition : un audit d'accessibilité lancé pendant l'animation mesure sinon un
 * contraste à mi-opacité (et une attente fixe devient trop juste quand la page met plus longtemps à s'afficher).
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle') // la page (et ses morceaux de code chargés à la demande) est affichée
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState === 'finished' || a.playState === 'idle'),
  )
  await page.waitForTimeout(100)
}
