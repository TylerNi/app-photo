# T7 — Album partagé : grille, visionneuse, appui long, ajout de médias

> **Lis `docs/PLAN-GENERAL.md` en entier avant de commencer**, en particulier le §6.2 (routes
> `/api/album` et `/api/media/:id/*`) et le §6.3 (type `Media`). T2 et T5 doivent être terminées.

## Mission

L'album partagé : toutes les photos et vidéos de l'app dans une grille, une visionneuse plein écran,
un appui long qui permet d'enregistrer ou de copier la photo, et l'ajout de médias depuis la
pellicule. C'est l'écran où la contrainte « aucune compression » doit se voir : la grille charge des
vignettes, tout le reste charge l'original.

## Fichiers que tu possèdes

```
web/src/screens/Album.tsx    ← T5 a laissé un stub, tu le remplis
web/src/screens/Viewer.tsx
web/src/screens/Album.css
web/src/api/media.ts
```

## Fichiers auxquels tu ne touches jamais

Tout `server/`, tout le reste de `web/` — en particulier `App.tsx` (ta route `/album` est déjà
déclarée ; `Viewer` s'affiche **par-dessus** l'album, ce n'est pas une route), `styles.css`, `ui/` et
`api/client.ts`. Tu n'installes aucune dépendance npm : pas de librairie de galerie, pas de
carrousel, pas de virtualisation.

## Travail détaillé

### 1. `web/src/api/media.ts`

```ts
export function listAlbum(before?: string, limit?: number): Promise<{ items: Media[]; nextCursor: string | null }>;
export function uploadToAlbum(file: File, onProgress?: (pct: number) => void): Promise<Media>;
```

`uploadToAlbum` envoie **un seul fichier par requête**, dans un `FormData` au champ **`files`** (nom
exact attendu par T2), via `apiUpload` de T5. Une sélection multiple se traduit donc par plusieurs
appels séquentiels — c'est voulu (§12.6 du plan général), le tunnel qui expose l'app peut limiter la
taille d'une requête.

### 2. La grille

- Chargement par pages avec le curseur `nextCursor` de T2, **défilement infini** : un élément
  sentinelle en bas de liste, observé par un `IntersectionObserver`, déclenche la page suivante.
  Pas de bouton « charger plus », pas de pagination numérotée.
- **Regroupement par journée** : un en-tête de date au-dessus de chaque groupe, en français
  (`Aujourd'hui`, `Hier`, puis `samedi 15 août 2026`). Regroupe sur `media.localDay`, jamais sur
  `createdAt` reformaté côté client — sinon la coupure de journée ne correspondra pas à celle du
  streak.
- Tuiles carrées, 3 par ligne, `object-fit: cover`, `<img src={media.thumbUrl} loading="lazy"
  decoding="async">`. **Jamais `originalUrl` dans la grille** : c'est toute la raison d'être des
  vignettes.
- Réserve la place de chaque tuile (`aspect-ratio: 1`) pour que le défilement ne saute pas.
- Une vignette absente (dérivation échouée côté serveur, `404`) → tuile neutre avec une icône, pas
  d'image cassée.
- Marque discrètement les vidéos (petit `▶` et durée depuis `durationMs`) et l'auteur (pastille de
  couleur du profil, comme dans `AppShell`).

### 3. La visionneuse — `Viewer.tsx`

Superposition plein écran, ouverte par un appui court sur une tuile. Elle reçoit la liste courante et
l'index, elle ne recharge rien.

- Photo → `<img src={media.originalUrl}>`, **l'original**, jamais la vignette.
- Vidéo → `<video src={media.originalUrl} controls playsInline autoPlay>`. `playsInline` est
  indispensable sur iOS.
- Navigation par balayage horizontal (`touchstart`/`touchmove`/`touchend`, seuil ~50 px) et par les
  flèches du clavier pour le bureau. Fermeture par un bouton `✕` et par balayage vers le bas.
- Affiche discrètement l'auteur et la date.
- Précharge l'original du média suivant et du précédent (`new Image().src = ...`), rien de plus.
- Un HEIC s'affiche nativement dans Safari mais **pas** dans Chrome sur ordinateur : si `<img>`
  déclenche `onError`, retombe sur `thumbUrl` et affiche une mention discrète. Ne convertis rien.

### 4. Appui long : enregistrer, copier, partager

C'est la fonctionnalité demandée textuellement par Tyler. Elle doit **toujours agir sur l'original**,
jamais sur la vignette affichée — c'est précisément pour ça qu'on n'utilise pas le menu natif d'iOS
dans la grille : il enregistrerait l'image affichée, donc la vignette de 600 px.

- Détection : minuterie de 500 ms sur `touchstart`, annulée par `touchmove` ou `touchend`, plus
  l'événement `contextmenu` pour le bureau. Sur les tuiles concernées, mets
  `-webkit-touch-callout: none` pour supprimer le menu natif qui entrerait en concurrence — et
  **uniquement là**.
