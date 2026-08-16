# T4 — Notifications push et rappels de streak

> **Lis `docs/PLAN-GENERAL.md` en entier avant de commencer**, en particulier le §9 : les textes des
> notifications y sont **figés au mot près**, tu les recopies, tu ne les réécris pas.
> T1, T3 et T5 doivent être terminées.

## Mission

Bout en bout de la notification : les clés VAPID, l'abonnement des appareils, le service worker qui
reçoit la poussée, les textes, le groupage des ajouts à l'album, et le planificateur des deux rappels
du soir.

## Fichiers que tu possèdes

```
server/src/notify/push.ts
server/src/notify/texts.ts
server/src/notify/events.ts    ← T1 a laissé un stub, tu remplis les corps
server/src/notify/scheduler.ts
server/src/routes/push.ts      ← T1 a laissé un stub, tu le remplis
web/public/sw.js
web/src/api/push.ts
web/src/ui/PushButton.tsx      ← T5 a laissé un stub déjà placé dans la coquille, tu le remplis
```

## Fichiers auxquels tu ne touches jamais

Tout le reste. En particulier `server/src/index.ts` — le routeur `push` y est déjà monté, et le
planificateur se démarre depuis `scheduler.ts` lui-même, exporté et appelé par... personne. Lis bien
le point 5 : c'est le seul endroit où tu as besoin d'un fil à tirer et il y a une solution qui ne
touche pas à `index.ts`.

Tu ne modifies pas `streak.ts` (T3) : tu importes `computeStreak` et `hasSnap`. Tu n'installes aucune
dépendance : `web-push` et `node-cron` sont déjà dans `package.json` (T1).

## Travail détaillé

### 1. Génération des clés VAPID

Elles ne sont **pas** générées par le code : `npx web-push generate-vapid-keys` produit une paire que
Tyler collera dans les variables d'environnement de Portainer. Ta tâche consiste juste à les lire via
`config`. Note la commande à Tyler à la fin de ta tâche — T8 la documentera dans le README.

### 2. `server/src/notify/push.ts`

- Configure `web-push` avec `config.vapidPublicKey`, `config.vapidPrivateKey`, `config.vapidSubject`.
- `export async function sendTo(profile: string, payload: NotificationPayload): Promise<void>`
  - Charge tous les abonnements du profil depuis `push_subscriptions`.
  - Envoie le même payload à chacun (une personne peut avoir un iPhone et un iPad).
  - **Statut 404 ou 410** → l'abonnement est mort, `DELETE` la ligne. C'est le cycle de vie normal
    d'un abonnement push, pas une erreur à signaler.
  - Autre erreur → `fail_count = fail_count + 1` et une ligne sur `stderr`. Succès → `last_ok_at`.
  - Ne lève jamais : un échec de notification ne doit casser aucune requête appelante.
- Le payload est sérialisé en JSON et reste **sous 3 Ko** :
  ```ts
  interface NotificationPayload { title: string; body: string; tag: string; url: string; }
  ```
  `url` est une URL absolue construite sur `config.publicUrl` (`/` ou `/album`).

### 3. `server/src/notify/texts.ts`

Une fonction par situation, qui rend un `NotificationPayload`. **Recopie les chaînes du §9 du plan
général mot pour mot, emojis compris.** Les variantes conditionnelles (`n = 0`, destinataire ayant
déjà envoyé ou non, singulier/pluriel, photos seules / vidéos seules / mixte) sont toutes décrites
là-bas : implémente-les toutes, aucune n'est optionnelle.

