# fair

fair est une application pour les commerciaux qui se rendent sur des salons tech (Tech For Retail, NRF…). Elle remplace le bloc-notes : préparer un salon (participants, priorités, assignations, rendez-vous, plan du salon) et garder l'historique par entreprise d'un salon à l'autre. Il n'y a **ni mode terrain ni mode hors-ligne** (retirés : l'appli est utilisée connectée).

## Règle de marque (impérative)

Le nom du produit est **fair**, toujours en minuscules — y compris en début de phrase, dans l'UI, les PDF, e-mails, manifest PWA, README, commentaires et messages de commit. Jamais « Fair » ni « FAIR ». (Les identifiants de code suivent la convention du langage, ex. `fairConfig` ; tout texte lisible = « fair ».)

## Priorités produit

1. Organiser et optimiser les rencontres.
2. Préparer vite : import des participants, priorités, assignations, plan du salon.

## Stack

TypeScript strict · React + Vite + React Router (SPA, pas de SSR) · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Storage, Edge Functions, RLS) · pdfjs-dist (conversion du PDF d'un plan, chargé à la demande) · exceljs, pdf-lib, fflate (exports Excel / PDF / ZIP, chargés à la demande) · zod · react-hook-form · Zustand (état UI) · react-i18next · Vitest, Testing Library, Playwright, pgTAP.

## Architecture (voir docs/architecture.md, docs/schema.sql)

- **Supabase direct** : l'UI passe toujours par `src/db/repositories/*` (jamais d'appel Supabase depuis `features/*`, règle ESLint) ; les données sont validées par zod (`src/db/schemas`).
- **Exports et bilan** : la logique de génération (filtres, Excel, CSV, PDF, bilan) vit dans `supabase/functions/_shared/exports/` (alias `@shared`, imports relatifs en `.ts`, dépendances nues `exceljs` / `pdf-lib` / `fflate` résolues par `generate-export/deno.json` côté Deno). Elle est utilisée par le navigateur ET par l'Edge Function `generate-export` : aucune logique d'export dans les composants. Textes des fichiers générés : `labels.ts` ; textes de l'interface : `src/locales/fr/exports.json`. Voir `docs/exports.md`.
- IDs = UUIDv7 générés côté client. Suppressions = soft delete (`deleted_at`).
- **Rôles** (migration `…10_roles.sql`) : admin d'équipe = `owner`/`admin`, commercial = `member`. Appliqués par la RLS (`is_team_admin`, `is_assigned_to_me`) : un commercial lit tout, s'assigne lui-même, prépare les cibles qui lui sont assignées, gère ses rendez-vous et ses notes ; l'admin crée salons, import, tags, plan, rôles. Le dernier `owner` est protégé (`protect_last_owner`). L'UI (`src/features/auth-team/roles.ts`, `RequireAdmin`) grise ou masque ce que la base refuserait. PostgREST renvoie 0 ligne (pas d'erreur) pour une mise à jour refusée par la RLS : les dépôts demandent `.select('id')` et lèvent une erreur si rien n'est modifié.
- **Duplication d'un salon** : RPC `duplicate_event` (migration `…11`), réservée aux admins ; copie la configuration, le mapping d'import et, au choix, la liste des participants (priorité, objectif, commentaire ; ni stands, ni assignations, ni rencontres).
- **Saisie manuelle** (`src/features/manual-entry/`, migration `…12`) : une entreprise saisie à la main passe par le même pipeline que l'import (`toCleanRow` → `findDuplicates` → `buildPlan` → `executeImport` avec `mapping: null`, donc sans lot d'import) : même nettoyage, même rapprochement, jamais de doublon. Les commerciaux peuvent insérer entreprises, participations et contacts (pas modifier une entreprise existante). Un contact se saisit en six cases (`ContactFields`), identiques aux colonnes de l'export, et se re-mappe tel quel à l'import (testé).
- **Plusieurs contacts par ligne d'import** : `CleanRow.contacts[]`. Séparateurs `;`, `|`, retour à la ligne (les cellules gardent leurs retours à la ligne jusqu'à `cleanRows`), alignement position par position entre nom / e-mail / poste / téléphone / LinkedIn, avertissement `contacts_mismatch` si les nombres diffèrent. Le contact clé = premier contact par ordre de saisie (`fetchContacts` trie sur l'id UUIDv7). L'étape de mapping signale les lignes concernées.
- **Fiche d'entreprise** (`target-sheet.tsx`) : l'essentiel d'un coup d'œil (priorité, tags, stand, contact clé), l'historique, le bloc-notes. Le bouton **« Modifier la fiche »** (`edit-target-dialog.tsx`) ouvre un dialogue avec tout le reste : informations de l'entreprise et historique (migration `…14` : tout membre peut modifier une entreprise ; la suppression reste admin), priorité et stand (admin ou commercial assigné), tags, assignation, rendez-vous, contacts (modifier / supprimer / ajouter). L'objectif de rencontre et le commentaire de préparation ont été retirés de l'interface (colonnes laissées en base). **Historique** = `companies.history` (migration `…13`), texte libre alimenté par la colonne « Commentaire » de l'import ou saisi à la main ; les rencontres des autres salons restent repliées dessous (salons supprimés et salons sans rencontre ni note écartés).
- **« À recontacter »** : `meetings.recontact` (booléen), case dans le bloc-notes de la fiche ; colonne « À recontacter » dans les onglets Entreprises / Contacts / Rencontres de l'Excel, champ CSV `meeting.recontact`, fiche PDF de rencontre.
- **Vue équipe** (`/events/:id/team`) : logique pure dans `src/features/prepare/lib/team-view.ts` (qui a rencontré quelle entreprise, risque de doublon de relance).
- Hérité de l'ancien mode hors-ligne, laissé en base (inoffensif) : colonnes `server_seq`, fonctions `patch_meeting` / `patch_note`, statuts de rencontre `follow_up` / `not_interested`. Les supprimer demande une migration dédiée.
- Dépendances : `features → db/repositories, components, lib` ; jamais l'inverse.
- Migrations SQL dans `supabase/migrations/` = source de vérité. Types générés dans `src/types/`.

## Conventions de code

- TS `strict`, pas de `any` (utiliser `unknown` + zod). Validation zod aux frontières (import, sync, formulaires).
- Fichiers `kebab-case`, composants `PascalCase`, hooks `useX`, un composant par fichier. Exports nommés (pas de default sauf pages lazy).
- Un dossier par domaine dans `src/features/`. Pas de logique métier dans les composants UI : fonctions pures testables.
- Code et identifiants en **anglais** ; textes affichés en **français** via i18n.
- Commits : Conventional Commits (`feat:`, `fix:`…), petits et ciblés.
- Pas de nouvelle dépendance sans justification (poids du bundle = important sur mobile).
- Commentaires : seulement le « pourquoi » non évident.

## UI, i18n, accessibilité

- UI en **français**. **Aucun texte en dur** : tout passe par `t('clé')` (`src/locales/fr/*.json`). i18n prévue pour d'autres langues : dates/nombres via `Intl`, pas de concaténation de phrases.
- Mobile first ; desktop complet pour Avant/Après. Cibles tactiles ≥ 44 px, actions principales à portée de pouce.
- WCAG 2.2 AA : contraste, focus visible, navigation clavier, labels/ARIA, statuts jamais portés par la couleur seule, `prefers-reduced-motion`.

## RGPD

Les contacts sont des données personnelles. Données scopées par équipe (RLS sur toutes les tables, tests dans `tests/rls/`). Minimisation, durée de conservation configurable, export / suppression / anonymisation d'un contact, opt-out respecté dans les relances, hébergement UE. Ne jamais logger de données personnelles (notes, e-mails, noms) dans la console, Sentry ou les analytics. Détails dans `docs/rgpd.md`.

## Sécurité

Aucune clé secrète dans le front (seule la clé `anon` est publique). Secrets dans `.env.local` (non versionné) et secrets Supabase. Toute nouvelle table : `team_id` + RLS + test dans `tests/rls/`.

## Tests

Vitest pour la logique (sync, import, scoring). **Tests RLS** (`tests/rls/`) : les vraies migrations de `supabase/migrations/` sont rejouées dans PGlite (Postgres en WASM, sans Docker) avec un stub minimal de `auth` ; chaque nouvelle table/policy doit y avoir ses cas (isolation entre équipes, rôles). **Import de participants** : fonctions pures dans `src/features/import/lib/` (parse, mapping, clean, dedupe, plan), testées sur les fichiers très sales de `tests/fixtures/import/` (générés par `pnpm fixtures`) ; toute nouvelle règle de nettoyage ou de doublon y ajoute un cas. **Préparation du salon** : tri, filtres, conflits d'assignation, ma liste, fenêtrage, historique et export .ics sont des fonctions pures dans `src/features/prepare/lib/` (testées) ; l'état et les écritures optimistes sont dans `use-targets.ts`. **Plan du salon** (stratégie : `docs/plan.md`) : la géométrie de la visionneuse (zoom, déplacement, pincement) et la construction des pins sont des fonctions pures dans `src/features/plan/lib/` (testées) ; la clé de stand `standKey()` doit rester identique à la fonction SQL `stand_key()` (parité vérifiée dans `tests/rls/plan.test.ts`). **Exports et bilan** (`docs/exports.md`) : les fichiers générés sont **relus** dans les tests (`tests/exports/`) — Excel avec ExcelJS (onglets, figé, filtres, largeurs, couleurs), CSV avec papaparse, PDF avec pdf.js (texte, pied de page « généré avec fair » sur chaque page, sommaire, page unique du bilan, absence de débordement) ; toute nouvelle colonne, règle de filtre ou section de PDF y ajoute un cas. Test de marque (`tests/brand.test.ts`) : échoue si « Fair »/« FAIR » apparaît. **Bout en bout** (`tests/e2e/*.spec.ts`, `pnpm test:e2e`) : Playwright sur un build de production face à un **faux Supabase** (`tests/e2e/fake-supabase/` : les vraies migrations dans PGlite derrière une façade PostgREST/GoTrue, RLS comprise ; son propre test de compatibilité `fake-supabase.test.ts` rejoue de vrais dépôts). Specs : `journey` (parcours complet), `roles` (admin / commercial, vue équipe, duplication), `a11y` (axe WCAG 2.2 AA sur chaque écran + clavier), `mobile` (axe, pas de défilement horizontal, cibles ≥ 44 px). Tout nouvel écran ajoute son entrée dans les listes d'écrans de `a11y.spec.ts` et `mobile.spec.ts`. Le faux serveur ne couvre ni Storage, ni Edge Functions, ni e-mails. **Performance** : `pnpm lighthouse` (mobile, objectif ≥ 90) ; pas de catégorie PWA dans Lighthouse ≥ 12, l'installabilité est testée par `tests/manifest.test.ts`. Toute modification de `src/db` doit avoir un test.

## Commandes

```bash
pnpm install            # dépendances
pnpm dev                # serveur Vite
pnpm build              # build de production
pnpm preview            # servir le build
pnpm typecheck          # tsc --noEmit
pnpm lint               # eslint
pnpm format             # prettier --write
pnpm test               # vitest (unitaires + RLS + marque)
pnpm test:rls           # uniquement les tests RLS
pnpm icons              # régénère les icônes PWA dans public/
pnpm fixtures           # régénère les fichiers d'exemple sales de tests/fixtures/import/
pnpm test:e2e           # playwright (build + faux Supabase, sans Docker)
pnpm lighthouse         # audit mobile d'un build servi sur :4173
pnpm supabase start     # Supabase local (nécessite Docker)
pnpm supabase db reset  # rejoue migrations + seed
pnpm supabase migration new <nom>
pnpm supabase functions serve invite-member --env-file supabase/.env.local
pnpm supabase gen types typescript --local > src/types/database.ts
```
