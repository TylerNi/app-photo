# Plan général — app-photo

> **Ce fichier est le contrat commun.** Chaque Claude assigné à une tâche lit ce fichier **en entier**
> avant d'ouvrir son propre `docs/Tx-*.md`. Tout ce qui est écrit ici est gelé : schéma SQL, API,
> variables d'environnement, arborescence, textes de notifications. On n'improvise pas un contrat
> différent dans son coin — plusieurs tâches avancent en parallèle et dépendent de ces définitions.

---

## 1. Objectif

Application web privée pour deux personnes (**Tyler** et **Camille**) :

1. **Snap quotidien** — chacun envoie une photo par jour, ce qui alimente un **streak actuel** et un
   **streak total**. La photo de l'autre reste floutée tant qu'on n'a pas envoyé la sienne.
2. **Album partagé** — toutes les photos et vidéos de l'app, y compris les snaps, dans une grille
   consultable ; on peut aussi y verser directement des médias depuis la pellicule.
3. **Notifications push** — quand l'autre envoie un snap ou ajoute à l'album, et rappel le soir si le
   streak est en danger.

Installée sur iPhone via Safari → Partager → **Sur l'écran d'accueil** (PWA autonome).
Auto-hébergée sur un serveur TrueNAS, déployée par Portainer.

## 2. Décisions déjà prises — non négociables

Ces points ont été tranchés par Tyler. Ne pas les rediscuter, ne pas les « améliorer ».

| Sujet | Décision |
|---|---|
| Accès réseau / HTTPS / domaine | **Hors périmètre du code.** Tyler s'en occupe (domaine Cloudflare + tunnel vers le port publié par Portainer). L'app expose **un seul port HTTP en clair** dans le conteneur. Aucune tâche ne configure de reverse proxy, de TLS, de certificat ni de DNS. |
| Notifications | **Web Push dans la PWA** (VAPID). Pas de ntfy, pas de Telegram, pas d'app tierce. |
| Compression | **Aucune.** Le fichier reçu est écrit sur le disque **octet pour octet**, jamais réencodé, et c'est ce fichier qui est servi en plein écran, au téléchargement et au partage. Les seuls fichiers générés sont des **vignettes de grille** et des **teasers floutés**, qui ne remplacent jamais l'original. |
| Streak | Seul le flux **Snap** valide une journée. Verser des photos dans l'album ne change **jamais** le streak. |
| Ton des notifications | Complice, avec emojis. Les textes exacts sont figés en §9. |
| Écran snap | **Révélation façon Snapchat** : la photo de l'autre est floutée tant que je n'ai pas envoyé la mienne du jour. Le floutage est appliqué **côté serveur** (§7). |
| Rappels de streak | 20 h 00, puis relance à 21 h 30 si la journée est toujours incomplète. Heures pilotées par variables d'environnement. |
| Médias acceptés | Photos **et** vidéos. |
| Comptes | Aucun compte, aucun service externe, aucune inscription. Un mot de passe partagé, puis un choix de profil. |

## 3. Stack

**Un seul conteneur.** Le backend Node sert l'API **et** les fichiers statiques du frontend compilé.
Pas de conteneur nginx séparé, pas de conteneur de base de données.

- **Backend** — Node 24 LTS, TypeScript, Express, SQLite (`better-sqlite3`).
- **Frontend** — React + TypeScript, compilé par Vite. CSS écrit à la main, aucune librairie d'UI.
- **Traitement des médias** — binaires système appelés en sous-processus : **ImageMagick** (`magick`)
  pour les images, **ffmpeg** / **ffprobe** pour les vidéos. Volontairement **pas de `sharp`** : ses
  binaires précompilés n'embarquent pas le décodage HEIC pour des raisons de licence, ce qui casserait
  les photos iPhone.
- **Push** — `web-push` (VAPID), plus un service worker côté navigateur.
- **Base** — un fichier SQLite sur le volume monté. Aucun serveur de base de données.

### Dépendances autorisées

Aucune autre dépendance npm ne doit être ajoutée sans validation de Tyler. Si une tâche pense en
avoir besoin, elle **s'arrête et demande** au lieu d'installer.

- `server/` : `express`, `better-sqlite3`, `multer`, `cookie-parser`, `web-push`, `node-cron`
  — dev : `typescript`, `tsx`, `@types/*`
