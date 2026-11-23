/**
 * F1 — the manual in French. The same sections as manualEn in help.ts: a change there is made
 * here too (tests/manualfr.test.ts checks that both have the same sections). Commands and keys
 * stay as they are typed (`todo add`, Ctrl+K); the words around them are French.
 */
export function manualFr(cmds: string): string {
  return `# Manuel d'ICEBREAKER

> ⚠ LOGICIEL DE TEST — pas prêt pour un usage intensif, sécurisé ou professionnel.
> Un projet de loisir fait par une personne qui n'est pas développeuse, avec une IA qui écrit l'essentiel du code : jamais audité, sans garantie ni assistance — son auteur n'est pas responsable des bugs, pertes de données ou problèmes de sécurité.
> N'y mets rien de sensible (vault chiffré ou non). Sauvegarde ton vault régulièrement.
> Tu peux aider : signaler des bugs, dire comment ça s'est passé, proposer des idées, faire des modules et des thèmes — github.com/kiddoko/ICEBREAKER (Issues et Discussions). Le texte complet : DISCLAIMER.md là-bas.

Tout marche **au clavier seul**, **à la souris seule**, à la **manette**, ou en mélangeant.

## Clavier
**Tous les raccourcis, avec une recherche : \`Ctrl+/\` (la page RACCOURCIS).** Change-les dans Réglages → TOUCHES ; crée les tiens avec \`bind\`. Sur un Mac, ⌘ joue le rôle de Ctrl.
- \`Ctrl+K\` ou **Maj deux fois** — LE MENU : tape pour tout chercher, ou une touche de menu + Entrée
- \`Ctrl+Z\` / \`Ctrl+Shift+Z\` — annuler / rétablir la dernière chose faite (réglages, widgets, corbeille, renommages, nouvelles notes, tâches, rappels, habitudes, événements ; un module désinstallé, juste après)
- \`Tab\` — la chose suivante à l'écran · \`F6\` / \`Shift+F6\` (ou \`Shift+Tab\`) — la partie suivante / précédente de l'écran (page → panneau → shell → arbre)
- \`Ctrl+Shift+H / M / E / U\` — HOME · MODULES · NEXUS · UPLINK (l'IA)
- \`Ctrl+Shift+T / P\` — l'arbre (aussi \`Ctrl+B\`) · le panneau latéral · **Ctrl+\`** — le shell · \`F10\` ou un clic sur **◆ ICEBREAKER ▾** (en haut à gauche) : le menu du deck
- \`Ctrl+N\` nouvelle note · \`Ctrl+Shift+N\` nouveau dossier · \`Ctrl+J\` le journal (ouvert à aujourd'hui) · \`Ctrl+,\` réglages
- \`Ctrl+Tab\` / \`Ctrl+Shift+Tab\` — onglet suivant / précédent · \`Ctrl+1…9\` — cet onglet · \`Ctrl+W\` / \`Shift+Esc\` — le fermer (celui que tu regardes, dans n'importe quel cadre) · glisse un onglet sur un autre cadre ou un autre onglet
- \`Ctrl+S\` — enregistrer (les notes s'enregistrent aussi toutes seules ; une note vidée par erreur n'est écrite que par \`Ctrl+S\`, en la fermant ou 30 s plus tard, et son texte part d'abord à la corbeille) · \`Ctrl+Shift+S\` — enregistrer sous · \`Ctrl+Entrée\` — suivre le [[lien]] sous le curseur
- \`Alt+Retour arrière\` sur un Mac, \`Ctrl+Retour arrière\` sous Windows / Linux — effacer tout le mot précédent (\`Maj+Retour arrière\` est un retour arrière normal)
- \`Maj\` + molette dans une note — une ligne à la fois
- Dans l'arbre : \`Shift+↑\` / \`Shift+↓\` — fichier par fichier, chacun montré tout de suite dans l'onglet d'aperçu (comme Maj + molette)
- \`Ctrl+=\` / \`Ctrl+-\` / \`Ctrl+0\` — taille de l'interface · \`F11\` — plein écran · \`F1\` — ce manuel
- \`Ctrl+Shift+L\` — se déconnecter · \`Ctrl+Shift+Retour arrière\` — la corbeille
- \`h\` — HOME, de partout où tu n'écris pas · \`Échap\` — retour à la page (depuis l'arbre ou le shell) ; sur HOME sans rien à fermer, le menu **◆ ICEBREAKER**
- Dans le shell : \`tour\` — la visite guidée · \`undo list\` · \`chat\` — parler à l'IA · \`journal\` — la page du jour, \`journal "une ligne"\` — une ligne dedans sans l'ouvrir · \`daily\` — le bilan de fin de journée · \`exit\` — cacher le shell · \`quit\` — quitter

## Souris
Clique sur tout : onglets, fichiers, tuiles, boutons, jours du calendrier (dans l'arbre, un clic choisit une note, un double-clic l'ouvre). Chaque clic lance une commande du shell, montrée dans le **log** du shell : clique un peu partout pour apprendre la ligne de commande. Survole quelque chose un instant pour voir sa commande et son raccourci. Glisse pour sélectionner du texte (dans les notes, ibsh et ton vrai terminal), double-clic sur un mot, triple-clic sur une ligne, Ctrl+clic pour suivre un lien.
La molette fait défiler ; dans les Réglages elle déplace la ligne où tu es (un trackpad aussi), et sur un curseur elle avance de 1 en 1.
Glisse la ligne au-dessus du shell pour le redimensionner. Le bouton ⌨ de la barre d'état ouvre le clavier à l'écran (pour écrire à la souris).

## Manette (disposition Xbox / PlayStation)
- **Croix / stick gauche** — se déplacer · **stick droit** — défiler
- **A** — valider · **B** — retour · **Y** (ou **RB** maintenu) — LE MENU · **X** — clavier à l'écran
- **LB / RB** — onglet précédent / suivant · **LT / RT** — page précédente / suivante
- **Select** — changer de cadre · **Start** — HOME
Clavier à l'écran : A tape, B efface, Y espace, Start entrée, LB/RB déplacent le curseur, X ferme.
- **Les raccourcis à l'écran te suivent** : ils sont posés sur des touches (avec la police du deck) ; appuie sur un bouton de la manette et chacun de ceux qu'elle a aussi (entrée, échap, les flèches, ⌘K, ctrl+tab, page précédente / suivante, F10) montre ce bouton de la manette que tu tiens — Xbox, PlayStation ou Nintendo. Une touche du clavier ramène les touches.

## Shell
Un petit shell façon POSIX sur ton vault : tubes \`|\`, redirections \`> >> <\`, \`&&\` \`||\` \`;\`, guillemets, \`$VARIABLES\`, motifs \`*.md\`, historique (↑), suggestions à la fish (→), complétion avec Tab.
\`/\` et \`~\` sont la racine du vault. \`<cmd> -h\` (ou \`man <cmd>\`) montre l'aide d'une commande avec des exemples complets : \`todo -h\`. Les commandes répondent en français ; leurs aides (\`-h\`, \`usage:\`) restent en anglais, comme les pages de manuel.
- \`help\` — les commandes pour commencer ; \`help all\` toutes, \`help todo\` celles d'un module. Le **CATALOGUE** (\`catalog\`) liste tout le reste : commandes, réglages, raccourcis, les fonctions que partagent les modules, l'API des modules (\`catalog api\`).
- **Onglets du shell** : **+** (ou **Ctrl+Maj+\`**) ouvre un petit menu — **ibsh** (entrée), puis chaque shell de cet ordinateur (zsh, bash, fish ; PowerShell, cmd, WSL sous Windows), puis renommer. Plusieurs onglets ibsh, chacun avec son dossier et son historique ↑ ; tout onglet se ferme (×) et se renomme (clic droit, \`term rename <n> <nom>\`). \`term new [ibsh|bash|pwsh…]\`, \`term shells\` ; Réglages → SHELL → Nouvel onglet choisit ce que + ouvre avec entrée. Les onglets reviennent comme tu les as laissés.
- **Au repos** : 20 s sans clavier ni souris, les animations passent à 12 images par seconde ; après une minute, à 2 (l'horloge continue) — la première touche réveille tout (Réglages → APPARENCE → économie d'énergie).
- **Arrêter une commande** : \`Ctrl+C\` (sur un Mac \`⌘X\`, ou la vraie touche Control + C) arrête ce qui tourne ou la question posée — ça finit par ^C et l'invite revient. \`Échap\` arrête aussi une question. Dans ton vrai terminal, \`⌘X\` sur un Mac envoie ctrl+C.
- **Copier ce qu'une commande a écrit** : glisse dessus à la souris (double-clic : un mot, triple-clic : une ligne), puis \`⌘C\` sur un Mac, \`Ctrl+C\` sous Windows / Linux — \`Ctrl+C\` sans sélection arrête toujours la commande. Clic droit → Copier marche aussi, dans ibsh et dans ton vrai terminal.
- **Noms avec des espaces** : Tab les met entre guillemets — \`cd STA\` + Tab donne \`cd "START HERE/"\`.
- \`exit\` — cache le shell, comme **Ctrl+\`** (ce qui tourne dedans continue). \`quit\` — quitte ICEBREAKER, comme ⌘Q / Alt+F4 : les pages s'enregistrent, le vault se verrouille, une mise à jour en attente s'installe. Dans un script, \`exit\` finit le script ; dans ton vrai terminal c'est le \`exit\` de ce shell.
- **Chaque clic a sa commande** : \`save\`, \`save as <chemin>\`, \`copy path|link\`, \`tree reveal\`, \`tab close others|right|all\`, \`modules on|off <id>\`, \`settings <catégorie>\`, \`setup\` — ce que fait un menu s'affiche dans le log.
- **Ton vrai terminal** (zsh, bash, PowerShell) : coller plusieurs lignes demande d'abord ; \`Shift+PgUp\` / \`Shift+PgDn\` remontent ; 10 000 lignes sont gardées.
- \`say <texte>\` — la voix du deck le dit, avec la voix et la langue choisies dans Réglages → VOIX, comme UPLINK (en japonais, un texte qui n'est pas en japonais est d'abord traduit par ton IA). Muette quand le son est coupé ou la voix éteinte. Dans ton vrai terminal aussi (\`command say\` est celui de macOS).

${cmds}

## Fichiers
- Vault : tes notes, en Markdown simple — \`vault\` dit où. \`vault encrypt\` : chiffré sur le disque (les noms aussi ; d'abord une sauvegarde zip en clair ; une clé de récupération de 24 mots, montrée une seule fois), \`vault decrypt\`, \`vault export <dossier>\` (une copie en clair), \`vault recovery\` (une nouvelle clé de récupération), \`vault rekey\` (une nouvelle clé de vault, tout chiffré à nouveau). Mot de passe oublié : page de connexion → mot de passe oublié ?. Le chiffrement est une option : Réglages → VIE PRIVÉE. Un autre ordinateur ou une clé USB : page de connexion → ouvrir un vault (le vault emporte son compte et ses réglages ; parcourir choisit le dossier). \`vault move [dossier]\` : tout le vault ailleurs, vérifié (un dossier qui contient déjà des choses le reçoit dedans, sous son nom). Choisir comme vault un dossier déjà plein (Documents…) propose un sous-dossier « Icebreaker ». Tapé dans le shell, ça reste dans le shell ; avec \`--window\` (les menus) chaque étape est une fenêtre. La clé du vault chiffre les fichiers ; ton mot de passe et la clé de récupération sont deux portes vers elle.
- Mises à jour : Réglages → MISES À JOUR, ou \`update\` (chercher), \`update install\`, \`store update\` (les modules). Chaque jour par défaut ; l'installation demande d'abord sauf si tu dis « toute seule » (ICEBREAKER s'installe alors quand tu quittes).
- **Quoi de neuf** : après une mise à jour, un court QUOI DE NEUF s'ouvre une fois (la version, les nouveautés, les corrections). À nouveau quand tu veux : \`changelog\` (ou \`whatsnew\`), Réglages → MISES À JOUR → Quoi de neuf, ou LE MENU ; ←→ parcourent les versions plus anciennes, échap ferme.
- Le STORE dans le shell : \`store search\`, \`store info <id>\`, \`store install <id>\` (et ce dont il a besoin), \`store remove <id>\`.
- Réglages : espace agit sur la ligne où tu es (sous la souris, sinon celle choisie) : coche une case, tourne un choix, met un curseur à 0 et le remet (couper / rétablir ; un curseur sans 0, comme la luminosité : à sa valeur par défaut et retour) ; les curseurs avancent toujours de 1 (maintenu : plus vite, toujours de 1 en 1) ; grisé = dépend d'un autre réglage. \`settings <catégorie>\` ouvre directement une catégorie. Le STORE : tape pour chercher, suppr retire. MODULES et NEXUS : tape pour chercher.
- \`.icebreaker/themes/*.toml\` — tes thèmes (\`theme new <nom>\`)
- \`.icebreaker/plugins/<id>/\` — tes modules (\`plugin new <id>\`) · ils tournent dans un bac à sable : seulement ce que leurs autorisations permettent, dans le shell aussi, jamais plus que ce que tu as accepté (docs/SANDBOX.md)
- **Autorisations** : ce qu'un module peut atteindre est dit en mots simples, avec un niveau ; les plus risquées sont redemandées la première fois qu'elles servent. **Réglages → AUTORISATIONS** montre celles de chaque module, avec la dernière utilisation — entrée en retire une ou la rend — et ce que l'IA peut lire (rien · ce que tu lui donnes · tout ton vault) et ce que ton vrai terminal peut demander au deck. \`plugin perms\`, \`plugin revoke <id> <autorisation>\`, \`plugin grant …\`. Le filtre **◈ accès** du LOG est le journal : qui a utilisé quoi, quand, sur quoi (docs/PERMISSIONS.md).
- Un module autorisé à jouer du son (autorisation « audio » : un tracker, une boîte à rythmes) montre **♪ son nom** dans la barre d'état pendant qu'il joue : clique dessus (ou \`audio stop\`) pour le faire taire. L'onglet de sa page montre **♪** aussi : un clic coupe juste cet onglet (**⊘** : il continue de jouer, tu ne l'entends pas), encore un pour l'entendre. Son volume : Réglages → SON → mixeur → Modules.
- Une page qui **joue du clavier** (un tracker, un piano, un jeu : les touches sont à elle) garde toutes les touches tant qu'elle est devant — lettres, chiffres, espace et toutes les combinaisons **alt**, alt + flèches aussi (sous Windows et Linux, les touches de cadre du deck) : **échap** ferme d'abord ce que la page a d'ouvert (son menu, sa fenêtre), puis rend les touches au deck (l'arbre ou le shell les prend ; la page seule dans la fenêtre : l'onglet d'avant), un clic sur la page les lui redonne. Les raccourcis ⌘ / ctrl restent ceux du deck — mais dans la page d'un module, ⌘C ⌘X ⌘V ⌘A sont à elle (copier, couper, coller, tout sélectionner).
- Un module peut **ouvrir un type de fichier** (BreakerMED : .bmed .mod .med) : double-clic dans l'arbre, entrée dans NEXUS ou \`open songs/tune.mod\`, et il s'ouvre dans la page du module. Hors des dossiers que le module peut lire, on te demande d'abord (ce fichier seulement). Deux modules pour un même type : tu choisis une fois — \`plugin open-with\` le montre et le change.
- \`.icebreaker/templates/journal.md\` — ton modèle de journal
- \`.trash/\` — là où \`rm\` met les choses (\`trash open\` pour la voir, restaurer). Une note envoyée là ferme ses onglets et quitte les épinglés ; ⌘Z la ramène. Pour supprimer pour de bon : CORBEILLE → **supprimer définitivement** (ou \`suppr\`), \`trash purge <n>\`, \`trash empty\` — ça demande d'abord et **ne peut pas être annulé** (pas de ⌘Z) : c'est la seule façon dont le deck efface quoi que ce soit, et toi seul·e le peux (jamais un module, ni ton vrai terminal).

## Apparence
- Effets : Réglages → APPARENCE → Effets, le bouton ✦ fx, ou \`fx\`. **Bloom** : une douce lueur autour des choses claires (le logo, l'onglet choisi, le texte d'accent) comme des tubes néon ; à 100 % un halo net large de quelques lettres, les fonds sombres et le texte gris ne brillent pas. **Séparation RVB** (\`fx chroma\`) : des franges rouges et bleues sur le texte, les cadres et les glyphes, jamais sur les fonds. **Courbure CRT** (\`fx curve 0-100\`, coupée par défaut) : coins d'écran arrondis, un bord plus sombre, un léger reflet. **Vitesse du scintillement** (\`fx flicker 150\`) : la vitesse du scintillement CRT. Préréglages : \`fx none | light | medium | heavy | party\` (\`fx off\` = \`fx none\`). \`debug perf\` mesure ce que coûte l'écran.
- La rangée du haut : les onglets des cadres, avec **◆ icebreaker ▾** dans son coin gauche (\`F10\`) — le menu du deck : modules (⌘⇧M), store, nexus (⌘⇧E), réglages (⌘,), aide (F1), chacun s'ouvre en onglet comme les autres, puis quoi de neuf, mises à jour, refaire le setup, la visite guidée, se déconnecter, quitter — et **uplink ■ │ la date et l'heure** dans son coin droit (un clic sur la date : un mini calendrier). Une fenêtre étroite les raccourcit en **◆ ▾** et **■ 19:07**.
- **Cadres** : l'arbre, la page, le panneau latéral et le shell ont chacun leurs onglets sur leur bord. Glisse un onglet sur un autre cadre pour l'y garder (ou \`tab move 3 panel\`, ou clic droit → Déplacer vers) ; dépose-le sur un autre onglet : un groupe. Glisse la bordure entre deux cadres pour les redimensionner (elle s'allume avec ↔ / ↕ sous le pointeur) ; **clic droit sur le nom d'un cadre (VAULT, PANNEAU, les onglets du shell) → Déplacer vers** gauche / droite / haut / bas, Replier, Disposition ; Réglages → APPARENCE → Disposition ; dans **ibsh** (pas ton vrai terminal, ni un module) : \`frame fold tree\` replie un cadre en bande, \`layout preset shell-right\`, \`layout reset\`, \`tab move 3 panel\` ; ⌘Z annule. **HOME est épinglé** : toujours le premier onglet, jamais fermé par erreur.
- **Réveils** : \`clock alarm 7:30 [nom] [--days mon-fri]\`, \`clock alarm\` les liste, \`rm\` / \`on\` / \`off\` / \`snooze\` / \`test\` — dans ibsh (ton vrai terminal peut seulement en régler un ; un module peut seulement les lister). Ils sonnent (un plein écran, le son, une notification) tant qu'ICEBREAKER tourne. Un **rappel** reste à l'écran jusqu'à un clic ou échap, s'écrit dans le log, et passe par une notification du système quand la fenêtre est réduite.
- Barre du haut : **UPLINK ■** — vert quand ton IA est là, ambre pendant qu'elle réfléchit, rouge quand elle est coupée (sa bulle dit quelle IA ; un clic l'ouvre).
- **Questions** : les réponses sont toujours en bas à droite — Non (ou fermer) à gauche, Oui (ou ouvrir) à droite ; ← → choisissent, \`y\` / \`n\` répondent, échap dit non. Une question dont la réponse sûre est non commence sur Non.
- Une petite fenêtre : la barre d'état et les en-têtes de page laissent d'abord tomber le moins utile, sans jamais se chevaucher ni se couper. Développeurs : \`debug layout\` liste ce qui est coupé à 14 tailles, \`debug pad\` montre les boutons de la manette.
- THEME STUDIO (\`launch studio\`) : chaque réglage du thème, en direct. Entrée sur une couleur ouvre la **palette** — 18 teintes × 10 nuances à la saturation choisie, les gris, les couleurs du thème ; flèches / souris choisissent, tab atteint la saturation et le champ #hex (toujours modifiable), entrée garde. ↺ sur un réglage changé (ou \`r\`) remet la valeur du thème.

## L'écran
- **Barre de menus** (en haut) : modules · store · nexus · réglages · aide. La date à droite ouvre un **mini-calendrier** (\`clock calendar\`).
- **Cadres** : l'arbre, la page, le panneau latéral, le shell. **▣** dans la barre d'état (\`frame solo\`) : la page seule, les autres repliés ; encore une fois : ils reviennent.
- **Barre d'état** (en bas) : arrange-la — glisse un élément de côté, clic droit dessus (déplacer, cacher, **avec celui de gauche** / seul : des groupes comme pour les onglets), \`statusbar move | hide | show | join | alone | reset\`. ◧ ▾ ◨ ▣ (l'arbre, le shell, le panneau, la page seule) sont quatre éléments qui bougent chacun.
- **Log** à côté d'un shell large : ce que tu tapes, ce que lancent les clics, les erreurs, les messages. **›** sur sa ligne le replie en onglet (\`log side off\`), la ligne se tire pour sa largeur (\`log width 40\`) ; **‹ log** sur le bord droit du shell (ou **‹ à côté du shell** dans son onglet) le remet.
- **HOME** : des widgets sur des pages ; ✎ modifier apparaît près du coin en haut à droite (ou \`Ctrl+E\`) ; la pop-up d'un widget a **⚙ réglages** pour son module. \`neofetch\` résume la machine.
- **NEXUS** : le vault comme un lieu — les dossiers sont des boîtes, les fichiers des feuilles avec un petit dessin de leur type.

## Modules et STORE
Tout ce qui dépasse le cœur est un module : TODO, CALENDAR, REMINDERS, HABITS, MUSIC, STATS, UPLINK, WEATHER, NEWS… **MODULES** (\`Ctrl+Shift+M\`, \`modules\`) les allume et les éteint (\`modules on|off <id>\`) ; la commande d'un module éteint le dit. Le **STORE** (\`store\`) en installe d'autres, et des thèmes : ce qu'un module demande est montré avant qu'il s'allume, et il n'a jamais plus (Réglages → AUTORISATIONS). \`store update\` les met à jour. \`cal import\` lit un .csv ou un .ics dans ton calendrier (jamais deux fois, jamais depuis un dossier caché).

## Hors ligne : le mode furtif
\`stealth on\` (ou Réglages → VIE PRIVÉE, ou le setup) : **rien ne quitte cet ordinateur** ni ton réseau local — pas d'IA en ligne (un modèle local marche toujours), pas de météo, pas d'actus, pas de Google, pas d'installation, pas de recherche de mise à jour. **◉ furtif** s'affiche dans la barre d'état ; \`stealth off\` ramène chaque fonction réseau, chacune toujours à toi d'allumer.

## Jours et heures
Les mêmes mots partout (rappels, \`todo add … --due\`, \`cal add\`), en anglais ou en français :
\`+1h\` · \`1h\` · \`30min\` · \`19:00\` · \`19h\` · \`19h30\` · \`demain 9h\` · \`tomorrow 9am\` · \`ven 18h\` · \`fri 6pm\` · \`24/12 9:00\` · \`dans 1h\` · \`à 19h\` · \`ce soir\`.
« 1h »… « 6h » seuls veulent dire « dans tant de temps » ; avec un jour (« demain 6h »), ou à partir de 7h, une heure de la journée. Un rappel sans heure : dans une heure.
`;
}
