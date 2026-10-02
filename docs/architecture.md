# fair — architecture

Document de référence issu de l'étape de cadrage. Le schéma SQL est dans `schema.sql`.

## Choix techniques

- **Vite + React + TS + React Router** (SPA) : app derrière login, pas de SSR ; shell précaché pour l'offline.
- **Tailwind + shadcn/ui** : accessibilité Radix, composants copiés.
- **Supabase** (Postgres, Auth, Storage, Edge Functions) + RLS par `team_id`.
- **Dexie** = source de vérité de l'UI (`useLiveQuery`) ; moteur de sync entre Dexie et Supabase.
- **vite-plugin-pwa** (`injectManifest`) : précache du shell, cache des tuiles du plan.
- **Import** : PapaParse + SheetJS en Web Worker. **Export** : ExcelJS, CSV, `@react-pdf/renderer`.
- **Plan du salon** : PDF/image rasterisé à l'import (pdf.js) en tuiles ; pan/zoom ; pins en coordonnées normalisées 0–1.
- **Dictée** : clavier natif en V1 (marche hors-ligne) ; vocal différé + transcription Edge Function (Whisper) plus tard. Pas de Web Speech API.
- **Multi-tenant** : Company/Contact indépendants des salons mais scopés par équipe ; dédoublonnage par domaine + nom normalisé.

## Arborescence

```
supabase/{migrations,functions,tests,seed.sql}
src/
  app/ features/{events,import,companies,contacts,prioritization,floorplan,assignment,live,debrief,exports,auth-team}
  db/{dexie.ts,repositories,schemas}  sync/  components/{ui}  lib/  locales/fr/  types/  sw.ts
tests/e2e/
```

Règle : `features/*` → `db/repositories` + `components` ; jamais d'appel Supabase hors `sync/` et `lib/supabase`.

## Synchronisation hors-ligne (local-first)

- **IDs** UUIDv7 générés client. **Outbox** Dexie écrite dans la même transaction que la donnée.
- **Push** : RPC `sync_push(ops jsonb)`, security invoker (RLS), idempotente via `op_id`/`sync_ops_applied` ; backoff exponentiel ; erreur 4xx = quarantaine visible.
- **Pull** : curseur `server_seq` par table (trigger serveur, séquence globale) ; aucune horloge client.
- **Périmètre local** : salons épinglés (`offline_pinned`) et leurs données ; le reste à la demande.
- **Suppressions** : soft delete, purge serveur > 90 j.
- **Conflits** : `notes` append-only ; `meetings` LWW par champ (`field_updated_at`) ; `companies`/`contacts` LWW par ligne + `revisions`.
- **Blobs** : stockés dans Dexie, upload différé vers Storage (`attachments.status`), compression avant stockage.
- **Auth** : session persistée ; jamais de blocage hors-ligne ; reconnexion au retour réseau.
- **Déclencheurs** (pas de Background Sync sur iOS) : `online`, `visibilitychange`, ouverture, intervalle, bouton manuel.
- **iOS** : `navigator.storage.persist()`, avertissement si refusé, compteur d'éléments en attente, inciter à installer la PWA.
- **Migrations Dexie** versionnées ; refus doux si client trop ancien.
- **Temps réel** (V2) : Supabase Realtime pour les statuts des collègues.

## Note en < 10 s

Tap sur la carte → bottom sheet, clavier ouvert, autofocus, dictée native. Brouillon auto, aucun champ obligatoire, statut en un tap, tags, photo de badge, chaud/tiède/froid. Tout est local : pas d'attente réseau, ouverture < 100 ms. Métrique locale : temps tap → note enregistrée.

## Roadmap

0. Fondations (repo, CI, Supabase + RLS + pgTAP, auth/équipe, PWA vide)
1. MVP « Pendant » : Dexie, outbox, sync, à voir maintenant, note rapide, statuts, imprévus, e2e offline
2. MVP « Avant » : import CSV/Excel, priorités/tags, répartition, desktop, export basique
3. Plan du salon
4. « Après » : exports Excel/PDF, bilan, relances
5. Historique inter-salons, fusion de doublons, duplication de salon
6. Photo de badge & audio (upload différé, transcription, OCR optionnel)
7. Durcissement : temps réel, RGPD, a11y, perfs, monitoring

## Import de participants (étape 2)

