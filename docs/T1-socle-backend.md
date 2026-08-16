# T1 — Socle backend : serveur, base de données, session

> **Lis `docs/PLAN-GENERAL.md` en entier avant de commencer.** Le schéma SQL, l'API, les variables
> d'environnement et les types partagés y sont gelés : tu les appliques, tu ne les redéfinis pas.

## Mission

Tu es la **fondation** : sept autres tâches démarrent à partir de ton travail, dont plusieurs en
parallèle. À la fin de ta tâche, `npm run dev` dans `server/` doit démarrer un serveur qui répond,
crée sa base, applique le schéma complet et gère l'authentification. Tu crées aussi les **stubs** des
routeurs des autres tâches et tu les câbles, pour que personne d'autre n'ait jamais à modifier
`index.ts`.

## Fichiers que tu possèdes

```
.gitignore                   ← à écrire en tout premier, avant le moindre npm install
server/package.json
server/package-lock.json
server/tsconfig.json
server/src/index.ts
server/src/config.ts
server/src/db.ts
server/src/schema.sql
server/src/types.ts
server/src/auth.ts
server/src/day.ts
server/src/routes/auth.ts
server/src/routes/media.ts   ← stub uniquement
server/src/routes/snap.ts    ← stub uniquement
server/src/routes/push.ts    ← stub uniquement
server/src/notify/events.ts  ← stub uniquement
```

## Fichiers auxquels tu ne touches jamais

Tout ce qui est dans `web/`, `docs/`, à la racine du dépôt (`Dockerfile`, `docker-compose.yml`,
`.github/`, `README.md`, `.gitignore`), et tout fichier de `server/src/` non listé ci-dessus.
Tu ne crées **pas** le dossier `server/src/media/` ni `server/src/streak.ts`. Du dossier
`server/src/notify/`, tu ne crées que le stub `events.ts` décrit plus bas.

## Travail détaillé

### 0. `.gitignore`, avant tout le reste

Ta toute première action, avant `npm install` : écrire `.gitignore` à la racine du dépôt avec
`node_modules/`, `dist/`, `.data/` et `.env`. Tu es la première tâche à créer un `node_modules`, et
T5 en créera un second dans `web/` — sans ce fichier écrit d'abord, ils finissent dans le dépôt.
N'y mets **rien** concernant `.claude/` : c'est déjà couvert par le gitignore global de Tyler.

### 1. `server/package.json`

Tu es le **seul propriétaire des dépendances du backend**. Les autres tâches ne font jamais
`npm install` : si l'une d'elles a besoin d'un paquet, elle demande à Tyler. Installe exactement :

- production : `express`, `better-sqlite3`, `multer`, `cookie-parser`, `web-push`, `node-cron`
- développement : `typescript`, `tsx`, `@types/node`, `@types/express`, `@types/better-sqlite3`,
  `@types/multer`, `@types/cookie-parser`, `@types/web-push`

Configuration : `"type": "module"`, `"engines": { "node": ">=24" }`, et les scripts

- `dev` → `tsx watch src/index.ts`
- `build` → compile TypeScript **puis copie `src/schema.sql` vers `dist/schema.sql`**. `tsc` ne copie
  pas les fichiers non-TS : fais la copie avec `node -e "..."` (`fs.copyFileSync`) et non avec `cp`,
  pour que le script marche aussi sur la machine Windows de Tyler.
- `start` → `node dist/index.js`

`tsconfig.json` : `strict`, `target` ES2023, `module`/`moduleResolution` `NodeNext`, `rootDir: src`,
`outDir: dist`.

**Commit obligatoirement `server/package-lock.json`.** L'image Docker de T8 se construit avec
`npm ci`, qui échoue sans lockfile : sans lui, la première construction est cassée.

### 2. `server/src/config.ts`

Lit et valide **toutes** les variables d'environnement du §5 du plan général, et les expose dans un
objet typé unique. C'est le **seul** fichier du projet autorisé à lire `process.env`.

