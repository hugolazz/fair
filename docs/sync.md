# Synchronisation hors-ligne de fair

fair est **local-first** : l'écran lit et écrit dans la base du téléphone (IndexedDB, via Dexie) ; un moteur de
synchronisation envoie les modifications au serveur (Supabase) et récupère celles des autres. Le réseau n'est
jamais sur le chemin d'une saisie.

```
 écran ──lit──▶  Dexie (source de vérité locale)  ◀──écrit── repositories
                      │  ▲
              outbox  │  │ pull (server_seq)
                      ▼  │
               moteur de sync (src/sync/engine.ts)
                      │
                      ▼
          Supabase : tables + RPC patch_meeting / patch_note + Storage
```

## 1. Ce qui marche sans réseau

| Besoin                                                    | Mécanisme                                                                                                                                                                                                                   |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L'appli s'ouvre, les pages se chargent                    | **Service worker** (Workbox, `vite-plugin-pwa`) : tout le shell (JS, CSS, HTML, icônes) est mis en cache à l'installation ; toute navigation retombe sur `index.html` (SPA). Mise à jour automatique à la version suivante. |
| Rester connecté                                           | Session Supabase persistée ; l'équipe est mise en cache (`localStorage`) pour ne pas bloquer au démarrage.                                                                                                                  |
| Salons à utiliser sur le terrain                          | **Téléchargement explicite** par salon (bouton « Télécharger pour le terrain »), voir §6.                                                                                                                                   |
| Écrire notes, statuts, photos, tags, rencontres imprévues | Écriture locale + `outbox` (§2).                                                                                                                                                                                            |
| Voir l'état                                               | Indicateur discret : hors-ligne / synchronisation / à jour / conflits (§8).                                                                                                                                                 |

Limites actuelles : seul le **mode terrain** (`/events/:id/field`) est local-first. Création de salon, import,
préparation (tableau des participants) et connexion initiale nécessitent le réseau. Hors-ligne, la page
« Salons » affiche les salons téléchargés avec un accès direct au mode terrain.

## 2. File d'attente des mutations (`outbox`)

Toute écriture passe par `src/db/local/write.ts` (`localInsert` / `localUpdate` / `localDelete`). Dans **une seule
transaction IndexedDB**, elle modifie la ligne locale **et** ajoute une opération à l'`outbox` : rien ne se perd si
l'onglet est fermé ou le téléphone redémarre.

Une opération : `{ table, key, kind: insert | update | delete, payload, edited?, attempts, locked?, failed?, lastError? }`.

- **Identifiants côté client** (UUIDv7) : une création hors-ligne ne peut pas entrer en collision, et rejouer une
  création est **idempotente** (`upsert` sur la clé primaire).
- **Fusion** : les modifications successives d'une même ligne sont fusionnées dans une seule opération tant qu'elle
  n'est pas partie (taper 50 caractères = 1 envoi). Une modification d'une ligne jamais envoyée est intégrée à son
  `insert`. Supprimer une ligne jamais envoyée annule tout, sans rien envoyer.
- **Verrou** : une opération en cours d'envoi est `locked` ; une nouvelle modification de la même ligne crée une
  opération suivante au lieu de modifier celle qui part. Au démarrage, un verrou resté (onglet fermé en plein
  envoi) est levé (`recover`).
- **Suppressions** : « soft delete » (`deleted_at`) pour que la suppression se propage aux autres appareils.

## 3. Envoi (`push`)

1. Ordre de **création** des opérations : une entreprise part avant sa participation au salon, qui part avant la
   rencontre, etc. (les parents avant les enfants ; aucune dépendance à calculer).
2. **Les photos en dernier** : un envoi de fichier lent ou en échec ne retarde jamais les notes.
3. Résultat d'une opération :
   - **succès** : l'opération est supprimée ; la version serveur (`server_seq`) renvoyée est mémorisée sur la ligne ;
   - **erreur réseau / 5xx / 408 / 429** (« retryable ») : l'envoi s'arrête, `attempts` augmente, on réessaiera ;
   - **refus définitif** (droits RLS, donnée invalide) : l'opération est mise en **quarantaine** (`failed`) et les
     suivantes continuent. « Synchroniser maintenant » la rejoue.
4. **Reprise espacée** : tentative toutes les 20 s en temps normal ; après des échecs, 4 s, 8 s, 16 s, 32 s, puis
   60 s maximum (`nextDelay`). Le retour du réseau (`online`), le retour au premier plan et un tap sur
   « Synchroniser maintenant » relancent immédiatement.
