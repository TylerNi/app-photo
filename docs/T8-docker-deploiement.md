# T8 — Image Docker, stack Portainer, publication GitHub

> **Lis `docs/PLAN-GENERAL.md` en entier avant de commencer.** Tu peux démarrer immédiatement, en
> parallèle de T1 : tu connais déjà la mise en page de l'image, les variables d'environnement et
> l'arborescence des données, tout est gelé dans le plan. Tu ne pourras valider la construction
> complète qu'une fois T1 et T5 terminées.

## Mission

Emballer le projet dans **une seule image Docker**, la publier automatiquement sur GHCR à chaque
poussée sur `main`, et fournir le fichier compose que Tyler collera dans l'éditeur web de Portainer.
Objectif de mise à jour, tel que demandé : **repull image, redeploy stack, rien d'autre**.

## Fichiers que tu possèdes

```
Dockerfile
.dockerignore
.gitignore
docker-compose.yml
.env.example
.github/workflows/build.yml
README.md
```

## Fichiers auxquels tu ne touches jamais

Tout `server/`, tout `web/`, tout `docs/`. Si la construction échoue à cause du code d'une autre
tâche, tu **le signales**, tu ne corriges pas toi-même.

Tu ne configures **ni reverse proxy, ni TLS, ni certificat, ni DNS, ni Cloudflare** : Tyler s'en
occupe (§2 du plan général). L'image publie un port HTTP en clair, point.

## Travail détaillé

### 1. `Dockerfile`

Trois étapes de construction, une étape finale mince.

**Étapes de construction** — base `node:24-bookworm` (complète : elle contient les outils de
compilation dont `better-sqlite3` a besoin).

1. `deps` : copie `server/package.json` et `server/package-lock.json`, puis `npm ci --omit=dev`.
   C'est ce `node_modules` de production, avec le binaire natif de `better-sqlite3` déjà compilé, qui
   partira dans l'image finale.
2. `build-server` : `npm ci` complet, copie `server/`, `npm run build`. Vérifie que
   `dist/schema.sql` est bien présent en sortie — sans lui le conteneur démarre puis échoue à créer
   ses tables.
3. `build-web` : `npm ci` dans `web/`, copie `web/`, `npm run build`.

**Étape finale** — base `node:24-bookworm-slim`, **même distribution que les étapes de construction**
pour que le binaire natif de `better-sqlite3` reste compatible (même glibc).

```
apt-get install --no-install-recommends: ffmpeg imagemagick libheif1
```

Puis nettoyage de `/var/lib/apt/lists`. Mise en page **imposée** par `config.webDir` de T1 :

```
/app/dist/        ← sortie de build-server (dont schema.sql)
/app/node_modules ← sortie de deps
/app/web/         ← sortie de build-web (contenu de web/dist)
/app/package.json
```

`WORKDIR /app`, `ENV NODE_ENV=production`, `EXPOSE 8080`, `CMD ["node", "dist/index.js"]`.

`HEALTHCHECK` : une requête sur `http://127.0.0.1:8080/api/health` avec `node -e`, pas de `curl` (il
n'est pas installé, et l'ajouter juste pour ça serait du gras).

**Le conteneur tourne en `root`**, comportement par défaut, et c'est volontaire : le bind mount
pointe vers un dataset TrueNAS dont l'appartenance varie, et forcer un UID transformerait chaque
déploiement en séance de `chown`. Mentionne dans le README que `user: "1000:1000"` dans le compose
est possible si Tyler préfère, à condition d'ajuster les droits du dataset.

Ne définis **pas** la variable `TZ` du conteneur : la seule chose qui compte est `APP_TZ`, lue par le
code, et deux réglages de fuseau qui se ressemblent finiraient par diverger.

### 2. `.dockerignore` et `.gitignore`

`.dockerignore` : `node_modules`, `dist`, `.git`, `.github`, `docs`, `.data`, `*.md`, `.env`.
Le contexte de construction doit rester petit.

