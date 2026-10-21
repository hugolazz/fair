# fair — guide de déploiement

fair est une SPA statique (Vite) qui parle directement à un projet Supabase hébergé. Il n'y a rien d'autre à héberger :
un projet Supabase, un hébergeur de fichiers statiques et, facultativement, deux Edge Functions.

```
navigateur ──► hébergeur statique (dist/)        HTML, JS, CSS, manifest
     │
     └──────► Supabase (UE) : Auth · Postgres + RLS · Storage · Edge Functions
```

## 1. Projet Supabase

1. Créer un projet sur [supabase.com](https://supabase.com) dans une **région UE** (Francfort, Paris…) : les contacts sont des
   données personnelles (hébergement UE, voir « RGPD » dans [CLAUDE.md](../CLAUDE.md)).
2. Noter dans _Project Settings → API_ : l'**URL du projet** et la clé **`anon`** (publique). Ne jamais copier la clé
   `service_role` ailleurs que dans les secrets Supabase.
3. Vérifier que l'URL répond : `https://<ref>.supabase.co/auth/v1/health` doit renvoyer du JSON. Si le nom de domaine ne
   se résout pas, le projet a été supprimé ou mis en pause : le restaurer ou en recréer un.

## 2. Base de données

Les migrations de `supabase/migrations/` sont la source de vérité. **L'ordre compte.**

Avec la CLI (recommandé) :

```bash
pnpm supabase login
pnpm supabase link --project-ref <ref>
pnpm supabase db push
```

Sans la CLI : coller les fichiers dans _SQL Editor_, **dans l'ordre numérique** :

| Fichier                                      | Contenu                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `20261002000001_schema.sql`                  | tables, enums, index                                                                        |
| `20261002000002_sync_triggers.sql`           | profils (trigger `handle_new_user`), horodatages                                            |
| `20261002000003_rls.sql`                     | RLS de base : isolation par équipe, `create_team`, invitations                              |
| `20261002000004_prepare.sql`                 | préparation du salon (cibles, tags, assignations, rendez-vous)                              |
| `20261002000005_field.sql`                   | bucket privé `attachments` (image du plan, logo)                                            |
| `20261002000006_sync_conflicts.sql`          | reste d'un ancien mode hors-ligne, supprimé par la suivante                                 |
| `20261002000007_floorplans.sql`              | plan du salon, pins, clé de stand                                                           |
| `20261002000008_drop_sync_conflicts.sql`     | retire la table de l'ancien mode hors-ligne                                                 |
| `20261002000009_exports.sql`                 | logo d'équipe, bucket privé `exports`                                                       |
| `20261002000010_roles.sql`                   | **rôles** admin d'équipe / commercial (RLS), dernier propriétaire protégé                   |
| `20261002000011_duplicate_event.sql`         | **duplication d'un salon** (`duplicate_event`)                                              |
| `20261002000012_manual_entries.sql`          | **saisie manuelle** (entreprises et contacts), colonne `meetings.recontact`                 |
| `20261002000013_company_history.sql`         | colonne `companies.history` (historique de l'entreprise)                                    |
| `20261002000014_edit_companies.sql`          | tout membre peut modifier une fiche d'entreprise (« Modifier la fiche »)                    |
| `20261002000015_signup_teams.sql`            | création de compte libre, recherche d'équipe, `join_team`, `create_team`                    |
| `20261002000016_backfill_profiles.sql`       | profils des comptes existants                                                               |
| `20261002000017_leave_team.sql`              | quitter l'équipe (`leave_team`)                                                             |
| `20261002000018_meeting_news.sql`            | case « Actualité ? » : `teams.news_enabled` et `meetings.news`                              |
| `20261002000019_retire_orphan_companies.sql` | un salon supprimé retire aussi ses entreprises qui ne sont nulle part ailleurs              |
| `20261002000020_show_tags.sql`               | pastilles de salons : `tags.kind` (`type` ou `show`)                                        |
| `20261002000021_meeting_auto_created.sql`    | rencontre créée par le bloc-notes : `meetings.auto_created`, nettoyage des rencontres vides |

Contrôle après coup, dans _SQL Editor_ :

```sql
select count(*) from pg_policies where schemaname = 'public';   -- > 0 sur chaque table
select tablename from pg_tables where schemaname = 'public' and not rowsecurity;  -- doit être vide
select proname from pg_proc where proname in ('create_team', 'duplicate_event', 'accept_pending_invitations');
```

> Toute nouvelle table : `team_id` + RLS + test dans `tests/rls/` (voir [CLAUDE.md](../CLAUDE.md)).

## 3. Authentification

Dans _Authentication_ :

- **URL Configuration** : _Site URL_ = l'URL publique de fair ; ajouter la même URL (et celle de prévisualisation éventuelle)
  aux _Redirect URLs_.
- **Providers → Email** : activé. Les collègues créent leur compte et rejoignent l'équipe par son nom ; l'inscription est donc libre.
- **Email Templates** : reporter ceux de `supabase/templates/` (signés « fair »).
- **SMTP** : configurer un SMTP personnalisé avec le nom d'expéditeur `fair` (le SMTP intégré est limité à quelques
  e-mails par heure et ne doit pas servir en production).

L'écran de connexion de fair est **e-mail + mot de passe**, avec « Créer un compte » et « Mot de passe oublié ? » (le lien
de réinitialisation part par e-mail : voir le SMTP ci-dessus).

