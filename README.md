# fair

fair aide les commerciaux qui se rendent sur des salons tech (Tech For Retail, NRF…) à **préparer** leurs rencontres et à
**garder l'historique par entreprise** d'un salon à l'autre. Elle remplace le bloc-notes.

Usage interne : l'appli est utilisée connectée (pas de mode hors-ligne ni de mode terrain).

## Fonctionnalités

- **Salons** : création, statut, dates, objectifs ; **duplication comme modèle** (configuration, mapping d'import et, au
  choix, la liste des participants) pour préparer l'édition suivante.
- **Import des participants** : CSV / Excel (jusqu'à 20 000 lignes), mapping des colonnes, nettoyage, détection des doublons,
  rapport d'erreurs téléchargeable. Colonnes reconnues : société, site, stand, secteur, pays, ville, contact (nom complet ou
  prénom / nom), poste, e-mail, téléphone, **LinkedIn**, **priorité** (A/B/C) et **type** (client, prospect… = tag).
  Plusieurs contacts pour une même entreprise : sur des lignes distinctes (l'entreprise est fusionnée) ou dans une même
  cellule séparés par « ; » ou un retour à la ligne (nom 1 ; nom 2 — e-mail 1 ; e-mail 2) ; le premier est le contact clé.
- **Ajout manuel** : « Ajouter une entreprise » (page Participants et page d'import) sans passer par un fichier, avec son
  contact clé ; l'entreprise est rapprochée de celles déjà connues de l'équipe (jamais dupliquée, son historique suit).
- **Prise de notes sur le salon** : ouvrez une entreprise → historique, contact clé, grand champ de notes, ajout d'un
  contact (prénom, nom, poste, e-mail, téléphone, LinkedIn dans des cases séparées) et case **« À recontacter après le
  salon »** (Oui / Non), reprise dans les exports Excel, CSV et PDF.
- **Préparation** : priorités A/B/C, objectifs, tags, commentaires, assignations (alerte si deux commerciaux visent la même
  entreprise), rendez-vous avec rappel et export `.ics`, **Ma liste** triée par priorité.
- **Vue équipe** : qui a rencontré quelle entreprise, qui doit encore la voir, risque de doublon de relance.
- **Plan du salon** : image ou PDF, pins de stands reliés aux entreprises, mode « Je suis ici ».
- **Compte-rendu et notes** par rencontre, **historique** de l'entreprise sur les autres salons.
- **Export** : le fichier importé, **enrichi de tout ce qui s'est passé pendant le salon** (statut, date, intérêt, à recontacter,
  prochaine étape, notes, nouveaux contacts), une ligne par contact, en Excel, CSV ou PDF. Aucun filtre, aucun réglage ; le
  fichier se réimporte tel quel. **Bilan** du salon en PDF d'une page.
- **Rôles** : admin d'équipe et commercial (voir ci-dessous).

### Rôles

| Rôle           | Peut                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| Admin d'équipe | tout : créer / dupliquer / supprimer des salons, importer, gérer tags et plan, assigner, gérer les rôles |
| Commercial     | tout consulter, s'assigner, préparer ses cibles, planifier ses rendez-vous et rédiger ses comptes-rendus |

Les droits sont **appliqués par la base** (RLS), pas seulement masqués dans l'interface : un commercial qui contournerait
l'interface est refusé par Postgres. L'interface grise ou masque ce qui serait refusé.

## Stack

TypeScript strict · React + Vite + React Router (SPA) · Tailwind + shadcn/ui · Supabase (Postgres, Auth, Storage, Edge
Functions, RLS) · zod · react-hook-form · react-i18next · Vitest, Testing Library, Playwright, axe, Lighthouse, PGlite.

## Démarrage

Prérequis : Node.js 24, pnpm 12, et Docker **seulement** pour faire tourner Supabase en local.

```bash
pnpm install
pnpm supabase start        # Supabase local (Docker) : affiche l'URL API et la clé anon
```

Créez `.env.local` à partir de `.env.example` (URL et clé anon affichées par la commande ci-dessus), puis :

```bash
pnpm dev                   # http://localhost:5173
```

Sans Docker, pointez `.env.local` vers un projet Supabase hébergé (voir [docs/deploiement.md](docs/deploiement.md)).
Les e-mails d'auth du Supabase local arrivent dans Inbucket : http://127.0.0.1:54324.

### Premier login

fair se connecte par **e-mail + mot de passe**.

1. Créez un utilisateur dans Supabase (_Authentication → Users → Add user_, avec mot de passe).
2. Connectez-vous sur `/login`. Au premier login, fair demande le nom de l'équipe : vous en devenez propriétaire (admin).
3. Vos collègues créent leur compte et rejoignent l'équipe en tapant son nom ; ils arrivent commerciaux, changez leur rôle dans _Réglages_ → liste des membres.

> Connexion automatique de développement : `VITE_DEV_EMAIL` et `VITE_DEV_PASSWORD` dans `.env.local` (jamais en production).

### Dépannage

- **« Failed to fetch » / `ERR_NAME_NOT_RESOLVED` à la connexion** : l'URL de `VITE_SUPABASE_URL` ne répond pas (projet supprimé,
  en pause ou faute de frappe). Ouvrez `<URL>/auth/v1/health` dans le navigateur : il doit renvoyer du JSON.
