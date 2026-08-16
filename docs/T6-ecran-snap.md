# T6 — Écran Snap : page d'accueil, streaks, envoi, révélation

> **Lis `docs/PLAN-GENERAL.md` en entier avant de commencer**, en particulier le §7 (règles du
> streak) et le §6.3 (type `TodayState`). T3 et T5 doivent être terminées.

## Mission

L'écran que Tyler et Camille voient en ouvrant l'app. Il montre les deux compteurs de streak, l'état
du jour, le snap de l'autre — flouté tant qu'on n'a pas envoyé le sien — et les deux façons d'envoyer
le sien. Tout l'état vient de `GET /api/snap/today` : tu n'inventes aucun calcul côté client.

## Fichiers que tu possèdes

```
web/src/screens/Snap.tsx    ← T5 a laissé un stub, tu le remplis
web/src/screens/Snap.css
web/src/api/snap.ts
```

## Fichiers auxquels tu ne touches jamais

Tout `server/`, tout le reste de `web/` — en particulier `App.tsx` (ta route est déjà déclarée),
`styles.css` (écris ton propre `Snap.css`), `ui/` (tu **consommes** `Button` et `Spinner`, tu ne les
modifies pas) et `api/client.ts` (tu **utilises** `apiGet` et `apiUpload`). Tu n'installes aucune
dépendance npm.

## Travail détaillé

### 1. `web/src/api/snap.ts`

Deux fonctions, rien de plus :

```ts
export function getToday(): Promise<TodayState>;
export function sendSnap(file: File, onProgress?: (pct: number) => void): Promise<TodayState>;
```

`sendSnap` construit un `FormData` avec le champ **`file`** (nom exact attendu par T3) et passe par
`apiUpload` de T5 pour avoir la progression. La réponse est le `TodayState` **déjà recalculé** par le
serveur : tu l'appliques tel quel à l'état de l'écran, tu ne recalcules pas le streak toi-même.

### 2. Chargement et rafraîchissement

- Au montage : `getToday()`, `Spinner` pendant l'attente.
- Rafraîchis sur l'événement `visibilitychange` quand la page redevient visible. C'est le seul
  mécanisme de mise à jour : pas de sondage périodique, pas de WebSocket, pas de SSE. Quelqu'un qui
  rouvre l'app voit l'état à jour, c'est suffisant pour deux personnes.
- Erreur réseau → un message court et un bouton « Réessayer ». N'affiche jamais un écran vide.

### 3. Les compteurs

Deux nombres, hiérarchisés : le **streak actuel** est l'élément dominant de l'écran, le **streak
total** est secondaire.

- Actuel : `🔥 {streak.current}` en très grand, avec le mot `jours` (ou `jour` au singulier, et
  `Aucun streak en cours` quand il vaut 0).
- Total : une ligne discrète, `{streak.total} journées complètes au total`.
- Si `streak.atRisk` : ajoute un avertissement calculé depuis `streak.deadline`
  (`Il te reste 3 h 20 pour sauver le streak`). Recalcule ce délai à l'affichage à partir de
  `deadline`, sans minuterie qui tourne à la seconde — un rendu à l'ouverture et au retour de
  visibilité suffit.
- Si `streak.todayComplete` : marque la journée comme faite (`Journée complète ✅`).

### 4. Le snap de l'autre — les trois états

C'est le cœur de l'écran, et le comportement a été choisi explicitement par Tyler (révélation façon
Snapchat). Les trois cas viennent directement de `other` dans `TodayState` :

1. **`other.sent === false`** → un cadre vide et une phrase : `{other} n'a pas encore envoyé sa photo`.
2. **`other.sent && !other.revealed`** → affiche `other.teaserUrl` **étiré au format du cadre**, avec
   un flou CSS par-dessus et un voile sombre, et le message
   `Envoie ta photo pour voir celle de {other} 👀`. Le teaser fait 32 px de côté : étiré, il ne donne
   que des taches de couleur, ce qui est exactement l'effet voulu.
   **Le flou CSS n'est qu'un habillage** : le serveur (T2) refuse déjà de servir l'image réelle, tu
   n'as donc pas à t'inquiéter du fait qu'il soit contournable dans l'inspecteur.
3. **`other.revealed && other.media`** → affiche le média en grand :
   - photo → `<img src={media.originalUrl}>` (l'original, jamais la vignette : c'est ici que la
     qualité maximale doit se voir) ;
   - vidéo → `<video src={media.originalUrl} controls playsInline>`. `playsInline` est
     indispensable, sans lui iOS bascule en lecture plein écran forcée.
   - Réserve la place avec `media.width`/`media.height` (`aspect-ratio`) pour que l'écran ne saute
     pas pendant le chargement.