- Les variables marquées requises (`APP_PASSWORD`, `SESSION_SECRET`, `PUBLIC_URL`,
  `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) : si l'une manque, écrire un message clair en français sur
  `stderr` listant **toutes** celles qui manquent, puis `process.exit(1)`.
- `PROFILES` est découpé sur la virgule et nettoyé des espaces ; il doit contenir **exactement deux**
  noms, sinon même traitement.
- Expose aussi les chemins dérivés de `DATA_DIR` : `dbPath`, `originalsDir`, `thumbsDir`,
  `teasersDir`, `tmpDir` (voir l'arborescence du §5 du plan général).
- Expose `webDir` : le premier chemin existant parmi `resolve(import.meta.dirname, '../web')` (mise en
  page dans l'image Docker) puis `resolve(import.meta.dirname, '../../web/dist')` (développement
  local). Ce n'est pas une variable d'environnement, ne pas en ajouter une.

### 3. `server/src/db.ts`

- Crée les dossiers de `DATA_DIR` s'ils n'existent pas (`recursive: true`).
- Ouvre la base `better-sqlite3` sur `config.dbPath`.
- Active `PRAGMA journal_mode = WAL` et `PRAGMA foreign_keys = ON`.
- Lit `schema.sql` **à côté du fichier compilé** (`resolve(import.meta.dirname, 'schema.sql')`) et
  l'exécute avec `db.exec()`. Comme le schéma est intégralement en `CREATE ... IF NOT EXISTS`, cette
  application est idempotente : c'est le mécanisme de migration au démarrage du conteneur, il n'y a
  pas d'outil de migration.
- Vide `config.tmpDir` de son contenu au démarrage (réceptions interrompues).
- Exporte l'instance `db`.

### 4. `server/src/schema.sql`

Recopie **à l'identique** le bloc SQL du §6.1 du plan général — les trois tables et tous les index,
y compris `media`, `push_subscriptions` et `notification_log` que tu n'utilises pas toi-même. Les
autres tâches comptent sur leur présence et n'ont pas le droit de modifier ce fichier.

### 5. `server/src/types.ts`

Recopie **à l'identique** le bloc TypeScript du §6.3 du plan général. Aucun champ en plus, aucun
champ en moins.

### 6. `server/src/day.ts`

Deux fonctions pures, sans dépendance externe, basées sur `Intl.DateTimeFormat` avec l'option
`timeZone` :

- `localDay(date: Date = new Date()): string` → `AAAA-MM-JJ` dans `config.appTz`. Utilise
  `Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit' })`, dont
  le format de sortie est déjà `AAAA-MM-JJ`.
- `nextMidnightUtc(date: Date = new Date()): string` → instant ISO 8601 UTC du prochain minuit dans
  `config.appTz`. Méthode : détermine le décalage du fuseau à cet instant en formatant la date avec
  `timeZone` puis en comparant au même instant en UTC ; construis minuit du jour local suivant et
  reconvertis. Vérifie ton implémentation autour d'un changement d'heure (2 novembre 2026, 8 mars
  2026) — c'est le seul endroit du projet où ça compte.

Ces deux fonctions sont utilisées par T2, T3 et T4. Ne les duplique nulle part ailleurs.

### 7. `server/src/auth.ts`

- Le cookie s'appelle `session`, il est **signé** avec `SESSION_SECRET` via `cookie-parser`.
- Options : `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `maxAge` de 10 ans, `secure: false`
  (le conteneur ne parle qu'en HTTP en clair, le TLS est géré en amont par Tyler et n'est pas de
  notre ressort — voir §2 du plan général).
- Contenu : un JSON compact `{ "a": 1, "p": "Tyler" }` (`a` = authentifié, `p` = profil ou absent).
- Exporte :
  - `setSession(res, profile: string | null)`
  - `readSession(req): { authenticated: boolean; profile: string | null }`
  - `requireAuth` — middleware ; si non authentifié → `401 { error: 'unauthorized', message: 'Mot de passe requis.' }`
  - `requireProfile` — middleware ; authentifié mais sans profil → `400 { error: 'bad_request', message: 'Aucun profil sélectionné.' }`. Pose aussi `req.profile` pour les routes suivantes (déclare l'extension de type dans ce fichier).
- La comparaison du mot de passe se fait avec `crypto.timingSafeEqual` sur des tampons de même
  longueur. C'est la seule mesure de sécurité attendue : pas de hachage, pas de limitation de débit,
  pas de verrouillage après N essais — voir §8 du plan général, le profil est une identité, pas une
  frontière de sécurité.

### 8. `server/src/routes/auth.ts`

- `POST /login` — `{ password }`. Si correct : `setSession(res, null)` et `204`. Sinon `401`
  `{ error: 'unauthorized', message: 'Mot de passe incorrect.' }`.
- `GET /me` — **route publique**, jamais 401 : `{ authenticated, profile, profiles }` où `profiles`
  est le tableau `config.profiles`. C'est cette route que le frontend appelle au démarrage pour
  savoir quel écran afficher.
- `POST /profile` — exige `requireAuth`. `{ profile }` doit appartenir à `config.profiles`, sinon
  `400`. Repose le cookie avec le profil et répond `204`.

### 9. Stubs des autres tâches

Crée `server/src/routes/media.ts`, `snap.ts` et `push.ts` contenant **uniquement** :

```ts
import { Router } from 'express';

export const router = Router();
```

C'est tout. Tu ne devines pas leurs routes, tu ne les implémentes pas, tu ne mets pas de
`// TODO` (aucun commentaire dans le code).

Crée aussi `server/src/notify/events.ts`, le point d'accroche des notifications. T2 et T3 l'appellent
et peuvent être écrites avant T4, donc il doit exister tout de suite, avec des corps vides que T4
remplira. Signatures **exactes** :

```ts
import type { Media } from '../types.js';

export async function onAlbumUpload(profile: string, items: Media[]): Promise<void> {}

export async function onSnapSent(sender: string, media: Media): Promise<void> {}
```

### 10. `server/src/index.ts`

Dans cet ordre exact :

```
express()
app.disable('x-powered-by')
app.set('trust proxy', true)
cookieParser(config.sessionSecret)
express.json({ limit: '100kb' })

GET  /api/health            → { ok: true }        (public, sans session)
app.use('/api/auth', authRouter)
app.use('/api', requireAuth, mediaRouter)
app.use('/api', requireAuth, snapRouter)
app.use('/api', requireAuth, pushRouter)

express.static(config.webDir)
GET *  (hors /api)          → renvoie config.webDir/index.html   (repli SPA)

gestionnaire d'erreurs final → { error: 'internal', message: 'Erreur interne.' } en 500
app.listen(config.port, '0.0.0.0')
```

Les trois routeurs des autres tâches sont montés sur `/api` **sans sous-préfixe** : chacun déclare
ses chemins complets (`router.get('/album', ...)`, `router.get('/media/:id/thumb', ...)`). C'est
volontaire, ça évite que quiconque touche à ce fichier plus tard.

Le repli SPA ne doit jamais intercepter `/api/*` : une route API inconnue doit répondre `404`
`{ error: 'not_found', ... }`, pas la page HTML.

Écoute sur `0.0.0.0`, pas sur `localhost` — sinon le port n'est pas joignable depuis l'extérieur du
conteneur.

## Critères d'acceptation

Depuis `server/`, avec un `.env` local ou des variables exportées à la main
(`DATA_DIR=./.data APP_PASSWORD=test SESSION_SECRET=x PUBLIC_URL=http://localhost:8080
VAPID_PUBLIC_KEY=x VAPID_PRIVATE_KEY=y`) :

1. `npm run dev` démarre sans erreur et affiche le port écouté.
2. Démarrer **sans** `APP_PASSWORD` : le processus s'arrête avec un message français listant les
   variables manquantes, code de sortie 1.
3. `./.data/db/app.db` est créé. `sqlite3 ./.data/db/app.db ".tables"` liste
   `media`, `notification_log`, `push_subscriptions`.
4. Redémarrer le serveur ne provoque aucune erreur SQL (schéma idempotent).
5. `curl -i localhost:8080/api/health` → `200 { "ok": true }` sans cookie.
6. `curl -i localhost:8080/api/snap/today` → `401` avec le corps d'erreur normalisé.
7. `curl -i -X POST localhost:8080/api/auth/login -H 'content-type: application/json' -d '{"password":"mauvais"}'` → `401`.
8. Le même avec le bon mot de passe → `204` + en-tête `Set-Cookie: session=...` avec `HttpOnly`.
9. Avec ce cookie, `GET /api/auth/me` → `{ authenticated: true, profile: null, profiles: ["Tyler","Camille"] }`.
10. `POST /api/auth/profile` avec `{"profile":"Tyler"}` → `204`, puis `GET /api/auth/me` renvoie
    `profile: "Tyler"`. Avec `{"profile":"Bob"}` → `400`.
11. `npm run build` puis `node dist/index.js` démarre, et `dist/schema.sql` existe bien.
12. `curl -i localhost:8080/api/nimportequoi` → `404` **JSON**, pas du HTML.
13. Dans un nœud REPL, `localDay(new Date('2026-08-16T03:30:00Z'))` renvoie `2026-08-15` avec
    `APP_TZ=America/Toronto` (3 h 30 UTC = 23 h 30 la veille à Montréal).

## Ce que tu ne fais pas

Pas d'upload, pas de calcul de streak, pas de notification, pas de traitement d'image, pas de
frontend, pas de `Dockerfile`. Pas de bouton de déconnexion, pas d'expiration de session, pas de
limitation de débit, pas de hachage du mot de passe, pas de logs applicatifs au-delà d'une ligne au
démarrage, pas de framework de test.

## Fin de tâche

Commit des fichiers que tu possèdes uniquement, message en français préfixé `T1 : `. **Pas de push.**
Signale à Tyler en une ou deux phrases tout écart que tu as dû faire par rapport à cette fiche.
