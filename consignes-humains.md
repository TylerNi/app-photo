
#Contexte général du projet:
Je veux faire une application pour moi et ma blonde qui sert a la fois d'album partagée et à la fois de remplacement a un streak snap. Je veux que l'app soit un site web (donc en react je suppose, mais ton choix) que je peux faire ajouter comme app sur ios (en fesant partager sur le site web et ajouter à l'écran d'accueil). Je veux pouvoir selfhost l'app et la publier sur un port sur portainer sur mon serveur Truenas. Pour Portainer je veux déployer le stack à l'aide du web editor et des variables d'environnements et je veux que pour update l'app j'ai juste a repull image et redeploy le stack (le projet est sur GitHub). 

#Pour le frontend du projet: 
Je veux que quand on ouvre l'app il y a un mot de passe a rentrer la premiere fois (après on est considéré logged-in et ca nous déconnecte jamais). Par la suite, on decide si on est Camille ou Tyler en choisissant un peu comme en style Netflix avec les gros carré. Après chaque fois qu'on rouvre l'app, on sera sur ce profile automatiquement, sans avoir besoin de log in ou choisir la personne qu'on est chaque fois. Par la suite, la page d'ouverture de l'app/ la page principale, sera la fonctionnalité snap, donc tu peux voir le streak qu'on a actuel et le streak total. Le streak actuel compte le nombre de jours de suite ou les deux on envoyés une photo. Le strak total compte le nombre de jours ou les deux on envoyé une photo. Pour l'envoie de photo, chacun on a deux options; Upload une photo ou en prendre une a l'instant. Une fois fais, le streak du jour augmentera. Pour la section album partager, je veux un bouton qui permet d'y acceder sur la page principale. La section album partagé permet de voir toutes les photos vraiment comme un album partagé (incluant les photos de streak) qui sont dans l'app. elle permet aussi d'ajouter des photos à l'album patagée (ex de la gallerie photos d'apple). Je veux pouvoir download ou copier une photo sur le press papier de mon téléphone si je hold mon doigt sur une photo

#Pour le backend du projet:
Je veux que tout soit stocké sur mon serveur truenas, je suppose que tu vas utiliser une db. je veux pas avoir a me créer de compte nullepart. Je veux compresser aucune image, on garde tout en qualitée max, aucune compression. 

#Autres features du projet:
Il doit y avoir des notification envoyées lorsque une personne upload une ou plusieurs photos ex: Tyler a ajouté 5 photos a l'album (si ajout a l'album partagé). ou Camille a envoyé un Snap. Notif de rappel de strea: Ton Streak de 35 jours bientôt finir.

#Autre
Pause moi des questions pour t'assurer de tout comprendre et que ce soit clair. Pause moi des questions pour des choix technologiques si nécéssaire. propose moi des formats de notifs différents.

#Plan de travail
Je veux diviser le projet en plusieurs sous taches qui auront chacun un claude assigné par tache. Fais un plan général du projet que chaque claude lira en .md et un .md très détaillé par tache du projet pour le claude spécifique.