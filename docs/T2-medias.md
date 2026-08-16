# T2 — Médias : réception, stockage sans perte, dérivés, service des fichiers

> **Lis `docs/PLAN-GENERAL.md` en entier avant de commencer.** T1 doit être terminée : le serveur
> démarre, la base existe, `media` est déjà créée par `schema.sql`.

## Mission

Tout ce qui touche aux fichiers. Recevoir un upload sans jamais réencoder l'original, en tirer des
vignettes et des teasers, écrire la ligne en base, servir les fichiers, et exposer l'album paginé.
T3 (streak) et T7 (album) construisent directement sur tes fonctions.

**Contrainte centrale, non négociable : l'original est écrit octet pour octet et n'est jamais
modifié.** Aucun réencodage, aucune correction d'orientation, aucun nettoyage d'EXIF, aucune
conversion de format sur le fichier stocké. Les vignettes et teasers sont des fichiers **séparés**
qui ne remplacent jamais l'original.

## Fichiers que tu possèdes

```
server/src/routes/media.ts     ← T1 a laissé un stub, tu le remplis
server/src/media/storage.ts
server/src/media/derive.ts
server/src/media/probe.ts
```

## Fichiers auxquels tu ne touches jamais

`server/src/index.ts`, `config.ts`, `db.ts`, `schema.sql`, `types.ts`, `auth.ts`, `day.ts`,
`routes/auth.ts`, `routes/snap.ts`, `routes/push.ts`, `server/package.json`, tout `web/`, tout
`docs/`, et la racine du dépôt. Tu n'installes **aucune** dépendance npm : ImageMagick et ffmpeg sont
des binaires système, fournis par l'image Docker (T8).

## Travail détaillé

### 1. `server/src/media/probe.ts`

Extraction des métadonnées par sous-processus (`node:child_process`, `execFile` promisifié, jamais
de shell — les chemins peuvent contenir des espaces).

- `probeImage(path)` → `{ width, height, takenAt }`
  - `magick identify -format "%w %h" "<path>[0]"` — le `[0]` est indispensable : un HEIC ou un GIF
    contient plusieurs images et sans lui la commande sort une ligne par image.
  - Date de prise de vue : `magick identify -format "%[EXIF:DateTimeOriginal]" "<path>[0]"`, qui rend
    `AAAA:MM:JJ HH:MM:SS` (deux-points dans la date). Convertis en ISO UTC ; si absente ou
    illisible, `takenAt = null`.
- `probeVideo(path)` → `{ width, height, durationMs, takenAt }`
  - `ffprobe -v error -select_streams v:0 -show_entries stream=width,height:stream_side_data=rotation:format=duration:format_tags=creation_time -of json "<path>"`.
  - **Si la rotation vaut ±90, échange `width` et `height`** : sinon toutes les vidéos filmées à la
    verticale avec un iPhone seront décrites comme horizontales.
  - `durationMs` = `format.duration` × 1000, arrondi.
- Toute commande qui échoue rend des valeurs `null` et **ne lève pas** : un fichier exotique ne doit
  jamais faire échouer un upload.
- Fixe un délai maximal (30 s) sur chaque sous-processus.

### 2. `server/src/media/derive.ts`

- `makeThumb(sourcePath, kind, outPath)` — vignette de grille, JPEG, **côté long 600 px**, sans
  jamais agrandir.
  - photo : `magick "<src>[0]" -auto-orient -resize 600x600> -quality 82 -strip "<out>"`.
    `-auto-orient` s'applique à la **vignette seulement** ; l'original garde son EXIF intact.
  - vidéo : `ffmpeg -y -ss 1 -i "<src>" -frames:v 1 -vf "scale='min(600,iw)':-2" "<out>"`. Si la
    vidéo dure moins d'une seconde, réessaie une fois avec `-ss 0`.
- `makeTeaser(thumbPath, outPath)` — **uniquement pour les snaps**. JPEG minuscule et flou, à partir
  de la vignette : `magick "<thumb>" -resize 32x32 -blur 0x4 -quality 70 "<out>"`. C'est ce fichier
  qui est servi à l'autre personne tant qu'elle n'a pas envoyé son snap : il ne doit contenir **aucun
  détail reconnaissable**. Vérifie visuellement au moins un teaser avant de clore la tâche.
- Chaque dérivation est encadrée : en cas d'échec, on journalise une ligne sur `stderr`, on met
  `derive_status = 'failed'` et **l'upload reste un succès**.

### 3. `server/src/media/storage.ts`

C'est l'API interne dont T3 dépend. Respecte ces signatures **exactement** :

