# fair

fair est une application pour les commerciaux qui se rendent sur des salons tech (Tech For Retail, NRF…). Elle remplace le bloc-notes : préparer un salon (participants, priorités, assignations, rendez-vous, plan du salon) et garder l'historique par entreprise d'un salon à l'autre. Il n'y a **ni mode terrain ni mode hors-ligne** (retirés : l'appli est utilisée connectée).

## Règle de marque (impérative)

Le nom du produit est **fair**, toujours en minuscules — y compris en début de phrase, dans l'UI, les PDF, e-mails, manifest PWA, README, commentaires et messages de commit. Jamais « Fair » ni « FAIR ». (Les identifiants de code suivent la convention du langage, ex. `fairConfig` ; tout texte lisible = « fair ».)

## Priorités produit

1. Organiser et optimiser les rencontres.
2. Préparer vite : import des participants, priorités, assignations, plan du salon.

## Stack

TypeScript strict · React + Vite + React Router (SPA, pas de SSR) · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Storage, Edge Functions, RLS) · pdfjs-dist (conversion du PDF d'un plan, chargé à la demande) · zod · react-hook-form · Zustand (état UI) · react-i18next · Vitest, Testing Library, Playwright, pgTAP.

## Architecture (voir docs/architecture.md, docs/schema.sql)

- **Supabase direct** : l'UI passe toujours par `src/db/repositories/*` (jamais d'appel Supabase depuis `features/*`, règle ESLint) ; les données sont validées par zod (`src/db/schemas`).
- IDs = UUIDv7 générés côté client. Suppressions = soft delete (`deleted_at`).
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

Vitest pour la logique (sync, import, scoring). **Tests RLS** (`tests/rls/`) : les vraies migrations de `supabase/migrations/` sont rejouées dans PGlite (Postgres en WASM, sans Docker) avec un stub minimal de `auth` ; chaque nouvelle table/policy doit y avoir ses cas (isolation entre équipes, rôles). **Import de participants** : fonctions pures dans `src/features/import/lib/` (parse, mapping, clean, dedupe, plan), testées sur les fichiers très sales de `tests/fixtures/import/` (générés par `pnpm fixtures`) ; toute nouvelle règle de nettoyage ou de doublon y ajoute un cas. **Préparation du salon** : tri, filtres, conflits d'assignation, ma liste, fenêtrage, historique et export .ics sont des fonctions pures dans `src/features/prepare/lib/` (testées) ; l'état et les écritures optimistes sont dans `use-targets.ts`. **Plan du salon** (stratégie : `docs/plan.md`) : la géométrie de la visionneuse (zoom, déplacement, pincement) et la construction des pins sont des fonctions pures dans `src/features/plan/lib/` (testées) ; la clé de stand `standKey()` doit rester identique à la fonction SQL `stand_key()` (parité vérifiée dans `tests/rls/plan.test.ts`). Test de marque (`tests/brand.test.ts`) : échoue si « Fair »/« FAIR » apparaît. Playwright pour les parcours (à venir). Toute modification de `src/db` doit avoir un test.

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
pnpm test:e2e           # playwright — à venir
pnpm supabase start     # Supabase local (nécessite Docker)
pnpm supabase db reset  # rejoue migrations + seed
pnpm supabase migration new <nom>
pnpm supabase functions serve invite-member --env-file supabase/.env.local
pnpm supabase gen types typescript --local > src/types/database.ts
```
