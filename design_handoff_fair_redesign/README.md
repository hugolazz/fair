# Handoff : refonte épurée de fair

## Overview

Refonte visuelle (pas fonctionnelle) de l'app `hugolazz/fair` (React + Vite + Tailwind v4 + shadcn/Radix + lucide). Écrans couverts : connexion, liste des salons, aperçu d'un salon (onglets), participants. Les autres écrans (plan, équipe, bilan, exports, dialogs, sheets, import) doivent adopter les mêmes tokens et composants.

## About the Design Files

`fair Redesign.dc.html` est une **référence de design en HTML** (prototype), pas du code de production. À **recréer dans le code existant** (composants `src/components/ui/*`, `page-states.tsx`, `app-layout.tsx`, features) avec Tailwind, sans copier le HTML.

## Fidelity

**Haute fidélité** : couleurs, typo, rayons, espacements et animations sont finaux.

## Approche d'implémentation (Claude Code)

1. Mettre à jour `src/index.css` (`@theme`) avec les tokens ci-dessous, charger les polices dans `index.html`.
2. Adapter d'abord les primitives : `Button`, `field.tsx`, `Dialog`, `Sheet`, `StatusBadge`, `PriorityBadge`, `TagChip`, `Wordmark`, `EmptyState`, `PageHeader`. Les écrans suivent.
3. Conserver : i18n, a11y (cibles ≥ 44 px, focus visible, statut = point + texte, priorité = lettre), `prefers-reduced-motion`, nom « fair » toujours en minuscules (test `tests/brand.test.ts`). Le point doré du logo est décoratif : vérifier que le test de marque passe (le texte « fair » reste seul dans le DOM, le point en `aria-hidden`).
4. Remplacer la barre latérale par un en-tête supérieur (voir Layout).

## Design Tokens

Couleurs

- Fond page `#faf9f6` · surface `#ffffff` · surface secondaire / pilule `#f1efe9` (hover `#e8e5dc`)
- Encre `#1d2623` · texte atténué `#6b7672` · placeholder/inactif `#a8a498`
- Filet fin `#ece9e1` (cartes : `box-shadow: 0 0 0 1px #ece9e1`, pas de bordure ni ombre lourde) · soulignement champs `#d9d6cd`
- Brand `#0f766e` (hover `#115e59`) · teinte brand `#e3efec` · accent doré `#d9a441` (texte doré `#8a6a1c`)
- Priorité A fond `#fbe9e6` texte `#a8352a` · B fond `#fbf0d9` texte `#8a6a1c` · C fond `#eeece6` texte `#6b7672` · aucune : cercle pointillé `#cfcbbf`
- Danger au survol `#b4372c`
- Contrôle contraste : vérifier `#6b7672` sur `#faf9f6` (AA) et `#a8a498` (décoratif uniquement).

Typographie

- Interface et titres : **Instrument Sans** 400/500/600 (Google Fonts). Aucune autre police sauf le logo.
- Logo « fair. » : **Instrument Serif italique**, `#0f766e`, interlettrage -0.02em, 32 px (en-tête) / 64 px (connexion), point final `#d9a441`. Seul usage du serif.
- H1 page : 48 px / 1.05, weight 500, -0.03em. Titre de carte : 26 px / 1.15, 500, -0.02em. Valeur d'aperçu : 24 px / 1.25, 500. Corps 16 px, secondaire 13–14 px, libellés 13 px.

Formes et espacement

- Cartes : rayon 24 px, padding 28 px, gap de grille 20 px. Liste participants : conteneur rayon 24 px, padding 8×12, lignes rayon 16 px, padding 16×14.
- Boutons / pilules / filtres : rayon 999 px, hauteur 44 px (filtres 36 px), padding horizontal 22–24 px, 14 px weight 500.
- Conteneur : max-width 1040 px, padding 24×40 (réduire en mobile à 16 px), en-tête padding 22×40.
- Pastille priorité 32 px ronde, avatar 28 px rond (11 px weight 600).

## Screens / Views