```ts
import type { Media } from '../types.js';

export const ACCEPTED_MIME: Record<string, string>;

export async function storeUpload(
  file: { path: string; originalname: string; mimetype: string; size: number },
  owner: string,
  source: 'snap' | 'album',
): Promise<Media>;

export function toMedia(row: MediaRow): Media;

export function getMediaRow(id: string): MediaRow | undefined;
```

`storeUpload` enchaîne, dans cet ordre :

1. **Déterminer le type.** Accepte `image/jpeg`, `image/png`, `image/heic`, `image/heif`,
   `image/webp`, `image/gif`, `video/mp4`, `video/quicktime`. iOS envoie parfois
   `application/octet-stream` : dans ce cas, retombe sur l'extension du nom de fichier. Type non
   reconnu → lève une erreur que la route traduira en `415 unsupported_type`, et **supprime le
   fichier temporaire**.
2. `id = crypto.randomUUID()`, `kind` = `photo` ou `video` selon le type.
3. **Déplacer** le fichier de `tmpDir` vers `originals/<AAAA>/<MM>/<id>.<ext>` (année et mois de la
   date d'upload, en `APP_TZ`) avec `fs.rename` — même volume, donc pas de copie, et surtout pas de
   relecture-réécriture. L'extension vient du type retenu, pas du nom d'origine.
4. `probeImage` / `probeVideo` sur le fichier **désormais définitif**.
5. `localDay(new Date())` via `day.ts` de T1. **Ne recalcule pas la journée à partir de l'EXIF** :
   c'est la date d'envoi qui compte pour le streak, pas la date de prise de vue.
6. Insérer la ligne `media` avec `derive_status = 'pending'`.
7. `makeThumb`, puis `makeTeaser` **si `source === 'snap'`**. Mettre à jour `thumb_path`,
   `teaser_path` et `derive_status` (`ready` ou `failed`).
8. Retourner le DTO `Media` via `toMedia`.

`toMedia` construit `thumbUrl = /api/media/<id>/thumb` et `originalUrl = /api/media/<id>/original`,
et convertit `duration_ms` → `durationMs`, `taken_at` → `takenAt`, etc. C'est le **seul** endroit du
backend qui fabrique un `Media` : T3 l'importe, ne le réécrit pas.

La dérivation est **synchrone** dans la requête d'upload : deux utilisateurs, quelques fichiers, ça
ne justifie pas une file d'attente. La réponse contient donc toujours des vignettes déjà prêtes.

### 4. `server/src/routes/media.ts`

Le routeur est monté sur `/api` par T1, avec `requireAuth` déjà appliqué. Déclare les chemins
complets et ajoute `requireProfile` là où le profil est nécessaire.

**`POST /album`** — `requireProfile`. Multipart via `multer`, `diskStorage` avec `destination` =
`config.tmpDir`, champ `files`, jusqu'à 20 fichiers, `limits.fileSize = MAX_UPLOAD_MB * 1024 * 1024`.
Important : `diskStorage`, **jamais `memoryStorage`** — une vidéo de 500 Mo ne doit pas passer par la
mémoire. Pour chaque fichier, `storeUpload(file, req.profile, 'album')`. Réponse `{ items: Media[] }`
dans l'ordre reçu. Dépassement de taille → `413 too_large`. Puis, une fois la réponse construite,
appelle `onAlbumUpload(req.profile, items)` depuis `../notify/events.js` (T1 en a laissé un stub
inoffensif, T4 le remplira) — sans jamais `await` d'une manière qui puisse faire échouer la requête :
une notification qui échoue ne casse pas un upload.

**`GET /album`** — liste paginée, **toutes sources confondues** (`snap` **et** `album` : les snaps
apparaissent bien dans l'album, c'est demandé), triée par `created_at DESC, id DESC`.
- `limit` : défaut 60, maximum 200.
- `before` : curseur opaque `"<created_at>|<id>"` ; la requête SQL filtre
  `(created_at, id) < (:createdAt, :id)`.
- Réponse `{ items, nextCursor }`, `nextCursor` valant `null` quand la page est la dernière.
- **Exception de révélation** : un média `source = 'snap'` de **l'autre** profil, sur la journée
  locale **d'aujourd'hui**, et que le demandeur n'a pas encore débloqué (il n'a pas lui-même de snap
  aujourd'hui) est **exclu de la liste**. Les snaps des jours précédents ne sont jamais masqués.
  Une seule requête suffit pour savoir si le demandeur a envoyé son snap du jour.

**`GET /media/:id/original`** — sert le fichier avec son `Content-Type` réel, `Content-Disposition:
inline`, `Cache-Control: private, max-age=31536000, immutable` (les identifiants sont des UUID, un
contenu ne change jamais). Utilise `res.sendFile` (chemin absolu), qui gère `Range` — indispensable
pour lire une vidéo. `404 not_found` si la ligne ou le fichier manque. Applique la **règle de
révélation** ci-dessous.

**`GET /media/:id/thumb`** — sert `thumbs/<id>.jpg`, mêmes en-têtes de cache. `404 not_found` si la
vignette n'existe pas (dérivation échouée) ; c'est le frontend qui gère le repli. Applique la règle
de révélation.

**`GET /media/:id/teaser`** — sert `teasers/<id>.jpg`. Ne répond que pour un média `source = 'snap'`
appartenant à **l'autre** profil et **non encore révélé** ; dans tous les autres cas → `403
not_revealed` (il n'y a aucune raison de demander un teaser d'un snap qu'on peut déjà voir en clair).

**Règle de révélation, à appliquer sur `original` et `thumb`** : si le média a `source = 'snap'`,
que son `owner` n'est pas le profil du demandeur, que sa `local_day` est la journée locale courante,
et que le demandeur n'a **aucun** média `source = 'snap'` sur cette même journée → répondre
`403 { error: 'not_revealed', message: "Envoie ton snap du jour pour voir celui de l'autre." }`.
Écris cette vérification **une seule fois** dans une fonction locale et appelle-la depuis les deux
routes. C'est la garantie serveur du §7 du plan général : un flou CSS ne suffit pas.

## Critères d'acceptation

Serveur démarré, session ouverte avec le profil `Tyler` (cookie de T1) :

1. Uploader un JPEG : `curl -b cookies -F "files=@photo.jpg" localhost:8080/api/album` → `200` avec
   un `Media` complet, `width`/`height` renseignés, `thumbUrl` et `originalUrl` corrects.
2. **Intégrité de l'original** : comparer les empreintes avant/après.
   `sha256sum photo.jpg` et `sha256sum .data/originals/2026/08/<id>.jpg` doivent être **identiques**.
   C'est le critère le plus important de la tâche.
3. `.data/thumbs/<id>.jpg` existe, pèse quelques dizaines de kilo-octets, et
   `magick identify` montre un côté long de 600 px maximum.
4. Uploader une photo iPhone verticale : la vignette est **verticale** (l'orientation EXIF a bien été
   appliquée à la vignette).
5. Uploader un `.heic` : l'upload réussit, la vignette est générée. Si ImageMagick ne sait pas
   décoder le HEIC dans ton environnement local, note-le et vérifie-le dans l'image Docker de T8 —
   c'est là que le résultat compte.
6. Uploader un `.mov` filmé à la verticale : `kind = 'video'`, `durationMs` cohérent, `width` et
   `height` **échangés** par la rotation, vignette extraite à la première seconde.
7. Uploader un `.txt` renommé en `.jpg` → l'upload est accepté (le type MIME dit `image/jpeg`) mais
   la dérivation échoue proprement : `derive_status = 'failed'`, `200` quand même.
8. Uploader un `.pdf` → `415 unsupported_type`, et aucun fichier ne reste dans `.data/tmp/`.
9. `GET /api/album?limit=2` puis rappel avec le `nextCursor` renvoyé : pas de doublon, pas de trou,
   `nextCursor: null` sur la dernière page.
10. `curl -r 0-1023 .../api/media/<id>/original` sur une vidéo → `206 Partial Content`.
11. **Révélation** : avec Camille, poster un snap (`INSERT` direct en base avec `source='snap'`,
    `owner='Camille'`, `local_day` = aujourd'hui, T3 n'existe peut-être pas encore) ; en tant que
    Tyler sans snap du jour, `GET /api/media/<id>/thumb` → `403 not_revealed`, `GET
    /api/media/<id>/teaser` → `200` JPEG, et ce média **n'apparaît pas** dans `GET /api/album`.
    Ajouter un snap de Tyler sur la même journée → le thumb passe à `200` et le média réapparaît
    dans l'album.
12. Un snap de Camille daté d'hier reste visible sans condition.

## Ce que tu ne fais pas

Pas de calcul de streak, pas de route `/api/snap`, pas de notification (seulement l'appel à
`onAlbumUpload`), pas de suppression de média, pas de renommage, pas d'album multiple, pas de
favoris, pas de recherche, pas de compression de l'original — jamais, sous aucun prétexte.

## Fin de tâche

Commit des fichiers que tu possèdes uniquement, message en français préfixé `T2 : `. **Pas de push.**
Si ImageMagick ou ffmpeg t'a manqué localement, dis-le explicitement à Tyler plutôt que de contourner
en ajoutant une dépendance npm.
