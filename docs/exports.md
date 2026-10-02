# Exports en masse et bilan du salon

Deux onglets de chaque salon : **Bilan** (`/events/:id/bilan`) et **Exports** (`/events/:id/exports`), pensés pour le
desktop. Les données viennent de Supabase (sous les droits de l'utilisateur, donc de son équipe).

## 1. Données utilisées

Le bilan et les exports s'appuient sur le **compte-rendu des rencontres**, saisi dans la fiche d'une entreprise
(Participants → entreprise → Rendez-vous → « Compte-rendu ») : **statut** (à voir, en cours, vu, à relancer, pas intéressé,
manqué, écarté), **intérêt** de 1 à 5, **prochaine étape** et **notes**. Sans compte-rendu, les rencontres restent « à voir » et
le bilan est vide : c'est ce qui le nourrit.

- Une rencontre **prévue** est planifiée à l'avance ; **réalisée** = vu, à relancer ou pas intéressé ; **manquée** = manqué ou écarté ;
  **imprévue** = hors planning (`is_unplanned`).
- Une action de suivi **en attente** = une rencontre « à relancer » (avec sa prochaine étape) ou une relance `todo` de la table
  `follow_ups`.
- Une **opportunité** = rencontre réalisée avec un intérêt renseigné (hors « pas intéressé »), classée par intérêt, puis priorité, puis date.
- Les contacts **anonymisés** (RGPD) ne sont jamais exportés ; les contacts **désinscrits** sont signalés dans l'Excel et exclus des CSV
  par défaut.

## 2. Bilan

Prévues vs réalisées (taux de réalisation), répartition par statut, par priorité (entreprises ciblées / rencontrées) et par commercial
(entreprises, prévues, réalisées, manquées, intérêt moyen), top 10 des opportunités, actions de suivi en attente. **Export en PDF d'une
seule page** : les listes longues sont tronquées (« + n autres ») jusqu'à tenir sur une page.

## 3. Exports

| Format                        | Contenu                                                                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Excel (.xlsx)**             | Onglets Entreprises, Contacts, Rencontres, Notes. En-têtes figés, filtres actifs, largeurs adaptées au contenu, dates réelles à l'heure du salon, couleurs par priorité (A rouge, B ambre, C bleu), retour à la ligne des textes longs. |
| **CSV pour CRM**              | Une ligne par contact, colonnes d'un **modèle de mapping** (HubSpot, Salesforce, ou personnalisé). UTF-8, séparateur au choix, protection contre l'injection de formules.                                                               |
| **PDF global**                | Page de garde (logo de l'équipe), sommaire (vrais numéros de page), synthèse, tableau des entreprises, rencontres, notes.                                                                                                               |
| **PDF par commercial**        | Une archive ZIP : un PDF par commercial (ses entreprises et rencontres), même mise en page.                                                                                                                                             |
| **Fiches de rencontre (PDF)** | Une page par rencontre : entreprise, contact, déroulé, qualification (besoin, budget, timing, décideur), notes.                                                                                                                         |

Tous les PDF portent « **généré avec fair** » (toujours en minuscules) et « page n / N » en pied de chaque page.

**Filtres** avant export : statut de la rencontre (y compris « sans rencontre »), priorité, commercial, tags. Plusieurs valeurs = OU ; plusieurs
critères = ET. Un compteur indique en direct combien d'entreprises, rencontres, contacts et notes seront exportés. **Colonnes** : choisies par
onglet pour l'Excel.

### Modèles CSV

- **HubSpot** (contacts) : `First Name`, `Last Name`, `Email`, `Phone Number`, `Job Title`, `Company Name`, `Company Domain Name`, `Website URL`,
  `City`, `Country/Region`, `Lead Status` (statut fair converti : NEW, IN_PROGRESS, CONNECTED, UNQUALIFIED, ATTEMPTED_TO_CONTACT),
  `Lifecycle Stage`.
- **Salesforce** (leads) : `First Name`, `Last Name`, `Company`, `Title`, `Email`, `Phone`, `Website`, `City`, `Country`, `Industry`, `Lead Source`
  (= le salon), `Status` (Open - Not Contacted, Working - Contacted, Closed - Not Converted), `Rating` (priorité A/B/C → Hot/Warm/Cold),
  `Description` (notes).
- **Personnalisé** : « Dupliquer pour le modifier » à partir d'un modèle, ou « Nouveau modèle ». Pour chaque colonne : en-tête, **champ de fair**
  (contact, entreprise, salon, stand, priorité, tags, commerciaux, statut, intérêt, prochaine étape, notes…) ou **valeur fixe** ; ordre, séparateur
  (`,` ou `;`), BOM UTF-8, entreprises sans contact, exclusion des désinscrits. Les modèles personnalisés sont mémorisés **dans ce navigateur**
  (`localStorage`) et envoyés tels quels au serveur pour une génération côté serveur.

## 4. Génération locale ou côté serveur

Le même code (`supabase/functions/_shared/exports/`) tourne dans le navigateur et dans l'Edge Function **`generate-export`**.

- **Automatique** (par défaut) : dans le navigateur jusqu'à 1 500 lignes (entreprises + contacts + rencontres + notes), sur le serveur au-delà.
- **Sur mon ordinateur** / **Sur le serveur** : choix forcé. Côté serveur, l'utilisateur reçoit un **lien de téléchargement signé valable 1 h**.
- En « automatique », un serveur injoignable (ou fonction non déployée) bascule sur la génération locale, avec un message.
- La fonction s'exécute **avec le jeton de l'appelant** (RLS : seules les données de son équipe sont lues, seul le dossier de son équipe est
  écrit) : aucune clé de service. Les fichiers vont dans le bucket privé `exports` (`<team_id>/<horodatage>-<id>-<nom>`) et ceux de plus de
  24 h de l'équipe sont supprimés à chaque génération.
- Les bibliothèques lourdes (Excel, PDF) ne sont chargées qu'à la demande.

### Déploiement (une fois)

1. Appliquer `supabase/migrations/20261002000009_exports.sql` (colonne `teams.logo_path`, bucket privé `exports` et sa politique).
2. Déployer la fonction : `pnpm supabase functions deploy generate-export` (JWT vérifié : `verify_jwt = true`).
3. Facultatif : **Réglages → Logo de l'équipe** (PNG ou JPEG, 2 Mo maximum) pour l'en-tête des PDF.

Sans la fonction déployée, tout fonctionne en local ; seule l'option « Sur le serveur » signale que le serveur n'est pas disponible.

## 5. Architecture

```
supabase/functions/_shared/exports/   (code partagé navigateur + Deno, imports relatifs en .ts)
  types.ts      données et filtres          select.ts    filtres (applyFilters)
  tables.ts     onglets et colonnes         xlsx.ts      classeur Excel (ExcelJS)
  csv.ts        champs, modèles, écriture   bilan.ts     calculs du bilan
  pdf-writer.ts moteur de mise en page      pdf-reports.ts / pdf-bilan.ts   les PDF (pdf-lib)
  fetch.ts      lecture des données         service.ts   demande → fichier (+ validation de l'entrée)
supabase/functions/generate-export/   Edge Function (auth, validation, génération, dépôt, lien signé)
src/db/repositories/exports.ts        lecture des données + appel de la fonction
src/features/exports/                 écrans Bilan et Exports, modèles CSV, choix du mode
```

L'alias `@shared` pointe vers `_shared/` (Vite, TypeScript). La fonction déclare ses dépendances npm dans `generate-export/deno.json`.

## 6. Tests (sur le contenu des fichiers)

| Fichier                                 | Ce qu'il prouve                                                                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/exports/select-bilan.test.ts`    | Filtres (statut, priorité, commercial, tags, combinaisons) et chiffres du bilan.                                                                                                                                                 |
| `tests/exports/xlsx.test.ts`            | **Excel relu** : onglets, en-têtes figés, filtres, largeurs (lues dans le XML), couleurs par priorité, dates à l'heure de Paris, colonnes choisies, valeurs.                                                                     |
| `tests/exports/csv.test.ts`             | **CSV relu** : en-têtes HubSpot / Salesforce, conversions de statut, échappement RFC 4180, désinscrits exclus, injection de formules, modèles personnalisés.                                                                     |
| `tests/exports/pdf.test.ts`             | **PDF relus avec pdf.js** : sommaire et numéros de page exacts, pied « généré avec fair » et « page n / N » partout, logo, chiffres, un PDF par commercial, fiches, bilan sur UNE page, aucun texte qui déborde ni se chevauche. |
| `tests/exports/fetch.test.ts`           | Lecture : lignes supprimées / autre salon / anonymisés exclus, pagination, lots d'identifiants, logo facultatif.                                                                                                                 |
| `tests/exports/service.test.ts`         | Validation des demandes, noms de fichiers, types MIME, ZIP.                                                                                                                                                                      |
| `tests/exports/edge-function.test.ts`   | Logique de l'Edge Function : 401, 400, 404, dépôt dans le bucket, lien signé 1 h, purge à 24 h, pas de clé de service.                                                                                                           |
| `src/features/exports/exports.test.tsx` | Écrans : filtres → compteur → fichier téléchargé au bon contenu, modèles CSV personnalisés, lien serveur, erreurs, bilan et son PDF.                                                                                             |
| `tests/rls/exports.test.ts`             | Bucket `exports` privé et isolé par équipe, logo modifiable par les seuls admins.                                                                                                                                                |

## 7. Limites

- Génération côté serveur sous Deno : le code est testé sous Node (même logique, `Deno.serve` simulé) ; première exécution réelle après déploiement.
- Les modèles CSV personnalisés ne sont pas partagés entre commerciaux (propres au navigateur).
- Polices PDF standard (Latin) : les caractères hors Latin-1 sont remplacés par « ? ».
- Pas de relances ni d'e-mails (bilan et exports seulement).