- `web/` : `react`, `react-dom`, `react-router-dom`
  — dev : `vite`, `@vitejs/plugin-react`, `typescript`, `@types/*`

## 4. Arborescence du dépôt

Chaque fichier a **un seul propriétaire**. La colonne indique la tâche qui le crée et le modifie.
Une tâche ne touche jamais un fichier appartenant à une autre.

```
app-photo/
├── consignes-humains.md          (Tyler — lecture seule pour tous)
├── docs/                         (déjà écrit — lecture seule pour tous)
├── server/
│   ├── package.json              T1   ← seul T1 modifie les dépendances
│   ├── tsconfig.json             T1
│   └── src/
│       ├── index.ts              T1   ← monte tous les routeurs, personne d'autre n'y touche
│       ├── config.ts             T1   ← lecture des variables d'environnement
│       ├── db.ts                 T1   ← ouverture SQLite + application du schéma
│       ├── schema.sql            T1   ← schéma complet, toutes tables comprises
│       ├── types.ts              T1   ← DTO partagés (copie conforme de §6.3)
│       ├── auth.ts               T1   ← middleware de session
│       ├── day.ts                T1   ← calcul de la journée locale (fuseau)
│       ├── routes/
│       │   ├── auth.ts           T1
│       │   ├── media.ts          T2   ← T1 crée un stub vide, T2 le remplit
│       │   ├── snap.ts           T3   ← T1 crée un stub vide, T3 le remplit
│       │   └── push.ts           T4   ← T1 crée un stub vide, T4 le remplit
│       ├── media/
│       │   ├── storage.ts        T2
│       │   ├── derive.ts         T2
│       │   └── probe.ts          T2
│       ├── streak.ts             T3
│       └── notify/
│           ├── push.ts           T4
│           ├── events.ts         T4   ← T1 crée un stub inoffensif, appelé par T2 et T3
│           ├── texts.ts          T4
│           └── scheduler.ts      T4
├── web/
│   ├── package.json              T5
│   ├── tsconfig.json             T5
│   ├── vite.config.ts            T5
│   ├── index.html                T5
│   ├── public/
│   │   ├── manifest.webmanifest  T5
│   │   ├── icons/                T5
│   │   └── sw.js                 T4   ← service worker : push uniquement
│   └── src/
│       ├── main.tsx              T5
│       ├── App.tsx               T5   ← déclare toutes les routes + les écrans stubs
│       ├── session.tsx           T5
│       ├── styles.css            T5   ← variables de thème et styles globaux, T5 seul
│       │                              (T6 et T7 écrivent leur propre .css d'écran)
│       ├── api/
│       │   ├── client.ts         T5   ← wrapper fetch + gestion des erreurs
│       │   ├── types.ts          T5   ← DTO partagés (copie conforme de §6.3)
│       │   ├── snap.ts           T6
│       │   ├── media.ts          T7
│       │   └── push.ts           T4
│       ├── ui/                   T5   ← composants communs, les autres les consomment
│       │   └── PushButton.tsx    T4   ← T5 crée un stub et le place, T4 le remplit
│       └── screens/
│           ├── Login.tsx         T5
│           ├── ProfilePick.tsx   T5
│           ├── Snap.tsx          T6   ← T5 crée un stub, T6 le remplit
│           ├── Snap.css          T6
│           ├── Album.tsx         T7   ← T5 crée un stub, T7 le remplit
│           ├── Album.css         T7
│           └── Viewer.tsx        T7
├── Dockerfile                    T8
├── docker-compose.yml            T8   ← à coller dans l'éditeur web de Portainer
├── .dockerignore                 T8
├── .gitignore                    T8
├── .env.example                  T8
├── .github/workflows/build.yml   T8
└── README.md                     T8
```

**Règle des stubs.** T1 et T5 sont les échafaudeurs : ils créent *tous* les fichiers, y compris des
stubs vides pour ceux des autres tâches, et câblent les routes et les écrans. Résultat : le serveur
démarre et le frontend s'affiche dès la fin de T1 et T5, et T2/T3/T4/T6/T7 n'ont **jamais** besoin de
modifier `index.ts` ou `App.tsx`.

## 5. Variables d'environnement

Liste complète et définitive. Toute variable est lue **uniquement** dans `server/src/config.ts`.

