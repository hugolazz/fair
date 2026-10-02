# fair

fair est une application pour les commerciaux qui se rendent sur des salons tech (Tech For Retail, NRF…). Elle remplace le bloc-notes : préparer (Avant), vivre (Pendant), exploiter (Après) un salon, et garder l'historique par entreprise d'un salon à l'autre.

## Règle de marque (impérative)

Le nom du produit est **fair**, toujours en minuscules — y compris en début de phrase, dans l'UI, les PDF, e-mails, manifest PWA, README, commentaires et messages de commit. Jamais « Fair » ni « FAIR ». (Les identifiants de code suivent la convention du langage, ex. `fairConfig` ; tout texte lisible = « fair ».)

## Priorités produit

1. Organiser et optimiser les rencontres.
2. **Une note doit pouvoir être prise en < 10 secondes** (tap → clavier ouvert → saisie/dictée → enregistré). Toute modification de la phase Pendant doit préserver ça.
3. La phase Pendant fonctionne **100 % hors-ligne**.

## Stack

TypeScript strict · React + Vite + React Router (SPA, pas de SSR) · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Storage, Edge Functions, RLS) · Dexie (IndexedDB) · vite-plugin-pwa (Workbox) · zod · react-hook-form · Zustand (état UI) · react-i18next · Vitest, Testing Library, Playwright, pgTAP.

## Architecture (voir docs/architecture.md, docs/schema.sql)

- **Local-first** : l'UI lit et écrit dans Dexie (`src/db/local`). Jamais d'appel Supabase depuis `features/*`. **Aujourd'hui** c'est vrai pour le mode terrain (`features/field`) ; événements, import et préparation lisent/écrivent encore Supabase directement via leurs dépôts (à basculer sur Dexie).
- Toute écriture passe par `src/db/repositories/*`, qui écrit la table + l'`outbox` dans la même transaction.
- `src/sync/` pousse l'outbox (RPC idempotente `sync_push`) et tire les changements via `server_seq`. Pas d'horloge client dans la logique de sync.
- IDs = UUIDv7 générés côté client. Suppressions = soft delete (`deleted_at`).
- Les `notes` sont append-only. Autres tables : last-write-wins (par champ pour `meetings`).
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

Vitest pour la logique (sync, import, scoring). **Tests RLS** (`tests/rls/`) : les vraies migrations de `supabase/migrations/` sont rejouées dans PGlite (Postgres en WASM, sans Docker) avec un stub minimal de `auth` ; chaque nouvelle table/policy doit y avoir ses cas (isolation entre équipes, rôles). **Import de participants** : fonctions pures dans `src/features/import/lib/` (parse, mapping, clean, dedupe, plan), testées sur les fichiers très sales de `tests/fixtures/import/` (générés par `pnpm fixtures`) ; toute nouvelle règle de nettoyage ou de doublon y ajoute un cas. **Préparation du salon** : tri, filtres, conflits d'assignation, ma liste, fenêtrage, historique et export .ics sont des fonctions pures dans `src/features/prepare/lib/` (testées) ; l'état et les écritures optimistes sont dans `use-targets.ts`. **Mode terrain / sync** (stratégie complète : `docs/sync.md`) : `db/local/write.test.ts` (outbox, fusion), `sync/engine.test.ts` et `sync/multi-device.test.ts` (coupure, deux appareils, retour réseau, conflits) avec `FakeServer`/`FakeRemote` et `fake-indexeddb` ; `features/field/field.taps.test.tsx` (jsdom) **mesure et affiche le nombre de taps par geste** et échoue si le budget est dépassé. Test de marque (`tests/brand.test.ts`) : échoue si « Fair »/« FAIR » apparaît. Playwright pour les parcours, **dont un scénario hors-ligne** (couper le réseau → note → rétablir → synchronisé). Toute modification de `src/sync` ou `src/db` doit avoir un test.

## Commandes

```bash
pnpm install            # dépendances
pnpm dev                # serveur Vite
pnpm build              # build de production + PWA
pnpm preview            # servir le build (tester le service worker)
pnpm typecheck          # tsc --noEmit
pnpm lint               # eslint
pnpm format             # prettier --write
pnpm test               # vitest (unitaires + RLS + marque)
pnpm test:rls           # uniquement les tests RLS
pnpm icons              # régénère les icônes PWA dans public/
pnpm fixtures           # régénère les fichiers d'exemple sales de tests/fixtures/import/
pnpm test:e2e           # playwright (inclut le mode hors-ligne) — à venir
pnpm supabase start     # Supabase local (nécessite Docker)
pnpm supabase db reset  # rejoue migrations + seed
pnpm supabase migration new <nom>
pnpm supabase functions serve invite-member --env-file supabase/.env.local
pnpm supabase gen types typescript --local > src/types/database.ts
```