### Premier administrateur

1. Créer l'utilisateur dans _Authentication → Users_.
2. Il se connecte sur fair ; au premier login, fair lui demande le nom de l'équipe (fonction `create_team`) : il en devient
   **propriétaire**, c'est-à-dire admin d'équipe.
3. Les collègues créent leur compte et rejoignent l'équipe en tapant son nom. Par défaut ils sont **commerciaux** ; un
   admin peut changer leur rôle dans la liste des membres (_Réglages_).

| Rôle (base)      | Rôle (interface) | Peut                                                                             |
| ---------------- | ---------------- | -------------------------------------------------------------------------------- |
| `owner`, `admin` | Admin d'équipe   | tout : salons, import, tags, plan, assignations, rôles                           |
| `member`         | Commercial       | consulter, s'assigner, préparer ses cibles, planifier ses rendez-vous, ses notes |

Le dernier propriétaire d'une équipe ne peut ni être retiré ni être rétrogradé (déclencheur `protect_last_owner`).

## 4. Edge Functions

Aucune : les exports (Excel, CSV, PDF) sont générés dans le navigateur (voir [exports.md](exports.md)) et il n'y a pas
d'invitation par e-mail. Aucune clé `service_role` n'est nécessaire côté projet.

## 5. Build et hébergement du front

Variables de build (publiques) :

```
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé anon>
```

```bash
pnpm install --frozen-lockfile
pnpm build            # vérifie les types puis produit dist/
```