- Flux : fichier/collage → **Worker** (`import.worker.ts` : lecture CSV/xlsx, nettoyage, doublons) → mapping de colonnes → vérification (décisions fusionner / ignorer / créer par groupe de doublons) → écriture par lots → rapport.
- Logique pure et testée dans `src/features/import/lib/` ; types partagés dans `src/db/schemas/import.ts` ; accès Supabase dans `src/db/repositories/import.ts`.
- Rapprochement : une ligne est un doublon d'une société connue de l'équipe ou d'une ligne précédente si le **domaine** est identique, ou si le **nom normalisé** l'est et que les domaines ne se contredisent pas (réseaux sociaux ignorés comme domaine). Fusionner ne fait que **compléter les champs vides**.
- Idempotence : les identifiants sont fixés par le plan ; relancer un plan après une coupure ne crée pas de doublons (upsert).
- Mapping mémorisé par salon dans `import_batches.mapping` (par intitulé de colonne). Le rapport stocké ne contient que des compteurs (pas de données personnelles).

## Préparation du salon (étape 3)

- Routes : `/events/:id` (aperçu), `/participants` (préparation), `/my-list` (ma liste), sous `EventLayout`.
- **Cible** = `event_companies` + entreprise + assignés + tags. Priorité `A/B/C` et objectif (`demo`, `intro_decision_maker`, `watch`, `other`) sont des enums ; commentaire dans `prep_comment`.
- **Assignation multiple** : table `event_company_assignees` (soft delete). Plusieurs commerciaux peuvent viser la même entreprise ; toute assignation vers une cible déjà visée déclenche une alerte (ajouter quand même / remplacer / ignorer / annuler), et la cible « contestée » est signalée partout.
- **Tags** : portent sur l'**entreprise** (`taggings`, `taggable_table = 'companies'`), donc partagés d'un salon à l'autre ; libellé unique par équipe (casse ignorée) ; tout membre peut en poser/retirer.
- **Rendez-vous** : une ligne `meetings` (`planned_at`, `planned_duration_min`, `reminder_minutes`). Le rappel est porté par l'export `.ics` (alarme de l'agenda) et par une bannière dans « Ma liste » tant que l'app est ouverte ; pas de notification push (à venir avec le service worker).
- **Performance** : tout est chargé en mémoire (pagination de 1 000), filtré/trié côté client, rendu **fenêtré** (tableau desktop et cartes mobile) ; les écritures sont optimistes avec retour arrière et bandeau d'erreur.
- **Historique** : rencontres et notes des autres salons via `event_companies` de la même entreprise.

## Mode terrain et synchronisation (étape 4)

- Routes `/events/:id/field` (« À voir maintenant ») et `/events/:id/field/:targetId` (fiche rencontre), plein écran, hors `AppLayout`.
- **Écriture locale d'abord** : `src/db/local/write.ts` modifie la ligne IndexedDB et ajoute l'opération à l'`outbox` dans la même transaction. Les modifications d'une même ligne sont **fusionnées** (par champ) tant que l'opération n'est pas partie ; une opération en cours d'envoi est verrouillée (nouvelle opération à la suite).
- **Moteur** `src/sync/engine.ts` : `push` (ordre de création → parents avant enfants, idempotent par upsert ; erreur réseau = arrêt et nouvel essai, refus du serveur = quarantaine visible, « forcer la sync » les relance) puis `pull` par curseur `server_seq` (par salon pour `event_companies`, `meetings`, assignations ; global pour le reste). Un pull n'écrase **jamais** une ligne qui a une modification locale en attente.
- **Déclencheurs** (`manager.ts`, sans Background Sync pour iOS) : lancement, retour du réseau, retour au premier plan, toutes les 20 s, et 0,7 s après chaque écriture (envoi seul).
- **Photos** : compressées (~300 Ko), stockées en local (`blobs`) + pièce jointe « en attente » ; le fichier part dans le bucket privé `attachments` (`<team_id>/<id>.jpg`) avant la ligne qui le décrit.
- **Dictée** : Web Speech API (fr-FR) quand elle existe et que le réseau est là ; sinon repli sur le micro du clavier (qui dicte hors-ligne). Le champ de note reste actif dans tous les cas.
- **Thèmes** : `auto` / `clair` / `soleil` (contraste maximal) / `sombre`, par redéfinition des variables de couleur Tailwind sous `[data-theme]`.
- **Hors-ligne au rechargement** : l'équipe est mise en cache (`localStorage`) pour que l'app s'ouvre sans réseau ; le shell est précaché par le service worker (build de production).