**Cadre (AppLayout)** : en-tête horizontal : logo à gauche, navigation centrale « Salons / Réglages » dans une pilule `#f1efe9` (padding 4, onglet actif = pilule blanche + `box-shadow 0 1px 2px rgba(0,0,0,.06)`, 14 px/500, padding 8×18), avatar initiales 38 px rond `#e3efec` / `#115e59` à droite. Mobile : conserver la barre du bas existante, mêmes couleurs, sans filet lourd.

**Connexion** : colonne centrée max 380 px. Logo 64 px, accroche 17 px `#6b7672` (« Vos salons, préparés et suivis, d'une édition à l'autre. »). Champs sans cadre : libellé 13 px atténué au-dessus, input hauteur 48 px, transparent, seulement un soulignement 1 px `#d9d6cd` qui passe à `#0f766e` au focus (transition 200 ms). Erreur : texte rouge existant sous le champ. Bouton pleine largeur, 50 px, pilule brand, hover `#115e59`, active `scale(.98)`. Plus de carte blanche autour du formulaire.

**Salons** : en-tête de page : salutation 14 px atténuée (« Bonjour {prénom} »), H1 « Vos salons », bouton « + Nouveau salon » (pilule encre `#1d2623`, hover `#0f766e`) aligné en bas à droite. Grille `repeat(auto-fill, minmax(min(100%,440px),1fr))`. Carte : statut en haut (point 7 px + texte 13 px) et flèche ↗ `#bdb9ad`, puis nom 26 px et « dates · lieu » 14 px atténué. Hover : `translateY(-3px)`, anneau `#d7e6e2` + ombre `0 16px 32px -20px rgba(15,118,110,.35)`, transition 250 ms. Plus d'icônes calendrier/pin.

**Statuts** (remplace `StatusBadge`, plus de fond coloré) : point + texte. En préparation : point `#d9a441`, texte `#8a6a1c`. En cours : point et texte `#0f766e`, point animé (`pulse` 1.8 s : box-shadow 0 0 0 0 rgba(15,118,110,.35) → 0 0 0 7px transparent). Terminé : point `#a9c9c3`, texte `#6b7672`. Brouillon et archivé : point `#cfcbbf`, texte `#6b7672`. Statut toujours lisible en texte.

**Aperçu d'un salon** : lien retour « ← Salons » 14 px atténué ; statut ; H1 ; onglets texte sans pilule (gap 28 px, 14 px/500, actif `#0f766e` avec soulignement 2 px, filet inférieur `#ece9e1`, défilement horizontal). Deux cartes (Dates, Lieu) en grille auto-fit min 300 px, une carte Objectifs (texte 16 px / 1.65, max 640 px). Actions : primaire pilule brand « Préparer le salon », secondaires pilules `#f1efe9`, « Supprimer » en texte atténué (rouge `#b4372c` au survol). Boutons admin seulement (comportement existant).

**Participants** : filtres en pilules (Toutes / Priorité A / B / C) : actif `#1d2623` texte blanc, inactif `#f1efe9`, compteur « n entreprises » à droite. Ligne : grille `36px 1fr auto`, pastille priorité, nom 16 px/500 + méta (« Stand · secteur ») 13 px atténuée tronquée, à droite créneau de rendez-vous et avatar assigné (ou cercle pointillé « + »). Hover ligne `#faf9f6`. Conserver virtualisation, sélection multiple, tri et filtres existants.

## Interactions & Behavior

- Transitions : couleurs 200 ms, hover carte 250 ms ease. Apparition de page : `rise` 500 ms (opacity 0→1, translateY 8→0), désactivé si `prefers-reduced-motion`.
- Navigation conservée : connexion → salons → salon → onglets.
- Focus visible : conserver l'outline brand 2 px offset 2.

## State Management

Aucun changement : état, données Supabase, rôles RLS restent identiques. Le prototype ne simule que la navigation et le filtre de priorité.

## Assets

Aucune image. Icônes : garder lucide-react existant (le prototype en utilise très peu : préférer texte, point de statut et flèche ↗). Favicon/PWA : changer le fond en `#0f766e` inchangé, éventuellement fond crème.

## Files

- `fair Redesign.dc.html` : prototype (connexion, salons, aperçu, participants).
