// Démo locale sans Supabase : faux serveur (PGlite + vraies migrations) pré-rempli d'un salon passé, et l'appli buildée.
// Usage : pnpm demo   →  http://127.0.0.1:4180  (admin@fair.test / e2e-password-1, ou marie@fair.test pour un commercial)
// Les données vivent en mémoire : tout repart de zéro à chaque lancement. Ctrl+C pour arrêter.
import { spawn, spawnSync } from 'node:child_process'
import { startFakeSupabase } from '../tests/e2e/fake-supabase/server.ts'

const API_PORT = 54400
const APP_PORT = 4180
const API = `http://127.0.0.1:${API_PORT}`

await startFakeSupabase(API_PORT)
const sql = async (query, params = []) =>
  await (
    await fetch(`${API}/__e2e/exec`, {
      method: 'POST',
      body: JSON.stringify({ sql: query, params }),
    })
  ).json()

// Un salon passé où l'équipe a déjà rencontré quelques entreprises du fichier d'exemple : à l'import, elles seront
// reconnues (« déjà connues ») et leur historique apparaîtra dans la fiche.
const [team] = await sql('select id from teams limit 1')
const [marie] = await sql("select id from auth.users where email = 'marie@fair.test'")
const [past] = await sql(
  `insert into events (id, team_id, name, status, starts_on, ends_on, city)
   values (gen_random_uuid(), $1, 'NRF Europe 2025', 'done', '2025-10-14', '2025-10-15', 'Paris') returning id`,
  [team.id],
)
const history = [
  [
    'Carrefour',
    'carrefour.com',
    'A04',
    'A',
    'warm',
    'Intéressés par le retail media, budget 2026 à valider',
    'Envoyer une proposition avant fin novembre',
    'Claire Dubois très réceptive. Veut une démo avec leur équipe data.',
  ],
  [
    'Décathlon',
    'decathlon.fr',
    'B10',
    'B',
    'cold',
    'Pas de besoin immédiat',
    'Recontacter au printemps',
    'Julie Martin : ils ont déjà un prestataire jusqu’en mars.',
  ],
  [
    'Sephora',
    'sephora.fr',
    'D01',
    'A',
    'hot',
    'Pilote validé sur 3 magasins',
    'Cadrer le pilote avec la direction digitale',
    'Très chaud. Demandent des références dans la beauté.',
  ],
  [
    'Leroy Merlin',
    'leroymerlin.fr',
    'A18',
    'B',
    'warm',
    'Intérêt pour le pilotage des promotions en magasin',
    'Présenter une démo à la direction e-commerce',
    'Thomas Bernard est sponsor, mais le budget dépend de la refonte du site.',
  ],
  [
    'Auchan Retail',
    'auchan.fr',
    'C02',
    'B',
    'cold',
    'Appel d’offres en cours chez un concurrent',
    'Rester en veille jusqu’à la fin de l’appel d’offres',
    'Nicolas Robert : décision attendue au T1.',
  ],
  [
    'Galeries Lafayette',
    'galerieslafayette.com',
    'C11',
    'A',
    'hot',
    'Demande de devis reçue après le salon',
    'Relancer le devis signé',
    'Léa Moreau très motivée, veut démarrer avant les soldes.',
  ],
  [
    'Criteo',
    'criteo.com',
    'H01',
    'A',
    'warm',
    'Partenariat retail media en discussion',
    'Envoyer le projet de convention',
    'Lucie Nicolas : intérêt réciproque, à formaliser.',
  ],
  [
    'Boulanger',
    'boulanger.com',
    'D07',
    'B',
    'warm',
    'Client depuis 2024, extension possible',
    'Proposer l’extension à 20 magasins',
    'Laura Fournier satisfaite du déploiement initial.',
  ],
]
for (const [name, domain, stand, priority, temperature, outcome, next, note] of history) {
  const [c] = await sql(
    `insert into companies (id, team_id, name, name_normalized, domain) values (gen_random_uuid(), $1, $2, lower(translate($2, 'é', 'e')), $3) returning id`,
    [team.id, name, domain],
  )
  const [ec] = await sql(
    `insert into event_companies (id, team_id, event_id, company_id, stand_label, priority) values (gen_random_uuid(), $1, $2, $3, $4, $5) returning id`,
    [team.id, past.id, c.id, stand, priority],
  )
  const [m] = await sql(
    `insert into meetings (id, team_id, event_id, event_company_id, owner_id, status, planned_at, temperature, outcome, next_step)
     values (gen_random_uuid(), $1, $2, $3, $4, 'done', '2025-10-14 10:00+00', $5, $6, $7) returning id`,
    [team.id, past.id, ec.id, marie.id, temperature, outcome, next],
  )
  await sql(
    `insert into notes (id, team_id, meeting_id, author_id, body, source, captured_at) values (gen_random_uuid(), $1, $2, $3, $4, 'typed', '2025-10-14 10:20+00')`,
    [team.id, m.id, marie.id, note],
  )
}

const env = {
  ...process.env,
  VITE_SUPABASE_URL: API,
  VITE_SUPABASE_ANON_KEY: 'anon-demo',
  VITE_DEV_EMAIL: '',
  VITE_DEV_PASSWORD: '',
}
console.log('Build de la démo…')
const build = spawnSync(
  'pnpm',
  ['exec', 'vite', 'build', '--outDir', 'dist-demo', '--logLevel', 'error'],
  { env, stdio: 'inherit', shell: true },
)
if (build.status !== 0) process.exit(build.status ?? 1)

spawn(
  'pnpm',
  [
    'exec',
    'vite',
    'preview',
    '--outDir',
    'dist-demo',
    '--host',
    '127.0.0.1',
    '--port',
    String(APP_PORT),
    '--strictPort',
  ],
  {
    env,
    stdio: 'inherit',
    shell: true,
  },
)
console.log(
  `\nDémo prête : http://127.0.0.1:${APP_PORT}\n  admin  : admin@fair.test / e2e-password-1\n  commercial : marie@fair.test / e2e-password-1\n  fichier à importer : exemples/participants-50.csv\n`,
)
