# Plan interactif du salon

Onglet **Plan du salon** de chaque salon (`/events/:id/plan`) : ajouter l'image du plan, **poser les stands**, les relier aux
entreprises du salon, retrouver une entreprise. Les données sont lues et écrites **directement sur Supabase**
(`src/db/repositories/plans.ts`), comme le reste de la préparation.

## 1. Parcours

- **Ajouter le plan** : PNG, JPEG, WebP ou **PDF** (première page seulement), 40 Mo maximum, par bouton ou
  glisser-déposer. Un PDF est converti en image dans le navigateur (pdf.js, chargé **à la demande**) ; toute image est
  ramenée à ≤ 4 096 px de côté et ≤ 12 Mpx, en WebP (JPEG à défaut), puis envoyée dans le bucket privé `attachments`
  (`<team_id>/<fichier>`). Plusieurs plans par salon sont possibles (sélecteur) ; un seul suffit.
- **Poser un stand** : un clic sur le plan ouvre un panneau avec les entreprises du salon, **non placées d'abord**, puis par
  priorité. **Entrée** valide la première ligne. Saisir un **numéro de stand** remonte en tête les entreprises du même
  stand (`A-05` retrouve `A5`) ; « Stand seul » crée un pin sans entreprise.
- **Entreprise d'abord** : un clic sur une entreprise de la liste l'« arme » ; le clic suivant sur le plan la place.
- Un pin sélectionné se **relie / délie**, change de numéro, se **déplace** (bouton puis clic sur le plan) ou se supprime.
  « Annuler » reste proposé 10 s après un ajout ou une suppression. `Échap` annule l'action en cours.
- Un numéro saisi sur un pin **complète le stand** de la participation si elle n'en avait pas. Un pin garde toujours
  **au moins** une entreprise ou un numéro de stand.
- **Depuis une fiche** (préparation) : « Voir sur le plan du salon » ouvre le plan **centré et zoomé** sur le stand
  (`?target=<id>`).
- **« Je suis ici »** : position posée **à la main** (pas de GPS en intérieur), gardée sur l'appareil
  (`localStorage`, par plan), jamais envoyée au serveur. « Me centrer » y revient.

## 2. Visionneuse

Fluide : l'état de la vue (échelle, décalage) vit dans une référence et s'applique **directement au DOM**, une
transformation par image ; React ne refait jamais le rendu pendant un geste. Les pins sont dans une couche à part,
repositionnés à chaque image **à leur taille réelle** : nets et à taille constante (zone tactile 44 px) quel que soit le
zoom.

- Déplacement (souris / doigt), **zoom molette**, **pincement à deux doigts**, boutons + / − / « voir tout le plan »,
  clavier (flèches, + / −, 0). Un appui sans déplacement (< 8 px) est un « tap » ; un déplacement ne déclenche jamais
  l'ouverture d'un pin.
- Zoom de « tout le plan » à ×10 ; le plan ne peut pas être poussé hors de l'écran. Les noms apparaissent à partir de ×2,2.
- Zoom et position **mémorisés par plan** pendant la session. `prefers-reduced-motion` : recentrage sans animation.
- Géométrie pure et testée : `src/features/plan/lib/viewport.ts`.

### Pins : couleur **et** lettre (jamais la couleur seule)

Priorité A / B / C / – dans un cercle (rouge, ambre, bleu, blanc) ; numéro de stand seul = carré gris avec le numéro ;
« à confirmer » (OCR, plus tard) = contour en pointillés. Libellé accessible : « Carrefour, stand B12, Priorité A ».

## 3. Données

```
floorplans   id, team_id, event_id, name, level, attachment_id, width_px, height_px, …
plan_pins    id, team_id, event_id, floorplan_id, event_company_id?, stand_label?, stand_key (calculée),
             x, y (0..1), source, review_status, confidence?, bbox?, raw_text?, …
attachments  (kind = 'floorplan', owner_table = 'floorplans')  → fichier dans le bucket privé `attachments`
event_companies.stand_key (calculée)
```

- **Coordonnées normalisées** (0..1, origine en haut à gauche) : indépendantes de la résolution, on peut remplacer
  l'image sans déplacer les pins.
- Plusieurs pins par entreprise possibles ; suppression d'un plan = suppression logique du plan, de ses pins et de
  son image (le fichier est retiré du stockage).
- RLS : isolation par équipe ; un pin ne peut viser que le plan **et** la participation de sa propre équipe
  (`tests/rls/plan.test.ts`). Migration : `20261002000007_floorplans.sql`.

## 4. Prévu pour l'OCR (non implémenté)

1. **Clé de jointure commune** : `stand_key` (colonne calculée par la base sur `plan_pins` **et** `event_companies`) =
   majuscules, sans espaces ni ponctuation, sans zéros de tête. `A-05`, `a 5`, `A05` → `A5`. Même règle en TypeScript
   (`standKey()`), parité vérifiée par test. Index `(event_id, stand_key)` des deux côtés.
2. **Un détecteur OCR** n'aura qu'à insérer des `plan_pins` : `source = 'ocr'`, `review_status = 'suggested'`,
   `stand_label` = texte normalisé, `raw_text` = texte brut, `confidence` (0..1), `bbox` = `{ x, y, w, h }` normalisé,
   `x`/`y` = centre du rectangle.
3. **Rapprochement** : même `stand_key` dans l'événement ; exactement une participation → renseigner
   `event_company_id` ; plusieurs ou aucune → laisser sans entreprise, à valider.
4. **Validation humaine** : les pins `suggested` s'affichent déjà en pointillés ; confirmer = `review_status = 'confirmed'`.
   Les pins manuels ne sont jamais écrasés.

Reste à faire le moment venu : le détecteur et l'écran de validation en masse. Aucune migration nécessaire.

## 5. Limites

- Pas de GPS ; « Je suis ici » est manuelle. PDF : première page seulement.
- Pas de pins déplaçables à la souris (bouton « Déplacer » puis clic).
- Une modification est enregistrée au fil de l'eau ; en cas d'échec réseau elle est signalée et l'état réel est rechargé.

## 6. Tests

| Fichier                                  | Ce qu'il prouve                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/plan/lib/viewport.test.ts` | Vue de départ, bornes de zoom, plan jamais hors de l'écran, zoom autour du curseur, déplacement, **pincement**, centrage, conversions. |
| `src/features/plan/lib/pins.test.ts`     | Clé de stand, pins affichés, entreprises proposées (stand correspondant, non placées d'abord), tailles d'image.                        |
| `tests/rls/plan.test.ts`                 | Isolation par équipe, contraintes, **parité SQL / TS de `stand_key`**, champs OCR, droits de suppression.                              |