| Variable | Défaut | Rôle |
|---|---|---|
| `PORT` | `8080` | Port HTTP écouté dans le conteneur |
| `DATA_DIR` | `/data` | Racine des données persistantes (volume monté) |
| `APP_PASSWORD` | — (**requis**) | Mot de passe partagé de l'app |
| `SESSION_SECRET` | — (**requis**) | Clé de signature du cookie de session |
| `PROFILES` | `Tyler,Camille` | Les deux profils, dans l'ordre d'affichage |
| `APP_TZ` | `America/Toronto` | Fuseau qui définit la frontière des journées |
| `PUBLIC_URL` | — (**requis**) | URL publique, utilisée pour les liens des notifications |
| `VAPID_PUBLIC_KEY` | — (**requis**) | Clé publique VAPID |
| `VAPID_PRIVATE_KEY` | — (**requis**) | Clé privée VAPID |
| `VAPID_SUBJECT` | `mailto:admin@localhost` | Contact VAPID |
| `REMINDER_1` | `20:00` | Premier rappel de streak (heure locale `APP_TZ`) |
| `REMINDER_2` | `21:30` | Relance si la journée est toujours incomplète |
| `MAX_UPLOAD_MB` | `500` | Taille maximale par fichier |

Le serveur **refuse de démarrer** avec un message clair si une variable requise manque.

### Arborescence des données (volume `DATA_DIR`)

```
/data
├── db/app.db                       base SQLite
├── originals/<AAAA>/<MM>/<id>.<ext>  fichiers reçus, jamais modifiés
├── thumbs/<id>.jpg                 vignette de grille, côté long 600 px
├── teasers/<id>.jpg                aperçu flouté des snaps, 32 px
└── tmp/                            réceptions en cours, vidé au démarrage
```

## 6. Contrats gelés

### 6.1 Schéma SQL

Fichier `server/src/schema.sql`, appliqué automatiquement au démarrage du conteneur (idempotent,
`CREATE TABLE IF NOT EXISTS`). **T1 crée l'intégralité de ce schéma**, y compris les tables utilisées
par T2, T3 et T4.

```sql
CREATE TABLE IF NOT EXISTS media (
  id            TEXT PRIMARY KEY,
  owner         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('photo','video')),
  source        TEXT NOT NULL CHECK (source IN ('snap','album')),
  original_name TEXT,
  mime          TEXT NOT NULL,
  bytes         INTEGER NOT NULL,
  width         INTEGER,
  height        INTEGER,
  duration_ms   INTEGER,
  taken_at      TEXT,
  created_at    TEXT NOT NULL,
  local_day     TEXT NOT NULL,
  storage_path  TEXT NOT NULL,
  thumb_path    TEXT,
  teaser_path   TEXT,
  derive_status TEXT NOT NULL DEFAULT 'pending'
                CHECK (derive_status IN ('pending','ready','failed'))
);

CREATE INDEX IF NOT EXISTS idx_media_day    ON media (local_day);
CREATE INDEX IF NOT EXISTS idx_media_recent ON media (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_snap   ON media (source, local_day, owner);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile    TEXT NOT NULL,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_ok_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notification_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  kind       TEXT NOT NULL,
  recipient  TEXT NOT NULL,
  local_day  TEXT NOT NULL,
  sent_at    TEXT NOT NULL,
  count      INTEGER NOT NULL DEFAULT 1,
  tag        TEXT
);

CREATE INDEX IF NOT EXISTS idx_notif_lookup
  ON notification_log (recipient, kind, local_day, sent_at DESC);
```

Conventions : toutes les dates sont des chaînes **ISO 8601 en UTC** (`2026-08-16T14:03:22.000Z`),
sauf `local_day` qui est un `AAAA-MM-JJ` dans le fuseau `APP_TZ`. `storage_path`, `thumb_path` et
`teaser_path` sont **relatifs à `DATA_DIR`**.

### 6.2 API HTTP

Toutes les routes sont préfixées par `/api`. Tout ce qui n'est pas `/api/*` sert le frontend compilé
(avec repli sur `index.html` pour les routes React). Toutes les routes sauf
`POST /api/auth/login` et `GET /api/auth/me` exigent une session valide, sinon **401**.