- Le menu propose trois actions, agissant sur `media.originalUrl` :

  **Partager / Enregistrer** — la voie fiable sur iOS.
  ```ts
  const blob = await fetch(originalUrl).then(r => r.blob());
  const file = new File([blob], nom, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
  ```
  Le DTO `Media` ne porte **pas** le nom d'origine du fichier : fabrique-le à partir de `media.id` et
  d'une extension déduite de `media.mime`. N'ajoute pas de champ au type partagé pour ça.
  La feuille de partage iOS propose alors « Enregistrer l'image » / « Enregistrer la vidéo », ce qui
  dépose le fichier dans la pellicule. Un `<a download>` ne fonctionne pas de façon fiable dans une
  PWA installée : garde-le en repli pour le bureau, ne compte pas dessus sur iPhone.

  **Copier** — presse-papiers.
  ```ts
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': (async () => { ...fetch, conversion, renvoie un Blob PNG })() })
  ]);
  ```
  Deux pièges, tous les deux obligatoires à respecter :
  1. Safari exige que le `ClipboardItem` reçoive une **promesse** de `Blob`, construite
     **synchroniquement** dans le gestionnaire d'événement. Si tu fais `await fetch(...)` **avant**
     de construire le `ClipboardItem`, Safari considère que le geste utilisateur est expiré et
     refuse l'écriture.
  2. Le presse-papiers n'accepte pas tous les types MIME : passe par `image/png`, en dessinant
     l'image dans un `<canvas>` puis `canvas.toBlob(..., 'image/png')`. Ce réencodage ne concerne
     **que la copie** — le fichier stocké n'est jamais touché.
  Une vidéo ne se copie pas : masque l'action « Copier » quand `kind === 'video'`.

- Si `navigator.share` et `navigator.clipboard.write` sont absents, masque les actions
  correspondantes plutôt que d'afficher un bouton qui échoue.
- Ce sont des points listés comme « à vérifier sur l'appareil » au §12.4 du plan général : teste-les
  sur l'iPhone de Tyler et **dis clairement ce que tu n'as pas pu vérifier**.

### 5. Ajouter des médias

- Un bouton `+` bien visible → `<input type="file" accept="image/*,video/*" multiple hidden>`.
- **N'ajoute pas `image/heic` dans `accept`** (§12.1 : bug de conversion d'extension sur Safari 17+).
- Envoi **séquentiel**, un fichier après l'autre, avec une progression globale lisible
  (`Envoi 3 / 12` plus la barre du fichier courant). N'envoie pas les douze en parallèle : sur un
  lien domestique en téléversement, c'est plus lent et plus fragile.
- Chaque `Media` renvoyé est inséré **en tête** de la grille sans recharger la liste entière.
- Un fichier en échec n'interrompt pas les autres : continue, et affiche à la fin
  `2 fichiers n'ont pas pu être envoyés` avec la raison de l'API.
- Rappelle-toi que ces envois déclenchent la notification groupée de T4 : n'ajoute aucune
  notification côté client.

### 6. Retour

Un bouton de retour vers `/` dans l'en-tête de l'écran.

## Critères d'acceptation

1. Avec une quarantaine de médias en base : la grille s'affiche, groupée par journée, en-têtes
   `Aujourd'hui` / `Hier` / date longue en français corrects.
2. Dans l'onglet réseau, la grille ne charge **que** des `/thumb`. Aucun `/original`.
3. Le défilement charge la page suivante automatiquement, sans doublon ni saut, et s'arrête
   proprement à la fin (`nextCursor: null`).
4. Les snaps des jours passés apparaissent dans l'album au milieu des autres médias.
5. Un snap de l'autre personne, envoyé aujourd'hui alors qu'on n'a pas encore envoyé le sien,
   **n'apparaît pas** dans la grille (c'est T2 qui l'exclut côté serveur — vérifie simplement que
   l'écran ne casse pas et n'affiche pas de trou).
6. Ouvrir une photo → la visionneuse charge `originalUrl` (vérifiable dans l'onglet réseau).
7. Balayer à gauche et à droite passe d'un média à l'autre ; balayer vers le bas ferme.
8. Une vidéo se lit dans la visionneuse, **sans** passer en plein écran forcé sur iOS, et la lecture
   démarre sans télécharger tout le fichier (requêtes `206` visibles).
9. Appui long sur une tuile → le menu maison s'affiche, **pas** celui d'iOS.
10. `Partager` ouvre la feuille de partage iOS, et « Enregistrer l'image » dépose bien la photo dans
    la pellicule. Vérifie que le fichier enregistré a **la même taille que l'original**, pas celle de
    la vignette.
11. `Copier` puis coller dans iMessage : c'est bien la photo, pas une vignette floue.
12. Sélectionner 12 photos d'un coup : envoi séquentiel, progression `n / 12`, les 12 tuiles
    apparaissent en tête de grille, et la liste reste cohérente après un rafraîchissement.
13. Envoyer un fichier refusé (PDF) au milieu d'une sélection : les autres passent, le récapitulatif
    final mentionne l'échec.

## Ce que tu ne fais pas

Pas de suppression, pas de renommage, pas de favoris, pas d'albums multiples, pas de recherche, pas
de filtres, pas de tri configurable, pas de sélection multiple pour actions groupées, pas de
diaporama, pas de zoom par pincement, pas de commentaires, pas d'export en lot, pas de carte, pas de
virtualisation sophistiquée. Rien de tout ça n'a été demandé.

## Fin de tâche

Commit des fichiers que tu possèdes uniquement, message en français préfixé `T7 : `. **Pas de push.**
Dis explicitement à Tyler lesquels des critères 9 à 11 tu as pu vérifier sur un vrai iPhone et
lesquels restent à confirmer.