5. **Déclencheurs** (sans Background Sync, absent d'iOS Safari) : lancement, `online`, `visibilitychange`,
   périodique, et 0,7 s après chaque écriture locale (envoi seul, léger).

Un seul cycle à la fois : un appel pendant un cycle attend le même résultat.

## 4. Lecture (`pull`)

Chaque table synchronisée a `server_seq` (séquence globale incrémentée par un trigger à **chaque** écriture, y
compris suppression logique). Le client mémorise un **curseur** par table (et par salon pour les tables d'un salon)
et demande `server_seq > curseur`. **Aucune horloge de l'appareil n'entre dans le curseur** : un téléphone à la
mauvaise heure ne peut pas rater de lignes.

- Lecture par pages de 1 000 ; les tables d'équipe (`companies`, `contacts`, `notes`…) une fois, celles du salon
  (`event_companies`, `meetings`, assignations) pour chaque salon téléchargé.
- Tables sans `server_seq` (`taggings`, `profiles`) : relues en entier ; une ligne absente du serveur est supprimée
  localement (tag retiré par un collègue).
- **Un pull n'écrase jamais une ligne qui a une modification locale en attente.** La modification partira, puis la
  version fusionnée reviendra au pull suivant.

## 5. Résolution des conflits

| Donnée                                                                                              | Règle                                                                                | Où                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------- |
| **Rencontres** (`meetings` : statut, intérêt, besoin, budget, timing, décideur, prochaines étapes…) | **Dernier écrit gagne, champ par champ.**                                            | RPC `patch_meeting` |
| **Notes** (`notes.body`)                                                                            | **Conservation des deux versions** si modification simultanée.                       | RPC `patch_note`    |
| Autres tables                                                                                       | Dernier arrivé gagne, champ par champ (l'envoi ne contient que les champs modifiés). | PostgREST           |
| Tags, assignations                                                                                  | Ensembles : ajout / retrait de lignes, pas de conflit.                               | —                   |

### 5.1 Rencontres : dernier écrit gagne par champ

Chaque modification mémorise, **par champ**, l'heure de l'appareil où elle a été faite (`edited`). Le serveur
(`patch_meeting`) stocke l'heure de la dernière écriture de chaque champ dans `meetings.field_updated_at` et
n'applique un champ que si l'heure reçue est **≥** à celle qu'il connaît :

- _Même champ sur deux appareils_ : la modification la plus **récente** gagne, quel que soit l'ordre d'arrivée. Une
  modification faite hors-ligne à 10 h n'écrase pas une modification faite en ligne à midi, même si elle n'arrive
  qu'à 13 h.
- _Champs différents_ : tout est conservé (statut depuis le téléphone, besoin depuis l'ordinateur).
- _Horloge déréglée_ : une heure d'édition dans le futur est ramenée à « maintenant » par le serveur ; elle ne peut
  pas verrouiller un champ pour toujours. Un écart d'horloge de quelques minutes peut en revanche faire gagner la
  « mauvaise » modification : c'est la limite assumée de tout « dernier écrit gagne » (voir §9).
- _Effacer un champ_ (intérêt remis à vide) est une écriture comme une autre.
- Rejouer la même opération est sans effet (idempotent).

### 5.2 Notes : on garde les deux versions

Une note est du texte libre : choisir un « gagnant » perdrait du contenu. `patch_note(id, body, base_seq)` est un
**compare-and-swap** : la modification n'est appliquée que si la note n'a pas changé depuis la version
(`server_seq`) connue de l'appareil.

- Pas de modification entre-temps → appliquée.
- Même texte des deux côtés → pas de conflit.
- **Modifiée ailleurs entre-temps** → le serveur **n'écrase rien** et renvoie sa version. L'appareil :
  1. restaure la note d'origine avec la version du serveur ;
  2. crée une **copie** contenant **son** texte (nouvelle note, envoyée normalement) ;
  3. enregistre un **conflit** local (`conflicts`), signalé par l'indicateur.

L'utilisateur peut alors, depuis l'indicateur : **garder les deux** (rien à faire), **garder la sienne** (l'original
prend son texte, la copie est supprimée) ou **garder l'autre** (la copie est supprimée). Dans tous les cas aucun
texte n'a été perdu avant qu'il choisisse.

La base de comparaison (`server_seq`) est mise à jour après chaque envoi réussi : un même appareil qui modifie une
note plusieurs fois, avec des synchronisations entre, ne se crée **pas** de faux conflit. Les notes ne sont
modifiables que par leur auteur (RLS) : un conflit de note survient donc entre **deux appareils du même
commercial**.

## 6. Salons téléchargés pour le terrain

Le téléchargement est un **choix explicite** par salon et par appareil (`sync_state` : `pinned:<id>`).

- **Avant** : la taille est **estimée** d'après le nombre de lignes côté serveur (`count` exact) × un poids moyen
  par ligne, affichée sur le bouton (« Télécharger pour le terrain (1,2 Mo) »).
- **Pendant** : lecture des tables d'équipe puis du salon, avec barre de progression ; nos modifications en attente
  partent d'abord. Interrompu = rejouable sans danger.
- **Après** : l'**espace réellement utilisé** (lignes + photos) est mesuré et affiché ; « Mis à jour il y a N min »
  est rafraîchi à chaque cycle réussi. Un salon téléchargé est gardé à jour automatiquement.
- **Retirer de l'appareil** : libère l'espace, mais **refusé tant que des modifications ne sont pas envoyées** (on ne
  supprime jamais des données qui n'existent pas encore ailleurs).
- Sans salon téléchargé, rien n'est lu : seuls les envois ont lieu.

## 7. Photos et pièces jointes

La photo est compressée (~300 Ko), stockée **en local** (`blobs`) avec une ligne `attachments` « en attente ». À
l'envoi, le fichier part dans le bucket privé `attachments` (`<team_id>/<id>.jpg`, policies RLS sur le dossier
d'équipe) **avant** la ligne qui le décrit, puis la ligne passe à « envoyée ». Échec = reprise au prochain cycle ;
le fichier reste sur l'appareil. Les photos sont envoyées après tout le reste.

## 8. Indicateur d'état

Petit pill (icône + mot) dans l'en-tête, par ordre de gravité : **conflits** > **hors-ligne** (avec le nombre de
modifications en attente) > **envoi impossible** > **synchronisation…** > **n en attente** > **à jour**. Un tap
ouvre le détail : état, modifications à envoyer / refusées, dernière synchronisation, bouton « Synchroniser
maintenant », et la liste des conflits à résoudre.

## 9. Limites et choix assumés

- « Dernier écrit gagne » s'appuie sur l'heure des appareils (bornée à « maintenant » côté serveur). Deux
  modifications du même champ à quelques secondes d'écart avec des horloges décalées peuvent être départagées dans le
  mauvais sens ; elles ne sont jamais perdues par mégarde pour des champs différents.
- Une création rejouée écrase la ligne serveur avec les valeurs de l'`insert` (cas rare : plantage entre la réception
  et l'accusé).
- Pas de mise à jour en temps réel entre commerciaux (lecture au cycle suivant, 20 s).
- Session expirée **et** hors-ligne : le comportement dépend de Supabase Auth (à vérifier sur appareil réel) ; les
  données locales ne sont jamais effacées.
- iOS peut vider le stockage d'un site peu utilisé : installer la PWA sur l'écran d'accueil et synchroniser avant
  de partir.

## 10. Tests

| Fichier                                  | Ce qu'il prouve                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/db/local/write.test.ts`             | Écriture locale + outbox atomiques, fusion, verrou, suppression sans envoi inutile.                                                                                                                                                                                                                                                                                                                                         |
| `src/sync/engine.test.ts`                | Ordre d'envoi, hors-ligne, quarantaine, idempotence, reprise après plantage, photos, pull sans écrasement, verrou de cycle.                                                                                                                                                                                                                                                                                                 |
| `src/sync/multi-device.test.ts`          | **Deux appareils** (téléphone / ordinateur) sur un même serveur : coupure (y compris en plein envoi) et retour réseau ; dernier écrit gagne par champ dans les deux ordres d'arrivée ; vieille modification hors-ligne ne l'emporte pas ; horloge dans le futur ; conflit de note et les trois résolutions ; pas de faux conflit ; photo qui n'empêche pas les notes ; salons téléchargés (taille, retrait refusé/accepté). |
| `tests/rls/sync-conflicts.test.ts`       | Les RPC `patch_meeting` / `patch_note` sur de vraies migrations (PGlite) : LWW par champ, heure future ramenée, compare-and-swap, isolation entre équipes, droits.                                                                                                                                                                                                                                                          |
| `src/features/field/field.taps.test.tsx` | Nombre de taps par geste sur les vrais écrans, sur base locale.                                                                                                                                                                                                                                                                                                                                                             |

## 11. Ajouter une table synchronisée

1. Colonnes de sync `[S]` (`server_seq`, `deleted_at`, trigger `touch_row`) + RLS + test dans `tests/rls/`.
2. `SyncTableName` / interface locale dans `src/db/local/db.ts` (+ version Dexie) et entrée dans `tables.ts`
   (`pk`, `scope`) ; l'ajouter à `PULL_ORDER` après ses parents.
3. Écrire **uniquement** via `localInsert` / `localUpdate`.
4. Champs édités en parallèle ? Choisir : LWW par champ (`LWW_TABLES` + RPC) ou conservation des deux versions.
5. Test `FakeRemote` / `multi-device`.
