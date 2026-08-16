# T5 — Socle frontend : PWA, mot de passe, choix du profil, coquille de l'app

> **Lis `docs/PLAN-GENERAL.md` en entier avant de commencer.** T1 doit être terminée : l'API
> d'authentification répond. Tu peux travailler en parallèle de T2 et T8.

## Mission

Tu es l'**échafaudeur du frontend**, le pendant de T1 côté navigateur. À la fin de ta tâche, l'app
s'ouvre sur iPhone, demande le mot de passe une seule fois, fait choisir Tyler ou Camille façon
Netflix, retient tout ça indéfiniment, et affiche deux écrans encore vides que T6 et T7 rempliront.
Tu crées **tous** les fichiers du frontend, y compris les stubs des autres, pour que personne n'ait
ensuite à modifier `App.tsx`.

## Fichiers que tu possèdes

```
web/package.json
web/tsconfig.json
web/vite.config.ts
web/index.html
web/public/manifest.webmanifest
web/public/icons/
web/src/main.tsx
web/src/App.tsx
web/src/session.tsx
web/src/styles.css
web/src/api/client.ts
web/src/api/types.ts
web/src/ui/AppShell.tsx
web/src/ui/Button.tsx
web/src/ui/Spinner.tsx
web/src/ui/PushButton.tsx      ← stub uniquement, T4 le remplit
web/src/screens/Login.tsx
web/src/screens/ProfilePick.tsx
web/src/screens/Snap.tsx       ← stub uniquement, T6 le remplit
web/src/screens/Album.tsx      ← stub uniquement, T7 le remplit
```

## Fichiers auxquels tu ne touches jamais