`.gitignore` : `node_modules/`, `dist/`, `.data/`, `.env`. **N'ajoute rien concernant `.claude/`** :
c'est déjà couvert par le gitignore global de Tyler.

### 3. `docker-compose.yml` — destiné à l'éditeur web de Portainer

Un seul service. Pas de conteneur de base de données, pas de nginx, pas de watchtower.

```yaml
services:
  app-photo:
    image: ghcr.io/tylerni/app-photo:latest
    container_name: app-photo
    restart: unless-stopped
    ports:
      - "${APP_PORT}:8080"
    environment:
      APP_PASSWORD: ${APP_PASSWORD}
      SESSION_SECRET: ${SESSION_SECRET}
      PUBLIC_URL: ${PUBLIC_URL}
      VAPID_PUBLIC_KEY: ${VAPID_PUBLIC_KEY}
      VAPID_PRIVATE_KEY: ${VAPID_PRIVATE_KEY}
      VAPID_SUBJECT: ${VAPID_SUBJECT}
      PROFILES: ${PROFILES}
      APP_TZ: ${APP_TZ}
      REMINDER_1: ${REMINDER_1}
      REMINDER_2: ${REMINDER_2}
      MAX_UPLOAD_MB: ${MAX_UPLOAD_MB}
    volumes:
      - ${DATA_PATH}:/data
```

Toutes les valeurs passent par les **variables d'environnement de la stack** Portainer, saisies dans
l'interface : aucun secret n'est écrit dans le fichier, donc rien de sensible ne part sur GitHub.
Reprends **exactement** les noms et les valeurs par défaut du §5 du plan général — ne renomme rien,
n'en invente aucune.

`.env.example` reprend la même liste avec des valeurs d'exemple et sert de modèle pour le champ
« Environment variables » de Portainer, ainsi que pour le développement local.

### 4. `.github/workflows/build.yml`

Déclencheurs : poussée sur `main`, poussée d'une étiquette `v*`, et `workflow_dispatch`.

- `permissions: { contents: read, packages: write }`.
- Connexion à `ghcr.io` avec `docker/login-action` et le `GITHUB_TOKEN` fourni par le workflow —
  aucun secret à créer à la main.
- `docker/build-push-action`, plateforme **`linux/amd64` uniquement** : TrueNAS SCALE tourne sur du
  x86-64, construire pour `arm64` en plus ne ferait que doubler le temps de construction.
- Étiquettes : `latest` sur `main`, plus le SHA court, plus l'étiquette de version le cas échéant.
- Cache de construction GitHub Actions (`cache-from`/`cache-to` de type `gha`) : sans lui, chaque
  poussée recompile `better-sqlite3` depuis zéro.

**Visibilité du paquet** : un paquet GHCR est **privé** par défaut, et Portainer ne pourra pas le
tirer sans identifiants. Deux voies, à documenter toutes les deux dans le README, la première
recommandée :
1. rendre le paquet public (Package settings › Change visibility) — c'est une image d'app, elle ne
   contient ni données ni secrets ;
2. sinon, ajouter le registre `ghcr.io` dans Portainer avec un jeton GitHub ayant `read:packages`.

### 5. `README.md`

Écrit **pour Tyler**, en français, court et opérationnel. Il contient, dans cet ordre :

1. Ce qu'est le projet, en trois lignes.
2. **Préparer les secrets** : `npx web-push generate-vapid-keys` pour la paire VAPID, et
   `openssl rand -hex 32` pour `SESSION_SECRET`.
3. **Créer le dataset** sur TrueNAS et noter son chemin (celui qui ira dans `DATA_PATH`).
4. **Déployer dans Portainer** : Stacks › Add stack › Web editor, coller `docker-compose.yml`,
   remplir les variables d'environnement, déployer.