`{h}` = heures entières restantes avant le prochain minuit local, calculées depuis
`nextMidnightUtc()` (T1). Arrondis à l'entier inférieur, et si le résultat vaut 0, écris `moins d'une
heure` au lieu de `0 h` — c'est la seule adaptation de texte que tu as le droit de faire.

### 4. `server/src/notify/events.ts`

Remplis les deux fonctions dont T1 a posé les signatures. **Ne change pas les signatures**, T2 et T3
les appellent déjà.

**`onSnapSent(sender, media)`** — destinataire : l'autre profil.
- Corps du message selon que le destinataire a déjà envoyé son snap du jour (`hasSnap` de T3) et
  selon `computeStreak().current`.
- `tag` = `snap-<sender>`, `url` = `<PUBLIC_URL>/`.
- Journalise dans `notification_log` (`kind = 'snap'`).

**`onAlbumUpload(profile, items)`** — destinataire : l'autre profil.
- **Groupage sur 10 minutes** : compte les médias `source = 'album'` de ce profil dont `created_at`
  est postérieur à `maintenant − 10 minutes`, ventilés par `kind` :
  ```sql
  SELECT kind, COUNT(*) AS n
  FROM media
  WHERE owner = ? AND source = 'album' AND created_at >= ?
  GROUP BY kind
  ```
  Ce sont **ces** totaux qui alimentent le texte, pas seulement les fichiers de la requête courante.
  Comme le frontend envoie un fichier par requête HTTP (§12.6 du plan), une sélection de 5 photos
  produit 5 appels : sans ce groupage, Camille recevrait 5 notifications.
- `tag` = `album-<profile>` et `renotify: true` côté service worker : iOS **remplace** la
  notification précédente portant le même tag au lieu d'en empiler une nouvelle. C'est ce qui produit
  la notification unique « Tyler vient d'ajouter 5 photos ».
- `url` = `<PUBLIC_URL>/album`. Journalise (`kind = 'album'`, `count` = total de la fenêtre).

### 5. `server/src/notify/scheduler.ts`

Deux tâches `node-cron`, toutes deux avec l'option `timezone: config.appTz` — c'est elle qui fait que
20 h veut dire 20 h à Montréal, pas 20 h UTC.

- Convertis `REMINDER_1` et `REMINDER_2` (`"HH:MM"`) en expressions `"<mm> <hh> * * *"`. Une valeur
  mal formée → message clair et arrêt du processus, comme pour les variables requises.
- Traitement, identique pour les deux rappels : pour **chacun** des deux profils, si
  `hasSnap(profil, aujourd'hui)` est faux, envoyer le texte du rappel correspondant (§9). Celui qui a
  déjà envoyé son snap ne reçoit **rien**.
- **Anti-doublon obligatoire** : avant d'envoyer, vérifier qu'il n'existe pas déjà une ligne
  `notification_log` avec le même `kind` (`'reminder1'` / `'reminder2'`), le même `recipient` et la
  même `local_day`. Le conteneur peut redémarrer plusieurs fois dans une soirée — sans cette
  vérification, un redémarrage à 20 h 01 renvoie le rappel.
- Exporte `startScheduler()`. Comme tu n'as pas le droit de modifier `index.ts`, appelle-la depuis
  le **module lui-même**, importé par `routes/push.ts` (qui, lui, est bien monté par `index.ts`) :
  l'import du routeur suffit alors à démarrer le planificateur, une seule fois, au démarrage du
  processus. Protège contre un double démarrage avec un simple booléen de module.

### 6. `server/src/routes/push.ts`

Routeur monté sur `/api`, `requireAuth` déjà appliqué par T1.

- `GET /push/key` → `{ key: config.vapidPublicKey }`.
- `POST /push/subscribe` — `requireProfile`. Corps = un `PushSubscription` sérialisé
  (`{ endpoint, keys: { p256dh, auth } }`). **UPSERT sur `endpoint`** : si l'appareil est déjà connu,
  mets à jour son `profile` — c'est le cas quand on change de profil sur le même téléphone, et sans
  ça les notifications partiraient au mauvais destinataire. Enregistre aussi `user_agent`. → `204`.
- `POST /push/unsubscribe` — `{ endpoint }` → suppression, `204` même si la ligne n'existait pas.
- `POST /push/test` — `requireProfile`. Envoie au **profil courant** une notification
  `{ title: '🔔 Ça marche !', body: 'Les notifications sont bien activées.', tag: 'test', url: <PUBLIC_URL>/ }`.
  Route de diagnostic assumée : c'est le seul moyen de vérifier la chaîne complète sur un iPhone sans
  attendre 20 h.

### 7. `web/public/sw.js`

Service worker **minimaliste**, en JavaScript brut (pas de TypeScript, pas de build : il est servi
tel quel depuis `public/`). Il ne fait **que** du push — pas de cache, pas de mode hors-ligne, ça n'a
jamais été demandé.

- `push` → `event.waitUntil(self.registration.showNotification(title, { body, tag, renotify: true,
  icon: '/icons/icon-192.png', badge: '/icons/badge.png', data: { url } }))`.
  `renotify: true` **exige** un `tag` non vide, sinon le navigateur rejette l'appel.
- `notificationclick` → fermer la notification, puis : chercher une fenêtre déjà ouverte de l'app
  (`clients.matchAll({ type: 'window', includeUncontrolled: true })`) ; si elle existe, la focaliser
  et la faire naviguer vers `data.url` ; sinon `clients.openWindow(data.url)`.
- Prévois le cas d'un payload absent ou illisible : notification générique plutôt qu'une exception.

### 8. `web/src/api/push.ts`

- `pushSupported()` → `'serviceWorker' in navigator && 'PushManager' in window`.
- `pushState()` → `'unsupported' | 'default' | 'denied' | 'granted'`, en s'appuyant sur
  `Notification.permission` et sur l'existence d'un abonnement actif.
- `enablePush()` — **doit être appelée directement dans un gestionnaire de clic**, sans `await`
  intermédiaire avant `Notification.requestPermission()` : iOS exige que la demande parte d'un geste
  utilisateur, et un `await` préalable casse ce lien. Enchaîne : `navigator.serviceWorker.register('/sw.js')`
  → `requestPermission()` → `registration.pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey })` → `POST /api/push/subscribe`.
- `applicationServerKey` : la clé VAPID vient de `GET /api/push/key` en base64url et doit être
  convertie en `Uint8Array` (fonction utilitaire classique : compléter le padding `=`, remplacer
  `-` et `_`, `atob`, remplir l'octet par octet).

### 9. `web/src/ui/PushButton.tsx`

Petit composant, déjà placé par T5 dans la coquille de l'app. Trois états, rien de plus :

- notifications actives → **n'affiche rien** (pas de bandeau permanent).
- refusées (`denied`) → une ligne discrète : `Notifications bloquées — Réglages iOS › Album ›
  Notifications`. On ne peut plus rien faire depuis le web une fois le refus donné, ne tente pas de
  redemander.
- sinon → un bouton `🔔 Activer les notifications` qui appelle `enablePush()`.

Cas particulier iOS à gérer : si `pushSupported()` est faux et que la page **n'est pas** en mode
autonome (`window.matchMedia('(display-mode: standalone)').matches === false` et
`navigator.standalone !== true`), affiche à la place :
`Ajoute l'app à ton écran d'accueil (Partager › Sur l'écran d'accueil) pour recevoir les notifications.`
C'est la limite iOS du §12.3 du plan général, et sans ce message Tyler cherchera pourquoi le bouton
ne fonctionne pas dans Safari.

## Critères d'acceptation

Les points 1 à 6 se vérifient sur un poste de développement, les points 7 à 10 **exigent un vrai
iPhone**, l'app installée sur l'écran d'accueil et une URL HTTPS valide. Si Tyler n'a pas encore
branché son tunnel, fais les six premiers, dis-lui clairement que les quatre derniers restent à
valider, et ne les déclare pas réussis.

1. `GET /api/push/key` renvoie la clé publique configurée.
2. `POST /api/push/subscribe` avec un abonnement bidon insère une ligne ; le rejouer avec le même
   `endpoint` mais l'autre profil **met à jour** la ligne au lieu d'en créer une deuxième.
3. `POST /api/push/unsubscribe` supprime la ligne, et un second appel répond quand même `204`.
4. Un abonnement dont l'endpoint renvoie 410 est supprimé automatiquement au premier envoi raté.
5. **Groupage** : uploader 5 photos dans l'album en 5 requêtes successives → **un seul** texte
   final « vient d'ajouter 5 photos », avec le même `tag`, et non cinq notifications distinctes.
   Vérifiable en journalisant les payloads si aucun appareil n'est branché.
6. **Anti-doublon des rappels** : régler `REMINDER_1` à deux minutes dans le futur, lancer le
   serveur, le laisser passer l'heure, le redémarrer, attendre à nouveau → une seule ligne
   `reminder1` dans `notification_log` pour la journée, et un seul envoi. Celui qui a déjà son snap
   du jour ne reçoit rien.
7. Sur l'iPhone, dans Safari **avant** installation : le bouton affiche bien le message
   « Ajoute l'app à ton écran d'accueil ».
8. Après installation sur l'écran d'accueil, le bouton demande l'autorisation, l'accepte, et une
   ligne apparaît dans `push_subscriptions`.
9. `POST /api/push/test` fait apparaître une vraie notification iOS, **app fermée**.
10. Un snap envoyé par l'un fait apparaître `📸 … t'a envoyé un Snap !` chez l'autre, et un clic
    dessus ouvre l'app sur le bon écran.

## Ce que tu ne fais pas

Pas de cache hors-ligne dans le service worker, pas de badge sur l'icône de l'app, pas de son
personnalisé, pas d'écran de préférences de notifications, pas de notification pour ses propres
actions, pas de courriel, pas de canal de secours, pas d'historique de notifications dans l'app.
Tu ne modifies aucun texte du §9 sans l'accord de Tyler.

## Fin de tâche

Commit des fichiers que tu possèdes uniquement, message en français préfixé `T4 : `. **Pas de push.**
Rappelle à Tyler la commande `npx web-push generate-vapid-keys` et dis-lui explicitement lesquels des
critères 7 à 10 tu n'as pas pu vérifier toi-même.