Tout `server/`, tout `docs/`, la racine du dépôt, et `web/public/sw.js` (service worker, il
appartient à T4 — tu ne le crées pas et tu ne l'enregistres pas non plus).

## Travail détaillé

### 1. Projet Vite

`web/package.json` : `react`, `react-dom`, `react-router-dom` ; en développement `vite`,
`@vitejs/plugin-react`, `typescript`, `@types/react`, `@types/react-dom`. **Rien d'autre** : pas de
librairie d'UI, pas de gestionnaire d'état, pas de client HTTP, pas de librairie de dates. Tu es le
seul propriétaire de ces dépendances ; T4, T6 et T7 n'installent rien.

`vite.config.ts` : sortie dans `web/dist`, et en développement un proxy `/api` vers
`http://localhost:8080` pour que le frontend parle au serveur de T1 sans problème de cookie
cross-origin.

`tsconfig.json` en `strict`, JSX `react-jsx`.

### 2. `web/index.html`

- `<html lang="fr">`, titre `Album`.
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`
  — `viewport-fit=cover` est nécessaire pour que les zones sûres fonctionnent sur un iPhone à encoche.
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<link rel="apple-touch-icon" href="/icons/icon-180.png">` — **iOS lit ce lien**, pas les icônes du
  manifeste, pour l'icône de l'écran d'accueil.
- `<meta name="apple-mobile-web-app-capable" content="yes">` **et**
  `<meta name="mobile-web-app-capable" content="yes">` : la première est la variante historique
  qu'iOS lit encore, la seconde est la forme standard.
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">` et
  `<meta name="theme-color" content="...">` accordé au fond de l'app.

### 3. `web/public/manifest.webmanifest`

`name` et `short_name` : `Album`. `start_url` et `scope` : `/`. `display: "standalone"`.
`background_color` et `theme_color` accordés au thème. `icons` : 192, 512, et une 512 `maskable`.

`web/public/icons/` : produis des PNG simples (fond uni de la couleur du thème, une forme ou une
lettre au centre) avec ImageMagick ou un petit script jetable — 180, 192, 512, 512 maskable, et une
`badge.png` monochrome de 96 px pour les notifications de T4. C'est volontairement rudimentaire :
dis à Tyler qu'il peut remplacer ces fichiers quand il voudra, sans rien changer au code.

### 4. `web/src/api/types.ts`

Recopie **à l'identique** le bloc TypeScript du §6.3 du plan général. Il doit être le jumeau exact de
`server/src/types.ts` — c'est le contrat sur lequel T4, T6 et T7 s'appuient.

### 5. `web/src/api/client.ts`

Un mince enrobage de `fetch`, utilisé par **tout** le frontend. Ne réinvente pas un client par écran.

- Toujours `credentials: 'same-origin'` (le cookie de session doit partir).
- `apiGet<T>(path)`, `apiPost<T>(path, body?)`, `apiUpload<T>(path, form, onProgress?)`.
- **Réponse non-OK** → lève une `ApiError` portant `status`, `error` et `message` (le corps
  normalisé de T1 : `{ error, message }`). Les écrans affichent `message` tel quel, il est déjà en
  français.
- **401** → en plus de lever, prévient le contexte de session qu'on n'est plus authentifié, pour que
  l'app retombe sur l'écran de mot de passe au lieu d'afficher une erreur incompréhensible.
- `apiUpload` s'appuie sur `XMLHttpRequest` et non sur `fetch` : c'est le seul moyen d'avoir une
  progression d'envoi, et T6 comme T7 en ont besoin pour afficher une barre pendant qu'une vidéo
  monte. Un seul fichier par appel (§12.6 du plan général).

### 6. `web/src/session.tsx`

Contexte React, monté au-dessus de tout le reste.

- Au montage : `GET /api/auth/me` → `{ authenticated, profile, profiles }`. Tant que la réponse n'est
  pas là, affiche le `Spinner` plein écran — surtout **pas** l'écran de mot de passe, sinon Tyler le
  verra clignoter à chaque ouverture alors qu'il est déjà connecté.
- Expose `{ ready, authenticated, profile, profiles, other, login(password), chooseProfile(name) }`.
  `other` est le profil qui n'est pas le courant : T6 en a besoin, calcule-le ici une fois pour
  toutes.
- `login` → `POST /api/auth/login`, puis rafraîchit l'état. `chooseProfile` → `POST /api/auth/profile`.
- **Aucun stockage côté client** : ni `localStorage`, ni `sessionStorage`. La session vit uniquement
  dans le cookie `httpOnly` posé par T1. C'est ce qui garantit qu'on ne se déconnecte jamais et qu'il
  n'y a rien à synchroniser.

### 7. `web/src/App.tsx`

Le seul routeur de l'app. Déclare **toutes** les routes dès maintenant, y compris celles des écrans
que tu ne remplis pas.

```
/         → <Snap />         (stub, T6)
/album    → <Album />        (stub, T7)
/profil   → <ProfilePick />  (changement de profil)
```

Portillon d'entrée, dans cet ordre :

1. `!ready` → `<Spinner />` plein écran.
2. `!authenticated` → `<Login />`, quelle que soit l'URL demandée.
3. `authenticated && !profile` → `<ProfilePick />`, quelle que soit l'URL demandée.
4. sinon → les routes ci-dessus, enveloppées dans `<AppShell>`.

Une fois le profil choisi, on ne repasse **jamais** par les étapes 2 et 3 : c'est la demande
explicite de Tyler (« ça nous déconnecte jamais »).

### 8. Écrans que tu écris vraiment

**`Login.tsx`** — un champ mot de passe (`type="password"`,
`autoComplete="current-password"`), un bouton, et l'affichage du message d'erreur de l'API en cas de
mauvais mot de passe. Rien d'autre : pas de « mot de passe oublié », pas de champ nom d'utilisateur,
pas de case « se souvenir de moi » (on se souvient toujours).

**`ProfilePick.tsx`** — le choix façon Netflix : **deux grandes tuiles carrées** côte à côte,
remplissant l'écran, chacune avec la couleur du profil et son prénom en grand. Un appui → 
`chooseProfile(nom)` → redirection vers `/`. Les noms viennent de `profiles` (l'API), **jamais** de
constantes en dur dans le code. La même page sert au changement de profil via `/profil`.

**`AppShell.tsx`** — la coquille commune : un en-tête compact avec le titre, la pastille du profil
courant (initiale sur fond coloré, cliquable → `/profil`), et `<PushButton />`. Le contenu de l'écran
en dessous. Respecte les zones sûres iPhone (`env(safe-area-inset-top)` / `-bottom`) — sans ça,
l'en-tête passe sous l'encoche en mode autonome.

**`Button.tsx`**, **`Spinner.tsx`** — deux composants triviaux, mais partagés : T6 et T7 les
utiliseront, donc donne-leur des props simples et stables (`variant: 'primary' | 'secondary'`,
`disabled`, `onClick`, `children`).

### 9. Stubs

- `screens/Snap.tsx` et `screens/Album.tsx` : un composant qui rend un titre et rien d'autre.
  Tu ne devines pas leur contenu, tu n'appelles aucune route de T3 ni de T2.
- `ui/PushButton.tsx` : `export function PushButton() { return null; }`, mais **déjà placé** dans
  `AppShell`. T4 n'aura qu'à remplir le corps.

### 10. `web/src/styles.css`

CSS écrit à la main, un seul fichier, variables CSS en tête.

- **Thème sombre**, adapté à une app de photos : les images doivent être ce qui attire l'œil.
- Deux couleurs de profil, une par personne, réutilisées pour les tuiles et la pastille.
- `height: 100dvh` et non `100vh` : sur iOS, `100vh` déborde sous la barre d'adresse.
- `overscroll-behavior: none` sur le corps, pour supprimer le rebond élastique qui trahit une
  page web dans une app installée.
- `-webkit-tap-highlight-color: transparent` et `user-select: none` sur les éléments d'interface —
  mais **pas** sur les images : T7 a besoin du comportement d'appui long natif.
- Cibles tactiles d'au moins 44 px.

## Critères d'acceptation

1. `npm run dev` dans `web/`, avec le serveur de T1 lancé à côté : l'app s'ouvre sur l'écran de mot
   de passe.
2. Mauvais mot de passe → le message français de l'API s'affiche, on reste sur l'écran.
3. Bon mot de passe → écran de choix de profil, avec les deux prénoms **venant de l'API**.
4. Choisir `Tyler` → arrivée sur `/`, en-tête avec la pastille `T`.
5. **Recharger la page** → on arrive directement sur `/`, sans mot de passe et sans choix de profil,
   et sans clignotement de l'écran de login pendant le chargement.
6. Fermer complètement le navigateur, rouvrir → toujours connecté, toujours sur le bon profil.
7. Aller sur `/album` directement dans la barre d'adresse → l'écran stub s'affiche (le repli SPA de
   T1 fonctionne en production ; en développement c'est Vite qui s'en charge).
8. Appuyer sur la pastille → `/profil`, choisir Camille → retour sur `/` avec la pastille `C`.
9. `npm run build` produit `web/dist/` sans erreur TypeScript.
10. Sur un iPhone : Partager › Sur l'écran d'accueil, puis ouvrir depuis l'icône → l'app s'ouvre en
    **plein écran sans barre Safari**, l'en-tête ne passe pas sous l'encoche, et la session est
    conservée. (Si le tunnel HTTPS de Tyler n'est pas encore en place, dis-le et laisse ce point à
    vérifier.)
11. Aucun appel à `localStorage` ou `sessionStorage` dans tout `web/src/`.

## Ce que tu ne fais pas

Pas d'écran Snap, pas d'album, pas de notifications, pas de service worker, pas de mode hors-ligne,
pas d'animation de transition, pas de thème clair, pas d'écran de réglages, pas de bouton de
déconnexion, pas de page d'erreur 404 maison, pas de librairie de composants.

## Fin de tâche

Commit des fichiers que tu possèdes uniquement, message en français préfixé `T5 : `. **Pas de push.**
Signale à Tyler que les icônes sont des images bouche-trou remplaçables.
