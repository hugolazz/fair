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

| Fichier                                  | Contenu                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `20261002000001_schema.sql`              | tables, enums, index                                                      |
| `20261002000002_sync_triggers.sql`       | profils (trigger `handle_new_user`), horodatages                          |
| `20261002000003_rls.sql`                 | RLS de base : isolation par équipe, `create_team`, invitations            |
| `20261002000004_prepare.sql`             | préparation du salon (cibles, tags, assignations, rendez-vous)            |
| `20261002000005_field.sql`               | bucket privé `attachments` (image du plan, logo)                          |
| `20261002000006_sync_conflicts.sql`      | reste d'un ancien mode hors-ligne, supprimé par la suivante               |
| `20261002000007_floorplans.sql`          | plan du salon, pins, clé de stand                                         |
| `20261002000008_drop_sync_conflicts.sql` | retire la table de l'ancien mode hors-ligne                               |
| `20261002000009_exports.sql`             | logo d'équipe, bucket privé `exports`                                     |
| `20261002000010_roles.sql`               | **rôles** admin d'équipe / commercial (RLS), dernier propriétaire protégé |
| `20261002000011_duplicate_event.sql`     | **duplication d'un salon** (`duplicate_event`)                            |

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
- **Providers → Email** : activé. Désactiver _Enable sign ups_ si l'équipe est fermée (les collègues arrivent par invitation).
- **Email Templates** : reporter ceux de `supabase/templates/` (signés « fair »).
- **SMTP** : configurer un SMTP personnalisé avec le nom d'expéditeur `fair` (le SMTP intégré est limité à quelques
  e-mails par heure et ne doit pas servir en production).

L'écran de connexion de fair est **e-mail + mot de passe**. fair n'a pas (encore) d'écran « mot de passe oublié » ni de
choix de mot de passe à l'invitation : créer les comptes dans _Authentication → Users → Add user_ (cocher _Auto Confirm_),
ou envoyer un lien de réinitialisation depuis ce même écran.

### Premier administrateur

1. Créer l'utilisateur dans _Authentication → Users_.
2. Il se connecte sur fair ; au premier login, fair lui demande le nom de l'équipe (fonction `create_team`) : il en devient
   **propriétaire**, c'est-à-dire admin d'équipe.
3. _Réglages_ → inviter les collègues. Par défaut ils sont **commerciaux** ; un admin peut changer leur rôle dans la liste
   des membres.

| Rôle (base)      | Rôle (interface) | Peut                                                                             |
| ---------------- | ---------------- | -------------------------------------------------------------------------------- |
| `owner`, `admin` | Admin d'équipe   | tout : salons, import, tags, plan, assignations, rôles, invitations              |
| `member`         | Commercial       | consulter, s'assigner, préparer ses cibles, planifier ses rendez-vous, ses notes |

Le dernier propriétaire d'une équipe ne peut ni être retiré ni être rétrogradé (déclencheur `protect_last_owner`).

## 4. Edge Functions (facultatif mais recommandé)

```bash
pnpm supabase functions deploy invite-member
pnpm supabase secrets set SITE_URL=https://fair.example.com
pnpm supabase functions deploy generate-export     # facultatif
```

- `invite-member` : crée l'invitation et envoie l'e-mail. Sans elle, on ne peut pas inviter depuis Réglages.
- `generate-export` : génère les gros exports côté serveur. Sans elle, fair génère les fichiers dans le navigateur (aucune
  perte de fonctionnalité, seulement plus lent sur de très gros volumes). Voir [exports.md](exports.md).

Les fonctions utilisent la clé `service_role` **fournie par Supabase dans l'environnement de la fonction** : ne l'ajoutez
jamais à `.env.local` ni au build.

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

## 8. Intégration continue

`.github/workflows/ci.yml` exécute à chaque _push_ : types, lint, format, tests unitaires et RLS, puis les tests de bout en
bout Playwright (faux Supabase, sans secrets) et l'audit Lighthouse mobile. Aucun secret n'est nécessaire.
