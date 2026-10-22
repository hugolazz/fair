# fair — architecture

Document de référence. Le schéma SQL de référence est dans `supabase/migrations/` (`schema.sql` est l'ébauche initiale).

> Le **mode terrain** et l'ancien **mode hors-ligne** (base locale Dexie, synchronisation, service worker, thèmes) ont été
> **retirés** : l'appli lit et écrit directement sur Supabase. Le hors-ligne revient **par étapes, en plus simple** :
> étape 1 = une **file d'attente d'écritures** (notes et cases des rencontres) conservée dans IndexedDB et envoyée au retour
> du réseau, avec une bannière de statut ; étape 2 = copie locale en lecture ; étape 3 = service worker (ouverture sans réseau).
> Cadrage : usage au salon sur iPad et téléphone, coupures de quelques secondes à une demi-journée, conflits rares (une
> entreprise est assignée à un seul commercial), données locales sans contrainte particulière.

## Choix techniques

- **Vite + React + TS + React Router** (SPA) : app derrière login, pas de SSR.
- **Tailwind + shadcn/ui** : accessibilité Radix, composants copiés.
- **Supabase** (Postgres, Auth, Storage, Edge Functions) + RLS par `team_id`.
- **Import** : PapaParse + lecture xlsx en Web Worker.
- **Plan du salon** : image ou PDF (première page rendue par pdf.js, chargé à la demande) ; pan/zoom/pincement ; pins en coordonnées normalisées 0–1 (voir [plan.md](plan.md)).
- **Multi-tenant** : Company/Contact indépendants des salons mais scopés par équipe ; dédoublonnage par domaine + nom normalisé.
- **Manifest** statique (`public/manifest.webmanifest`) pour l'installation sur l'écran d'accueil ; **pas de service worker** (l'appli retire ceux d'une ancienne version au démarrage).

## Arborescence

```
supabase/{migrations,functions}
src/
  app/ features/{auth-team,events,import,manual-entry,prepare,plan,exports,settings}
  db/{repositories,schemas}  components/{ui}  lib/  locales/fr/
tests/{rls,fixtures}
```

Règle : `features/*` → `db/repositories` + `components` + `lib` ; jamais d'appel Supabase hors `db/repositories` et `lib/supabase` (règle ESLint).

## Import de participants

- Flux : fichier/collage → **Worker** (`import.worker.ts` : lecture CSV/xlsx, nettoyage, doublons) → mapping de colonnes → vérification (décisions fusionner / ignorer / créer par groupe de doublons) → écriture par lots → rapport.
- Logique pure et testée dans `src/features/import/lib/` ; types partagés dans `src/db/schemas/import.ts` ; accès Supabase dans `src/db/repositories/import.ts`.
- Rapprochement : une ligne est un doublon d'une société connue de l'équipe ou d'une ligne précédente si le **domaine** est identique, ou si le **nom normalisé** l'est et que les domaines ne se contredisent pas (réseaux sociaux ignorés comme domaine). Fusionner ne fait que **compléter les champs vides**.
- Idempotence : les identifiants sont fixés par le plan ; relancer un plan après une coupure ne crée pas de doublons (upsert).
- Mapping mémorisé par salon dans `import_batches.mapping` (par intitulé de colonne). Le rapport stocké ne contient que des compteurs (pas de données personnelles).

## Préparation du salon

- Routes : `/events/:id` (aperçu), `/participants` (préparation), `/my-list` (ma liste), `/plan` (plan du salon), sous `EventLayout`.
- **Cible** = `event_companies` + entreprise + assignés + tags. Priorité `A/B/C` et objectif (`demo`, `intro_decision_maker`, `watch`, `other`) sont des enums ; commentaire dans `prep_comment`.
- **Assignation multiple** : table `event_company_assignees` (soft delete). Plusieurs commerciaux peuvent viser la même entreprise ; toute assignation vers une cible déjà visée déclenche une alerte (ajouter quand même / remplacer / ignorer / annuler), et la cible « contestée » est signalée partout.
- **Tags** : portent sur l'**entreprise** (`taggings`, `taggable_table = 'companies'`), donc partagés d'un salon à l'autre ; libellé unique par équipe (casse ignorée) ; tout membre peut en poser/retirer.
- **Rendez-vous** : une ligne `meetings` (`planned_at`, `planned_duration_min`, `reminder_minutes`). Le rappel est porté par l'export `.ics` (alarme de l'agenda) et par une bannière dans « Ma liste » tant que l'app est ouverte.
- **Performance** : tout est chargé en mémoire (pagination de 1 000), filtré/trié côté client, rendu **fenêtré** (tableau desktop et cartes mobile) ; les écritures sont optimisées avec retour arrière et bandeau d'erreur.
- **Historique** : rencontres et notes des autres salons via `event_companies` de la même entreprise.
- **Plan** : lien « Voir sur le plan du salon » depuis la fiche d'une entreprise.

## Exports et bilan

Onglets **Bilan** et **Exports** d'un salon. L'export est unique : le fichier importé enrichi de ce qui s'est passé pendant le salon (une
ligne par contact), en Excel, CSV ou PDF, sans filtre ni réglage ; le bilan s'exporte en PDF d'une page. Génération dans le navigateur
(`supabase/functions/_shared/exports/`). Voir [exports.md](exports.md).

## Rôles et vue équipe

- **Deux rôles** : admin d'équipe (`owner` / `admin` en base) et commercial (`member`). Les droits sont dans la RLS
  (`supabase/migrations/20261002000010_roles.sql`), l'interface ne fait que refléter : `useIsAdmin()`, `canPrepareTarget()`,
  `canEditMeeting()` (`src/features/auth-team/roles.ts`) et la garde de route `RequireAdmin` (import).
- Un commercial prépare (priorité, objectif, commentaire) les entreprises **qui lui sont assignées** et gère ses propres
  rendez-vous / comptes-rendus ; il peut s'assigner lui-même mais pas assigner un collègue. Il ne crée ni salon, ni tag, ni plan.
- Les dépôts traitent le « 0 ligne modifiée » de PostgREST comme un refus (voir `updateTargets`, `deleteMeeting`…).
- **Vue équipe** (`/events/:id/team`) : une ligne par entreprise visée ou rencontrée ; « rencontrée » = rendez-vous en cours,
  fait, à relancer ou sans suite. Risque de doublon = plusieurs commerciaux sur une entreprise déjà rencontrée. Logique pure
  dans `prepare/lib/team-view.ts`.
- **Duplication d'un salon** : RPC `duplicate_event` (admins), dialogue `duplicate-event-dialog.tsx`.

## Qualité

- **Accessibilité** : lien d'évitement, focus visible, cibles ≥ 44 px sur mobile ; audit axe WCAG 2.2 AA de chaque écran en
  e2e (`a11y.spec.ts`, `mobile.spec.ts`).
- **Performance** : routes chargées à la demande, export / PDF / lecture xlsx chargés à la demande ; Lighthouse mobile sur le
  build de production (`pnpm lighthouse`).
- **Bout en bout** : faux Supabase (PGlite + vraies migrations) — voir [README](../README.md#tests-de-bout-en-bout-sans-docker).
- **Déploiement** : [deploiement.md](deploiement.md).

## Reste à faire (idées)

Relances et e-mails, fusion de doublons, OCR des numéros de stand sur le plan (structure prête, voir [plan.md](plan.md)),
écran RGPD (export / anonymisation d'un contact).
