# app-photo

Application web privée pour deux personnes : un snap par jour qui alimente un streak, un album partagé
de photos et de vidéos, et des notifications push. Installée sur iPhone via Safari → Partager → Sur
l'écran d'accueil.

Un seul conteneur : le backend Node sert l'API et le frontend compilé. Les données vivent dans un
volume monté sur `/data`.

## 1. Préparer les secrets

```sh
npx web-push generate-vapid-keys   # VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY
openssl rand -hex 32               # SESSION_SECRET
```

`APP_PASSWORD` est le mot de passe partagé de l'app, à choisir librement.

## 2. Créer le dataset sur TrueNAS

Crée un dataset dédié (par exemple `/mnt/tank/app-photo`) et note son chemin : c'est la valeur de
`DATA_PATH`. L'app y crée d'elle-même `db/`, `originals/`, `thumbs/`, `teasers/` et `tmp/`.

Le conteneur tourne en `root`, ce qui évite d'ajuster les droits du dataset. Si tu préfères,
ajoute `user: "1000:1000"` au service dans le compose, à condition que le dataset appartienne bien à
cet UID.

## 3. Déployer dans Portainer

1. Stacks › Add stack › Web editor.
2. Colle le contenu de `docker-compose.yml`.
3. Remplis les variables dans « Environment variables » (modèle : `.env.example`) :

| Variable | Exemple | Rôle |
|---|---|---|
| `APP_PORT` | `8080` | Port publié sur l'hôte |
| `DATA_PATH` | `/mnt/tank/app-photo` | Dataset monté sur `/data` |
| `APP_PASSWORD` | — | Mot de passe partagé |
| `SESSION_SECRET` | — | Signature du cookie de session |
| `PUBLIC_URL` | `https://photo.exemple.com` | URL publique, liens des notifications |
| `VAPID_PUBLIC_KEY` | — | Clé publique VAPID |
| `VAPID_PRIVATE_KEY` | — | Clé privée VAPID |
| `VAPID_SUBJECT` | `mailto:admin@localhost` | Contact VAPID |
| `PROFILES` | `Tyler,Camille` | Les deux profils |
| `APP_TZ` | `America/Toronto` | Fuseau qui définit les journées |
| `REMINDER_1` | `20:00` | Premier rappel de streak |
| `REMINDER_2` | `21:30` | Relance si la journée est incomplète |
| `MAX_UPLOAD_MB` | `500` | Taille maximale par fichier |

4. Deploy the stack.

L'image `ghcr.io/tylerni/app-photo:latest` est publiée automatiquement à chaque poussée sur `main`.
Un paquet GHCR est **privé** par défaut, et Portainer ne pourra pas le tirer tel quel. Deux voies :

1. **Recommandé** — rendre le paquet public : GitHub › Packages › `app-photo` › Package settings ›
   Change visibility › Public. C'est une image d'app, elle ne contient ni données ni secrets.
2. Sinon, ajouter le registre `ghcr.io` dans Portainer (Registries) avec un jeton GitHub disposant du
   scope `read:packages`.

## 4. Mettre à jour

Dans Portainer : la stack › **Pull and redeploy**, en cochant **Re-pull image**. C'est tout.

Les migrations du schéma s'appliquent toutes seules au démarrage, la base et les photos restent dans
le dataset : **aucune étape manuelle**.

## 5. Installer sur iPhone

1. Ouvrir l'URL dans **Safari**.
2. Partager › **Sur l'écran d'accueil**.
3. Ouvrir l'app **depuis l'icône**, saisir le mot de passe, choisir son profil.
4. Activer les notifications avec le bouton prévu dans l'app.

Le push ne fonctionne **que** depuis l'icône de l'écran d'accueil, en HTTPS, sur iOS 16.4+. Jamais
depuis un onglet Safari ordinaire.

## 6. Sauvegarde

Tout est dans le dataset : un instantané ou une réplication ZFS suffit. `db/` et `originals/` sont
indispensables. `thumbs/` et `teasers/` sont regénérables, mais l'app ne les regénère pas d'elle-même :
autant les garder dans la sauvegarde.

## 7. Développement local

```sh
cd server && npm install && npm run dev   # http://127.0.0.1:8080
cd web    && npm install && npm run dev   # http://127.0.0.1:5173, /api est relayé vers le backend
```

Variables minimales pour le backend (fichier `.env` ou variables du shell) :
`DATA_DIR` (par exemple `./.data`), `APP_PASSWORD`, `SESSION_SECRET`, `PUBLIC_URL`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

Les traitements d'images et de vidéos appellent `magick` (ImageMagick 7) et `ffmpeg` / `ffprobe` :
ils doivent être installés sur la machine de développement.