- **« Impossible de charger … »** : un refus de politique RLS ou une migration non appliquée. Comparez
  `supabase/migrations/` avec ce qui est appliqué (`pnpm supabase migration list`).
- **Un commercial ne voit pas un bouton** : normal, voir [Rôles](#rôles).

## Commandes

```bash
pnpm dev               # serveur Vite
pnpm build             # types + build de production (dist/)
pnpm preview           # sert le build
pnpm typecheck         # tsc --noEmit
pnpm lint              # eslint
pnpm format            # prettier --write
pnpm test              # Vitest : unitaires, RLS (PGlite), exports (fichiers relus), marque, faux Supabase
pnpm test:rls          # uniquement les tests RLS
pnpm test:e2e          # Playwright : parcours complet, rôles, accessibilité (axe), mobile
pnpm lighthouse        # audit Lighthouse mobile d'un build servi sur :4173 (voir plus bas)
pnpm fixtures          # régénère les fichiers d'import d'exemple sales
pnpm icons             # régénère les icônes PWA
```

## Tests

| Niveau        | Outil                        | Ce qui est vérifié                                                                                    |
| ------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Unitaires     | Vitest, Testing Library      | logique pure (import, préparation, vue équipe, géométrie du plan), composants                         |
| RLS           | Vitest + PGlite              | les **vraies migrations** rejouées dans Postgres (WASM) : isolation entre équipes, rôles, duplication |
| Exports       | Vitest + ExcelJS / pdf.js    | les fichiers générés sont **relus** (onglets, colonnes, pieds de page, absence de débordement)        |
| Bout en bout  | Playwright (Edge / Chromium) | parcours complet, rôles, vue équipe, duplication                                                      |
| Accessibilité | axe-core dans Playwright     | WCAG 2.2 AA sur chaque écran + clavier (lien d'évitement, focus, fiche) + cibles tactiles ≥ 44 px     |
| Performance   | Lighthouse                   | score mobile du build de production                                                                   |

### Tests de bout en bout sans Docker

`pnpm test:e2e` construit l'appli (`dist-e2e/`), la sert avec `vite preview` et la branche sur un **faux Supabase**
(`tests/e2e/fake-supabase/`) : les migrations réelles tournent dans PGlite derrière une façade HTTP qui parle assez de
PostgREST et de GoTrue pour `supabase-js`. Les politiques RLS s'y appliquent comme en production. Aucun secret, aucun réseau.

Ce que ce faux serveur **ne couvre pas** : Storage (plans, logo), les Edge Functions (export serveur — les exports
retombent sur la génération dans le navigateur), l'envoi d'e-mails. Ces parties se vérifient sur un vrai Supabase (voir la
liste de contrôle de [docs/deploiement.md](docs/deploiement.md)).

Parcours testé (`tests/e2e/journey.spec.ts`) : créer l'équipe → créer un salon → importer `exemples/participants-50.csv` →
prioriser et s'assigner → planifier un rendez-vous, compte-rendu et note → recharger (tout est bien enregistré côté serveur)
→ exporter en Excel et relire le fichier.

Options utiles : `pnpm test:e2e --project=desktop`, `--headed`, `--ui`. Playwright utilise **Microsoft Edge** installé en
local (rien à télécharger) et le Chromium de Playwright en CI.

### Lighthouse

```bash
pnpm exec vite build --outDir dist-e2e          # (ou pnpm test:e2e, qui le fait)
pnpm exec vite preview --outDir dist-e2e --port 4173
pnpm lighthouse                                  # rapport HTML dans lighthouse-report/
```

Lighthouse 12+ n'a plus de catégorie « PWA » : on mesure Performance, Accessibilité, Bonnes pratiques et SEO. L'installabilité
est vérifiée par `tests/manifest.test.ts` (manifest, icônes 192 / 512 / maskable). fair n'a volontairement **pas de service
worker** (pas de mode hors-ligne) : l'écran de connexion est audité, les écrans suivants partagent le même code d'amorçage.

## Structure

```
supabase/{migrations,functions,templates}   base, Edge Functions, e-mails
src/
  app/        routeur, gardes (connexion, équipe, admin), cadre
  features/   un dossier par domaine : auth-team, events, import, manual-entry, prepare, plan, exports, settings
  db/         repositories (seul accès à Supabase) et schémas zod
  components/ lib/ locales/fr/
tests/{rls,exports,fixtures,e2e}
docs/         architecture, plan, exports, déploiement
```

Règle : `features/*` → `db/repositories`, `components`, `lib` ; jamais l'inverse, et jamais d'appel Supabase depuis une feature
(règle ESLint). Détails : [docs/architecture.md](docs/architecture.md).

## Conventions

- Le nom du produit est **fair**, toujours en minuscules (UI, PDF, e-mails, commits) ; `tests/brand.test.ts` le vérifie.
- Interface en français via i18n (aucun texte en dur) ; code et identifiants en anglais.
- Commits : Conventional Commits. Voir [CLAUDE.md](CLAUDE.md) pour le détail (accessibilité, RGPD, sécurité, tests).

## Déploiement

Guide complet : [docs/deploiement.md](docs/deploiement.md) (projet Supabase UE, migrations dans l'ordre, authentification,
Edge Functions, hébergement statique, en-têtes de sécurité, vérifications, sauvegardes, mises à jour).
