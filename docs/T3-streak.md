# T3 — Streak et flux Snap

> **Lis `docs/PLAN-GENERAL.md` en entier avant de commencer**, en particulier le §7 (règles du
> streak) et le §6.3 (types `Streak` et `TodayState`). T1 et T2 doivent être terminées.

## Mission

Le cœur de l'app : envoyer son snap du jour, calculer le streak actuel et le streak total, et
appliquer la règle de révélation. Tu ne touches ni aux fichiers ni aux images — tout ce qui est
stockage passe par les fonctions de T2.

## Fichiers que tu possèdes

```
server/src/streak.ts
server/src/routes/snap.ts   ← T1 a laissé un stub, tu le remplis
```

## Fichiers auxquels tu ne touches jamais

Tous les autres. En particulier : tu **n'écris pas** ta propre logique d'upload ni ta propre insertion
dans `media` — tu appelles `storeUpload` de T2. Tu ne modifies pas `day.ts` : tu utilises `localDay`
et `nextMidnightUtc` tels quels. Tu n'ajoutes aucune table et ne modifies pas `schema.sql` : le streak
est **entièrement dérivé** de la table `media`, il n'est jamais stocké.

## Travail détaillé

### 1. `server/src/streak.ts`

Rappel de la définition (§7) : une **journée complète** est une `local_day` sur laquelle les **deux**
profils ont chacun au moins un média `source = 'snap'`.

Fonctions exportées :

```ts
export function completeDays(): string[];
export function computeStreak(now?: Date): Streak;
export function snapOfDay(profile: string, day: string): MediaRow | undefined;
export function hasSnap(profile: string, day: string): boolean;
```

- `completeDays()` — une seule requête, triée du plus récent au plus ancien :
  ```sql
  SELECT local_day
  FROM media
  WHERE source = 'snap'
  GROUP BY local_day
  HAVING COUNT(DISTINCT owner) = 2
  ORDER BY local_day DESC
  ```
- `computeStreak(now)` :
  - `today = localDay(now)`, `todayComplete` = `today` est dans `completeDays()`.
  - `total` = nombre de journées complètes.
  - `current` : point de départ = `today` s'il est complet, sinon la veille de `today`. On remonte
    jour par jour tant que la journée est complète, en comptant. Si le point de départ n'est pas
    complet, `current = 0`.
  - `atRisk` = `current > 0 && !todayComplete`.
  - `deadline` = `nextMidnightUtc(now)` si `atRisk`, sinon `null`.
  - Arithmétique des jours : travaille sur les chaînes `AAAA-MM-JJ` en les interprétant en UTC
    (`new Date(day + 'T00:00:00Z')`, retirer 86 400 000 ms, reformater). Ce sont des **étiquettes de
    calendrier**, pas des instants : passer par UTC est correct et immunise contre les changements
    d'heure. **N'utilise pas `APP_TZ` ici** — il n'intervient que dans `localDay`, au moment de
    l'insertion du média.
  - Une seule lecture de `completeDays()` par appel, pas une requête par jour remonté.
- `snapOfDay(profile, day)` — le snap **le plus récent** de ce profil sur cette journée :
  `WHERE source = 'snap' AND owner = ? AND local_day = ? ORDER BY created_at DESC, id DESC LIMIT 1`.

### 2. `server/src/routes/snap.ts`

Le routeur est monté sur `/api` par T1 avec `requireAuth`. Ajoute `requireProfile` sur les trois
routes. Le profil courant est `req.profile`, l'autre est celui de `config.profiles` qui n'est pas
`req.profile`.

**`GET /snap/today`** → `TodayState`, construit ainsi :

