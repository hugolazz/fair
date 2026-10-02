# fair

fair aide les commerciaux à préparer leurs salons professionnels (participants, priorités, assignations, rendez-vous, plan du salon). Voir [CLAUDE.md](CLAUDE.md) pour les conventions et [docs/architecture.md](docs/architecture.md) pour l'architecture.

## Démarrage

Prérequis : Node.js LTS, pnpm, Docker (pour Supabase en local).

```bash
pnpm install
pnpm supabase start        # affiche l'URL API et la clé anon
```

Créez `.env.local` à partir de `.env.example` (URL et clé anon affichées par la commande ci-dessus), puis :

```bash
pnpm dev                   # http://localhost:5173
```

Les e-mails d'auth et d'invitation arrivent dans la boîte locale Inbucket : http://127.0.0.1:54324.

Pour tester les invitations, servez l'Edge Function :

```bash
pnpm supabase functions serve invite-member
```

## Premier login

1. Saisissez votre e-mail sur `/login`, ouvrez le lien magique reçu (Inbucket en local).
2. Au premier login, fair vous demande le nom de votre équipe (sauf si un collègue vous a déjà invité : vous la rejoignez automatiquement).
3. Réglages → Inviter un collègue.

## Production (Supabase hébergé)

- Appliquer les migrations : `pnpm supabase db push` (ou, sans CLI, coller dans le SQL Editor les fichiers de `supabase/migrations/` dans l'ordre, **y compris `20261002000005_field.sql`** (qui crée le bucket privé `attachments`, utilisé pour l'image du plan) et **`20261002000007_floorplans.sql`** : plan du salon, pins, clé de stand). **`20261002000009_exports.sql`** (logo d'équipe et bucket privé `exports` pour les exports générés côté serveur). `20261002000006_sync_conflicts.sql` ne sert plus à rien (reste d'un ancien mode hors-ligne) mais est inoffensive. Détails : [docs/plan.md](docs/plan.md).
- Déployer la fonction : `pnpm supabase functions deploy invite-member` et définir le secret `SITE_URL` (URL publique de fair).
- Déployer la génération d'exports côté serveur : `pnpm supabase functions deploy generate-export` (facultatif : sans elle, les exports se génèrent dans le navigateur). Voir [docs/exports.md](docs/exports.md).
- Les modèles d'e-mails de `supabase/templates/` sont signés « fair » ; en hébergé, les reporter dans _Authentication → Email Templates_ (ou `supabase config push`).
- Pour que l'expéditeur affiche « fair », configurer un SMTP personnalisé (nom d'expéditeur `fair`).
- Ajouter l'URL de fair aux _Redirect URLs_ de l'authentification.

## Tests

```bash
pnpm test        # unitaires, RLS (PGlite, sans Docker) et règle de marque
pnpm typecheck && pnpm lint
```