Ne **jamais** définir `VITE_DEV_EMAIL` / `VITE_DEV_PASSWORD` en production (connexion automatique de développement ;
ignorée dans un build de production, mais inutile d'y laisser un mot de passe).

Héberger `dist/` sur n'importe quel hébergeur statique (Netlify, Vercel, Cloudflare Pages, S3 + CDN, nginx…) avec :

- **Réécriture SPA** : toute URL inconnue renvoie `index.html` (React Router).
- **HTTPS** obligatoire (installation sur l'écran d'accueil, sécurité).
- Mettre en cache `assets/*` longtemps (noms hachés) mais **pas** `index.html`.

Exemples de réécriture :

```
# Netlify : public/_redirects  (ou netlify.toml)
/*  /index.html  200
```

```json
// Vercel : vercel.json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

```nginx
# nginx
location / { try_files $uri /index.html; }
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable"; }
```

En-têtes de sécurité conseillés (à adapter à l'hébergeur) :

```
Content-Security-Policy: default-src 'self'; connect-src 'self' https://<ref>.supabase.co; img-src 'self' data: blob: https://<ref>.supabase.co; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

(`worker-src blob:` : l'import et la lecture du PDF d'un plan utilisent des Web Workers.)

## 6. Vérifications après déploiement

1. `https://<site>/login` s'affiche, la connexion fonctionne.
2. Créer un salon, importer `exemples/participants-50.csv`, ouvrir _Participants_.
3. Avec un compte **commercial** : pas de bouton « Nouveau salon », `/events/<id>/import` renvoie « réservée aux admins ».
4. _Exports_ → Excel : le fichier se télécharge.
5. Installer l'appli (menu du navigateur → _Installer fair_) : le manifest est valide.

## 7. Sauvegardes, rétention, mises à jour

- **Sauvegardes** : activer les sauvegardes quotidiennes du projet Supabase (plan Pro) ou planifier un `pg_dump` régulier ;
  les fichiers (plans, logos) sont dans Storage.
- **RGPD** : les contacts sont des données personnelles. Prévoir qui répond aux demandes d'accès, d'effacement et
  d'opposition, et une durée de conservation ; les colonnes `opt_out_at` et `anonymized_at` des contacts existent, mais
  fair n'a pas encore d'écran dédié à ces demandes (à faire en SQL ou à ajouter).
- **Mise à jour** : `git pull`, `pnpm install`, `pnpm supabase db push` (nouvelles migrations), `pnpm build`, redéployer `dist/`.
  Appliquer les migrations **avant** de publier le nouveau front.
- **Retour arrière** : redéployer l'ancien `dist/` ; les migrations ne sont pas réversibles automatiquement — écrire une
  migration corrective plutôt que de modifier une migration déjà appliquée.

## 8. Auto-héberger Supabase (sans supabase.com)

fair parle directement à l'API de Supabase (PostgREST, authentification, stockage) et ses règles d'accès sont des politiques
RLS dans Postgres : on ne remplace donc pas Supabase par une autre base sans réécrire la couche `src/db/repositories/`.
En revanche, **Supabase lui-même peut tourner sur vos serveurs** (open source, Docker) : les données restent chez vous et
le code de fair ne change pas.

1. Déployer Supabase en auto-hébergement en suivant le guide officiel « Self-Hosting with Docker »
   (<https://supabase.com/docs/guides/self-hosting/docker>) : il fournit un `docker-compose.yml` et un `.env` modèle.
2. Dans ce `.env`, **remplacer tous les secrets par défaut** (mot de passe Postgres, `JWT_SECRET`, `ANON_KEY`,
   `SERVICE_ROLE_KEY`, mot de passe du tableau de bord) et régler l'authentification :
   - `SITE_URL` et `ADDITIONAL_REDIRECT_URLS` : l'URL publique de fair (équivalent de la section 3) ;
   - `SMTP_*` : un serveur SMTP, nécessaire pour « Mot de passe oublié » ;
   - `ENABLE_EMAIL_AUTOCONFIRM=true` si l'on ne veut pas de confirmation par e-mail à l'inscription.
3. Rejouer les migrations dans l'ordre, contre la base auto-hébergée (voir la section 2), par exemple :

   ```bash
   pnpm supabase db push --db-url "postgresql://postgres:<mot de passe>@<hôte>:5432/postgres"
   ```

   Le service de stockage doit être actif : les migrations créent les buckets privés `attachments` (plan, logo) et `exports`.

4. Construire fair avec `VITE_SUPABASE_URL` (l'URL de l'API, derrière HTTPS) et `VITE_SUPABASE_ANON_KEY` (la clé `anon`
   de ce `.env`), puis héberger `dist/` (section 5).
5. Mettre en place les sauvegardes (`pg_dump` régulier + volume de stockage), les mises à jour de Supabase et le
   renouvellement du certificat HTTPS : tout cela devient votre responsabilité.

Reprendre les données d'un projet hébergé : `pg_dump` des schémas `public` et `auth` (les comptes sont dans
`auth.users`), puis restauration sur la nouvelle base après avoir rejoué les migrations ; les fichiers de Storage
(plans, logos) se copient à part.

## 9. Intégration continue

`.github/workflows/ci.yml` exécute à chaque _push_ : types, lint, format, tests unitaires et RLS, puis les tests de bout en
bout Playwright (faux Supabase, sans secrets) et l'audit Lighthouse mobile. Aucun secret n'est nécessaire.