| Méthode | Route | Corps | Réponse | Tâche |
|---|---|---|---|---|
| `POST` | `/api/auth/login` | `{ "password": string }` | `204` + cookie, ou `401` | T1 |
| `GET` | `/api/auth/me` | — | `{ authenticated, profile, profiles }` | T1 |
| `POST` | `/api/auth/profile` | `{ "profile": string }` | `204` + cookie, ou `400` | T1 |
| `GET` | `/api/album` | query `before?`, `limit?` | `{ items: Media[], nextCursor: string \| null }` | T2 |
| `POST` | `/api/album` | multipart, champ `files` (1..n) | `{ items: Media[] }` | T2 |
| `GET` | `/api/media/:id/original` | — | octets du fichier, `Range` supporté | T2 |
| `GET` | `/api/media/:id/thumb` | — | JPEG | T2 |
| `GET` | `/api/media/:id/teaser` | — | JPEG flouté, `403` si déjà révélé | T2 |
| `GET` | `/api/snap/today` | — | `TodayState` | T3 |
| `POST` | `/api/snap` | multipart, champ `file` (1 seul) | `TodayState` | T3 |
| `GET` | `/api/streak` | — | `Streak` | T3 |
| `GET` | `/api/push/key` | — | `{ key: string }` | T4 |
| `POST` | `/api/push/subscribe` | `PushSubscription` sérialisée | `204` | T4 |
| `POST` | `/api/push/unsubscribe` | `{ endpoint: string }` | `204` | T4 |
| `POST` | `/api/push/test` | — | `204` | T4 |

Erreurs : toujours `{ "error": "<code_court>", "message": "<phrase en français>" }` avec un statut
HTTP cohérent. Codes utilisés : `unauthorized`, `bad_request`, `not_found`, `too_large`,
`unsupported_type`, `not_revealed`, `internal`.

### 6.3 Types partagés

À recopier **à l'identique** dans `server/src/types.ts` (T1) et `web/src/api/types.ts` (T5).

```ts
export type Profile = string;

export interface Media {
  id: string;
  owner: Profile;
  kind: 'photo' | 'video';
  source: 'snap' | 'album';
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  takenAt: string | null;
  createdAt: string;
  localDay: string;
  thumbUrl: string;
  originalUrl: string;
}

export interface Streak {
  current: number;
  total: number;
  atRisk: boolean;
  deadline: string | null;
  todayComplete: boolean;
}

export interface TodayState {
  localDay: string;
  streak: Streak;
  me: { profile: Profile; sent: boolean; media: Media | null };
  other: {
    profile: Profile;
    sent: boolean;
    revealed: boolean;
    media: Media | null;
    teaserUrl: string | null;
  };
}
```

`other.media` vaut `null` tant que `revealed` est `false` ; dans ce cas `teaserUrl` est renseigné si
l'autre a envoyé son snap. Aucun identifiant de média non révélé ne transite vers le client.

## 7. Règles du streak

Le fuseau de référence est `APP_TZ`. Une **journée** va de `00:00:00` à `23:59:59` dans ce fuseau.

- La journée locale d'un média est calculée **au moment de l'insertion** et stockée dans `local_day`.
  On ne la recalcule jamais à l'affichage.
- Une journée est **complète** quand les deux profils ont chacun au moins un média
  `source = 'snap'` sur cette `local_day`.
- **`streak.total`** = nombre total de journées complètes, consécutives ou non.
- **`streak.current`** :
  - si aujourd'hui est complète → on remonte à partir d'aujourd'hui tant que les journées sont complètes ;
  - sinon → on remonte à partir d'hier selon la même règle ;
  - si hier n'est pas complète non plus → `current = 0`.
- **`atRisk`** vaut `true` quand `current > 0` et qu'aujourd'hui n'est pas encore complète.
  `deadline` est alors le prochain minuit `APP_TZ`, en ISO UTC. Sinon `deadline` vaut `null`.
- **Révélation** : `other.revealed = me.sent`. Tant que je n'ai pas envoyé mon snap du jour, le
  serveur ne renvoie ni l'id, ni l'URL du média de l'autre — uniquement `teaserUrl`. Les routes
  `original` et `thumb` d'un snap non révélé répondent **403 `not_revealed`**. Le floutage n'est
  **jamais** un simple filtre CSS.
- Envoyer plusieurs snaps dans la même journée est permis ; seule la présence d'au moins un snap
  compte. Le snap affiché pour une journée est **le plus récent**.