5. **Mettre à jour** : la procédure exacte demandée — *Pull and redeploy*, en cochant « Re-pull
   image ». Précise que les migrations s'appliquent toutes seules au démarrage et qu'il n'y a
   **aucune** étape manuelle.
6. **Installer sur iPhone** : ouvrir l'URL dans Safari, Partager, « Sur l'écran d'accueil », puis
   ouvrir depuis l'icône et activer les notifications avec le bouton prévu. Rappelle que le push ne
   fonctionne **que** depuis l'icône de l'écran d'accueil, jamais depuis un onglet Safari.
7. **Sauvegarde** : tout est dans le dataset (`db/`, `originals/`), donc une réplication ou un
   instantané ZFS suffit. `thumbs/` et `teasers/` sont regénérables et n'ont pas besoin d'être
   sauvegardés — mais l'app ne les regénère pas toute seule, donc autant les garder.
8. **Développement local** : `npm run dev` dans `server/` et dans `web/`, avec la liste des variables
   minimales.

Pas de section « architecture », pas de diagramme, pas de feuille de route, pas de badges : le
`docs/PLAN-GENERAL.md` couvre déjà tout ça.

## Critères d'acceptation

1. `docker build -t app-photo .` réussit depuis un dépôt propre.
2. L'image finale pèse moins de 700 Mo (`ffmpeg` et ImageMagick sont volumineux, c'est attendu).
3. `docker run --rm -e ... -v $(pwd)/.data:/data -p 8080:8080 app-photo` démarre, et
   `curl localhost:8080/api/health` répond `{"ok":true}`.
4. Sans `APP_PASSWORD`, le conteneur s'arrête avec le message d'erreur français de T1.
5. `docker exec` dans le conteneur :
   - `magick -version` et `ffmpeg -version` répondent ;
   - **`magick identify photo.heic` décode bien un HEIC** — c'est la vérification la plus importante
     de ta tâche, puisque c'est le format natif des photos iPhone. Si le délégué HEIC manque, ajoute
     le paquet Debian nécessaire (`libmagickcore-6.q16-6-extra` fournit des délégués
     supplémentaires) ou, en dernier recours, `libheif-examples` pour disposer de `heif-convert`, et
     **préviens Tyler et T2** du choix retenu.
   - `node -e "console.log(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date()))"`
     renvoie une date : ça confirme que l'image embarque bien l'ICU complet, dont dépend tout le
     calcul des journées.
6. Le volume monté contient bien `db/app.db` et `originals/` après un premier upload, et **les
   données survivent** à `docker rm` puis `docker run` de la même image.
7. Le conteneur remplacé par une image reconstruite retrouve sa base sans perte et sans étape
   manuelle (c'est le scénario « repull + redeploy »).
8. Le workflow GitHub Actions passe au vert et publie `ghcr.io/tylerni/app-photo:latest`.
9. `docker pull ghcr.io/tylerni/app-photo:latest` fonctionne depuis une autre machine une fois le
   paquet rendu public.
10. Le `docker-compose.yml` collé dans l'éditeur web de Portainer, avec les variables remplies,
    déploie sans erreur. (Si tu n'as pas accès au serveur, valide avec
    `docker compose config` en fournissant un `.env`, et laisse le déploiement réel à Tyler.)

## Ce que tu ne fais pas

Pas de reverse proxy, pas de conteneur Traefik ou nginx, pas de certificat, pas de Cloudflare, pas de
Watchtower, pas de sauvegarde automatisée, pas de conteneur de base de données, pas de construction
multi-architecture, pas de tests dans la CI, pas de déploiement automatique vers le serveur, pas de
Renovate ni de Dependabot, pas d'image de développement séparée.

## Fin de tâche

Commit des fichiers que tu possèdes uniquement, message en français préfixé `T8 : `. **Pas de push** —
même si publier l'image demande une poussée, c'est Tyler qui la déclenche. Dis-lui explicitement quoi
faire pour que la première image sorte.