- `localDay` = journée locale courante ; `streak` = `computeStreak()`.
- `me` : `{ profile, sent: !!mine, media: mine ? toMedia(mine) : null }`.
- `other` :
  - `sent` = l'autre a un snap aujourd'hui,
  - `revealed` = `me.sent` (et rien d'autre),
  - `media` = `toMedia(theirs)` **seulement si `revealed && sent`**, sinon `null`,
  - `teaserUrl` = `/api/media/<id>/teaser` si `sent && !revealed`, sinon `null`.
- **Aucun identifiant de média non révélé ne doit sortir**, sauf dans `teaserUrl` — c'est
  inévitable puisque le client doit pouvoir demander le teaser, et sans conséquence : la route
  `original` et la route `thumb` de T2 refusent ce même identifiant avec `403 not_revealed`.

**`POST /snap`** — `multer` en `diskStorage` vers `config.tmpDir`, champ **`file`**, **un seul
fichier** (`.single('file')`), même limite `MAX_UPLOAD_MB` que T2.

1. `storeUpload(file, req.profile, 'snap')` — c'est T2 qui valide le type, déplace l'original,
   génère la vignette **et le teaser**, et insère la ligne.
2. Appelle `onSnapSent(req.profile, media)` depuis `../notify/events.js` sans laisser un échec de
   notification faire échouer la requête.
3. Réponds avec le `TodayState` **recalculé après l'insertion** — c'est ce que le frontend affiche
   immédiatement, donc le compteur de streak et la révélation doivent déjà être à jour.

Envoyer un deuxième snap dans la même journée est **autorisé** : il devient simplement le snap
affiché du jour, et le streak ne bouge pas. Ne renvoie pas d'erreur, n'écrase pas l'ancien fichier,
ne supprime rien.

**`GET /streak`** → `computeStreak()`. Route séparée parce que le frontend peut vouloir les
compteurs sans l'état du jour ; ne duplique pas le calcul, appelle la même fonction.

## Critères d'acceptation

Prépare les données en insérant directement des lignes `media` (`source='snap'`, `owner`,
`local_day`, le reste peut être bidon) — c'est plus rapide que d'uploader, et le streak ne dépend
que de ces trois colonnes.

1. Base vide → `GET /api/streak` = `{ current: 0, total: 0, atRisk: false, deadline: null,
   todayComplete: false }`.
2. Snaps de Tyler **et** Camille sur les 5 derniers jours, y compris aujourd'hui →
   `current = 5`, `total = 5`, `atRisk = false`, `todayComplete = true`.
3. Les mêmes 5 jours mais rien aujourd'hui → `current = 5`, `total = 5`, `atRisk = true`,
   `deadline` = prochain minuit de Montréal converti en UTC (en août : `T04:00:00.000Z`).
4. Rien aujourd'hui **ni hier** → `current = 0`, `total` inchangé, `atRisk = false`.
5. Un jour où seul Tyler a envoyé, au milieu de la série → la série est coupée à ce jour, et ce jour
   ne compte pas dans `total`.
6. Journées complètes non consécutives (lundi et jeudi) → `total = 2`, `current` ne compte que la
   série en cours.
7. Deux snaps de Tyler le même jour → `total` ne double pas, et `me.media` est **le plus récent**.
8. Un média `source = 'album'` ajouté aujourd'hui par les deux → **aucun effet** sur le streak.
   C'est la règle du §2, vérifie-la explicitement.
9. **Révélation.** Camille a envoyé son snap aujourd'hui, Tyler non. Connecté en Tyler,
   `GET /api/snap/today` → `other.sent = true`, `other.revealed = false`, `other.media = null`,
   `other.teaserUrl` non nul. Puis `POST /api/snap` avec une photo → la réponse contient
   `other.revealed = true`, `other.media` complet, `teaserUrl = null`, `streak.current` incrémenté
   et `todayComplete = true`.
10. Une journée dont la frontière compte : avec `APP_TZ=America/Toronto`, un snap inséré à
    `03:30 UTC` porte la `local_day` de **la veille**. Vérifie qu'un snap envoyé à 23 h 30 heure de
    Montréal sauve bien la journée en cours et pas la suivante.

## Ce que tu ne fais pas

Pas de traitement d'image, pas de service de fichier, pas de route `/api/album`, pas de texte de
notification (tu appelles seulement `onSnapSent`), pas d'historique jour par jour dans l'API, pas de
calendrier, pas de statistiques, pas de rattrapage de streak perdu, pas de table `days` ni de cache
du streak.

## Fin de tâche

Commit des fichiers que tu possèdes uniquement, message en français préfixé `T3 : `. **Pas de push.**