- Aucune récupération de streak perdu, aucune journée de grâce, aucune suppression de média
  (fonctionnalité non demandée — ne pas l'inventer).

## 8. Session et profils

- Le mot de passe est **partagé** et comparé à `APP_PASSWORD`. Un seul mot de passe pour les deux.
- Le profil (`Tyler` ou `Camille`) est une **identité, pas une frontière de sécurité** : qui connaît
  le mot de passe peut se déclarer n'importe lequel des deux. C'est assumé. Ne pas ajouter de code
  PIN, de mot de passe par profil ni de séparation de droits.
- Session = **un cookie signé** `httpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 10 ans, contenant
  l'état d'authentification et le profil choisi. Pas de store de session, pas de JWT, pas
  d'expiration, pas de bouton de déconnexion (jamais demandé).
- Changer de profil = `POST /api/auth/profile`, accessible depuis un bouton discret de l'app.
- À vérifier sur l'appareil au moment de l'implémentation : la persistance réelle du cookie dans une
  PWA iOS installée sur l'écran d'accueil. Si le cookie ne survit pas, on le signale à Tyler — on ne
  contourne pas en inventant un autre mécanisme.

## 9. Notifications — textes figés

Ton complice, emojis, une phrase en titre et un détail en corps. `{n}` = longueur du streak actuel,
`{h}` = heures restantes avant minuit, `{qui}` = nom de l'expéditeur.

**Snap reçu** — destinataire : l'autre profil.
- Titre : `📸 {qui} t'a envoyé un Snap !`
- Corps, si le destinataire n'a pas encore envoyé le sien : `À ton tour — il te reste {h} h pour garder les {n} jours 🔥`
- Corps, si le destinataire a déjà envoyé le sien : `Journée complète 🔥 {n} jours de streak`
- Corps, si `n = 0` : `Envoie la tienne pour lancer le streak 🔥`
- `tag` : `snap-{qui}`

**Ajout à l'album** — destinataire : l'autre profil. Un seul envoi par requête d'upload ; si le même
profil reverse d'autres médias dans les **10 minutes**, on renvoie une notification avec le **même
`tag`** et le **cumul** de la fenêtre, ce qui remplace la précédente sur iOS (`renotify: true`).
- 1 photo : `🖼️ {qui} vient d'ajouter une photo à votre album`
- n photos : `🖼️ {qui} vient d'ajouter {n} photos à votre album`
- 1 vidéo : `🎬 {qui} vient d'ajouter une vidéo à votre album`
- n vidéos : `🎬 {qui} vient d'ajouter {n} vidéos à votre album`
- mixte : `🖼️ {qui} vient d'ajouter {n} photos et {m} vidéos à votre album`
- Corps : `Va voir ça 👀`
- `tag` : `album-{qui}`

**Rappel 1 (`REMINDER_1`, 20 h)** — destinataire : uniquement celui qui n'a pas envoyé son snap du jour.
- Streak en cours : titre `🔥 {n} jours de streak... reste {h} h pour ne pas tout casser !`, corps `Envoie ta photo du jour 📸`
- Pas de streak (`n = 0`) : titre `📸 Envoie ta photo du jour !`, corps `{autre} attend la tienne pour lancer le streak 🔥`
- `tag` : `reminder`

**Rappel 2 (`REMINDER_2`, 21 h 30)** — même destinataire, seulement si la journée est toujours incomplète.
- Titre : `⏰ Dernier appel — {n} jours en jeu !`
- Corps : `Il te reste {h} h. Une photo et c'est sauvé 🔥`
- `tag` : `reminder`

Règles communes : aucun rappel n'est envoyé à quelqu'un qui a déjà envoyé son snap du jour ; jamais
deux fois le même `kind` pour le même destinataire et la même `local_day` (vérification dans
`notification_log`) ; un clic sur une notification ouvre `PUBLIC_URL` (`/` pour un snap ou un rappel,
`/album` pour un ajout à l'album).

## 10. Conventions de code

- **Aucun commentaire dans le code**, sauf demande explicite de Tyler.
- Français pour l'interface, les messages d'erreur destinés à l'humain et les messages de commit.
  Anglais pour les identifiants de code (variables, fonctions, tables, routes).
- **Aucun embellissement** : pas de fonctionnalité, d'option, de champ, de fichier, d'abstraction, de
  logging décoratif ni de gestion d'erreur défensive au-delà de ce que la tâche exige. Si quelque
  chose semble manquer, le signaler à Tyler en une phrase à la fin — ne pas l'écrire d'office.
- Pas de framework de test, pas de CI de tests : chaque tâche se vérifie avec les critères
  d'acceptation de sa fiche, exécutés à la main.
- TypeScript en `strict`. Pas de `any` non justifié.
- Git : commit autorisé à la fin de sa tâche, **uniquement sur les fichiers dont on est propriétaire**,
  message en français préfixé par le code de la tâche (`T3 : calcul du streak et route /api/snap`).
  **Jamais de `push`.** Jamais de réécriture d'historique.

## 11. Découpage en tâches

| Tâche | Fiche | Dépend de | Peut démarrer |
|---|---|---|---|
| **T1** Socle backend, base, session | `docs/T1-socle-backend.md` | — | tout de suite |
| **T2** Médias : upload, stockage, dérivés | `docs/T2-medias.md` | T1 | après T1 |
| **T3** Streak et flux Snap | `docs/T3-streak.md` | T1, T2 | après T2 |
| **T4** Notifications push et rappels | `docs/T4-notifications.md` | T1, T3, T5 | après T3 et T5 |
| **T5** Socle frontend, PWA, login, profils | `docs/T5-frontend-socle.md` | T1 | après T1 |
| **T6** Écran Snap | `docs/T6-ecran-snap.md` | T3, T5 | après T3 et T5 |
| **T7** Album et visionneuse | `docs/T7-album.md` | T2, T5 | après T2 et T5 |
| **T8** Docker, Portainer, CI/CD | `docs/T8-docker-deploiement.md` | — | tout de suite, en parallèle |

Ordre conseillé : **T1** → puis **T2**, **T5**, **T8** en parallèle → **T3** → puis **T4**, **T6** et
**T7** en parallèle.

T4 arrive après T3 parce que les rappels du soir s'appuient sur le calcul de streak de T3, et après
T5 parce que le bouton d'activation des notifications vit dans la coquille frontend. Ça ne bloque ni
T2 ni T3 : le stub `notify/events.ts` créé par T1 rend leurs appels inoffensifs tant que T4 n'est pas
passée.

## 12. Pièges connus — à vérifier au moment de l'implémentation

Ces points sont documentés pour éviter que huit Claudes les redécouvrent un par un. Aucun n'est un
prétexte pour changer une décision du §2 : en cas de blocage réel, on prévient Tyler.

1. **HEIC et « aucune compression ».** Quand on choisit une photo de la pellicule iPhone via le
   sélecteur de fichiers de Safari, **c'est iOS qui transcode le HEIC en JPEG** avant que le fichier
   n'atteigne le serveur. On ne peut pas l'empêcher depuis une app web. Ce que l'app garantit, et
   c'est le maximum possible : les octets reçus sont écrits tels quels, sans jamais être réencodés.
   La seule voie vraiment sans perte reste de choisir le fichier via l'app Fichiers.
   Conséquence pratique : l'app doit quand même savoir traiter du HEIC (upload depuis Fichiers ou
   depuis un Mac), d'où ImageMagick plutôt que `sharp`.
2. **`sharp` ne décode pas le HEIC** dans ses binaires précompilés (licence Nokia HEIF / x265). Ne
   pas l'ajouter en pensant régler un problème.
3. **Push iOS** : ne fonctionne que pour une PWA **ajoutée à l'écran d'accueil**, en **HTTPS valide**,
   sur **iOS 16.4+**, et la demande d'autorisation doit partir d'un **geste utilisateur** (un vrai
   clic sur un bouton). Pas de push depuis un onglet Safari ordinaire.
4. **Presse-papiers iOS** : la prise en charge des types MIME par `ClipboardItem` est capricieuse
   (le PNG passe, le JPEG pas toujours), et l'écriture doit rester dans le geste utilisateur.
   À tester sur l'iPhone de Tyler ; l'API `navigator.share` est le repli fiable pour enregistrer
   dans la pellicule.
5. **Compilation de `better-sqlite3`** : module natif. L'étape de build de l'image Docker doit
   disposer des outils de compilation, l'étape finale non.
6. **Taille des requêtes** : le tunnel qui expose l'app peut imposer une limite par requête. On
   envoie donc **un fichier par requête HTTP** côté frontend, même pour une sélection multiple.
