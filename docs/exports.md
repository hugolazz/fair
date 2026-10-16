# Export et bilan du salon

Deux onglets de chaque salon : **Bilan** (`/events/:id/bilan`) et **Exports** (`/events/:id/exports`). Les données viennent de
Supabase, sous les droits de l'utilisateur (donc de son équipe). Tout est généré **dans le navigateur** : aucune fonction serveur.

## 1. Export : le fichier d'import, enrichi

Trois formats, aucun filtre, aucun réglage. Le fichier est **celui qu'on a importé, enrichi de tout ce qui s'est passé pendant le salon**,
**une ligne par contact** (une seule ligne pour une entreprise sans contact), entreprises triées par nom.

| Colonnes                        | Contenu                                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 à 14, **reprise de l'import** | Société · Site web · Stand · Secteur · Pays · Ville · Priorité (A / B / C) · Type (tags) · Contact · Fonction · E-mail · Téléphone · LinkedIn · Commentaire (= historique de l'entreprise)           |
| 15 à 22, **pendant le salon**   | Commerciaux · Statut de la rencontre · Date de la rencontre · Intérêt (1-5) · À recontacter (Oui / Non, propre à chaque contact) · Prochaine étape · Notes du salon (datées et signées) · Désinscrit |

Les 14 premiers intitulés sont **ceux du fichier d'import** : le fichier exporté se **réimporte tel quel**, les colonnes se mappent toutes
seules (test d'aller-retour dans `src/features/import/lib/enrichment.test.ts`). Statut, date, intérêt et prochaine étape sont ceux de la
**dernière rencontre** de l'entreprise (intérêt = le plus élevé) ; les notes de **toutes** ses rencontres sont réunies. Une entreprise sans
rencontre indique « Pas de rencontre ».

| Format                  | Détail                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Excel (.xlsx)**       | Un onglet « Salon », en-têtes figés, filtres actifs, largeurs adaptées, vraies dates à l'heure du salon, couleurs par priorité.                |
| **CSV**                 | Même contenu. UTF-8 avec BOM, séparateur « ; » (accents corrects dans Excel FR), protection contre l'injection de formules (`=`, `@`, `+`).    |
| **PDF de compte-rendu** | Page de garde (logo de l'équipe), sommaire, synthèse, tableau des entreprises, rencontres, notes. Pied « généré avec fair » et « page n / N ». |

Les contacts **anonymisés** (RGPD) ne sont jamais exportés ; les contacts **désinscrits** sont exportés mais marqués « Oui » dans la colonne
« Désinscrit » (à ne pas relancer).

## 2. Bilan

Prévues vs réalisées, répartition par statut / priorité / commercial, top 10 des opportunités, actions de suivi en attente. **Export en PDF
d'une seule page** (listes tronquées « + n autres » jusqu'à tenir sur une page).

- Une rencontre **prévue** est planifiée à l'avance ; **réalisée** = vu, à relancer ou pas intéressé ; **manquée** = manqué ou écarté ;
  **imprévue** = hors planning.
- Une **opportunité** = rencontre réalisée avec un intérêt renseigné (hors « pas intéressé »).

## 3. Architecture

```
supabase/functions/_shared/exports/   (code partagé, imports relatifs en .ts, alias @shared)
  types.ts   données            tables.ts  le tableau du salon (SALON_COLUMNS, buildSalonTable)
  xlsx.ts    classeur Excel     csv.ts     CSV du salon
  bilan.ts   calculs du bilan   pdf-writer.ts / pdf-reports.ts / pdf-bilan.ts   les PDF (pdf-lib)
  fetch.ts   lecture des données  service.ts  generateExport(data, 'xlsx' | 'csv' | 'pdf' | 'pdf-bilan')
src/db/repositories/exports.ts        lecture des données du salon
src/features/exports/                 écrans Exports (3 boutons) et Bilan
```

Les bibliothèques lourdes (Excel, PDF) ne sont chargées qu'au moment du téléchargement.

## 4. Tests (sur le contenu des fichiers)

| Fichier                              | Ce qu'il prouve                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/exports/salon.test.ts`        | Table (colonnes, une ligne par contact, dernière rencontre, notes, « à recontacter » par contact), CSV relu, Excel relu, noms de fichiers |
| `tests/exports/pdf.test.ts`          | PDF relus avec pdf.js : sommaire, pieds de page, logo, chiffres, bilan sur UNE page, aucun texte qui déborde                              |
| `tests/exports/select-bilan.test.ts` | Chiffres du bilan                                                                                                                         |
| `tests/exports/fetch.test.ts`        | Lecture : lignes supprimées / autre salon / anonymisés exclus, pagination                                                                 |
| `tests/e2e/journey.spec.ts`          | Parcours : export Excel, CSV et PDF depuis l'interface, fichier relu                                                                      |

## 5. Limites

- Polices PDF standard (Latin) : les caractères hors Latin-1 sont remplacés par « ? ».
- Génération locale : très gros salons (plusieurs dizaines de milliers de lignes) plus lents ; l'ancienne génération côté serveur a été retirée
  pour simplifier (le bucket `exports` de la migration 9 reste en base, inutilisé).