### 5. Envoyer son snap

Deux entrées, comme demandé : **prendre une photo** et **choisir dans la galerie**.

```html
<input type="file" accept="image/*" capture="environment" hidden>   → Prendre une photo
<input type="file" accept="image/*,video/*" hidden>                 → Choisir une photo
```

- Les `<input>` restent cachés, déclenchés par les `Button` de T5 (`ref.current.click()`).
- **N'ajoute jamais `image/heic` dans `accept`** : sur Safari 17 et suivants, sa présence provoque
  des conversions d'extension parasites. `image/*` couvre déjà le cas (§12.1 du plan général).
- `capture="environment"` ouvre la caméra arrière. C'est un seul mot à changer en `user` pour la
  caméra avant : signale l'option à Tyler à la fin de ta tâche plutôt que de trancher.
- Pendant l'envoi : bouton désactivé, barre de progression alimentée par `onProgress`. Un envoi de
  vidéo peut durer, l'écran ne doit pas paraître figé.
- Succès → applique le `TodayState` reçu : le snap de l'autre se révèle **dans la foulée**, le
  compteur se met à jour. Pas de rechargement de page, pas de second appel à `getToday()`.
- Erreur → affiche `message` de l'API tel quel (il est déjà en français) et réactive le bouton.
  Les deux cas réalistes sont `413 too_large` et `415 unsupported_type`.
- Si `me.sent` est déjà vrai : les boutons restent actifs — renvoyer un snap est autorisé (§7), ça
  remplace simplement celui du jour. Change juste le libellé pour le dire (`Remplacer ma photo`).

### 6. Mon snap du jour

Quand `me.sent`, affiche discrètement `me.media` en vignette (`media.thumbUrl`) avec `Envoyé ✅` :
Tyler doit pouvoir vérifier d'un coup d'œil ce qu'il a envoyé, sans que ça vole la vedette au snap
de l'autre.

### 7. Accès à l'album

Un bouton bien visible vers `/album` (`Link` de `react-router-dom`). C'est le seul chemin vers
l'album demandé dans les consignes : ne construis pas de barre de navigation complète.

## Critères d'acceptation

Serveur et frontend lancés, deux navigateurs (ou deux profils) pour jouer les deux personnes :

1. Base vide → `🔥 0`, `Aucun streak en cours`, `Camille n'a pas encore envoyé sa photo`.
2. Camille envoie un snap. Côté Tyler, après rafraîchissement : le cadre montre une image floue,
   illisible, avec `Envoie ta photo pour voir celle de Camille`. **Dans l'onglet réseau, aucune
   requête vers `/original` ou `/thumb` de ce média** — seulement `/teaser`.
3. Tyler envoie sa photo : sans recharger la page, la photo de Camille apparaît en clair, le
   compteur passe à `🔥 1`, `Journée complète ✅` s'affiche.
4. Le fichier affiché en clair est bien `originalUrl` (vérifiable dans l'onglet réseau), pas la
   vignette.
5. `Prendre une photo` sur un iPhone ouvre directement l'appareil photo, et la photo prise part sans
   passer par la pellicule.
6. Envoyer une vidéo de plusieurs dizaines de méga-octets : la barre de progression avance, le bouton
   est désactivé pendant l'envoi, la vidéo se lit ensuite **dans la page** et non en plein écran
   forcé.
7. Envoyer un fichier trop gros → le message d'erreur français de l'API s'affiche et le bouton
   redevient utilisable.
8. Avec 5 journées complètes dont aujourd'hui : `🔥 5` et `5 journées complètes au total`.
   Sans le snap d'aujourd'hui : `🔥 5` **et** l'avertissement de temps restant.
9. Mettre l'app en arrière-plan, envoyer un snap depuis l'autre profil, revenir : l'écran se met à
   jour tout seul au retour de visibilité.
10. Renvoyer un second snap dans la même journée : pas d'erreur, la vignette « Envoyé » est mise à
    jour, le compteur ne bouge pas.

## Ce que tu ne fais pas

Pas d'historique des snaps passés, pas de calendrier, pas de statistiques, pas de réactions ni de
commentaires, pas de suppression, pas de filtres ni de retouche, pas de minuterie à la seconde, pas
de son, pas d'animation de célébration, pas de recalcul du streak côté client, pas de navigation
générale. Tu ne modifies aucune route de l'API : si `TodayState` ne te donne pas ce qu'il faut,
préviens Tyler au lieu d'ajouter un champ.

## Fin de tâche

Commit des fichiers que tu possèdes uniquement, message en français préfixé `T6 : `. **Pas de push.**
Pose à Tyler la question de la caméra avant ou arrière pour « Prendre une photo ».
