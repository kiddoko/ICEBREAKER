/**
 * START HERE in French: the same notes as starthere.ts (same file names, so the
 * links and the deck's stamps hold), written for a deck in French. Keys are written
 * the Mac way (⌘ ⇧ ⌥) like the English ones: forThisOS rewrites them for Windows and
 * Linux. Change a note in English, change it here too (tests/starthere.test.ts checks
 * that both have the same notes and the same commands).
 */
export function startHereFr(LOGO: string): Record<string, string> {
  return {
    "README.md": `# START HERE

${LOGO}

Bienvenue, netrunner. ICEBREAKER est une **appli de notes qui ressemble à un vieux terminal
de science-fiction** — et un petit système d'exploitation autour de tes notes : des modules,
des widgets, un vrai shell, une IA si tu en veux une. Tout marche hors ligne, au clavier,
à la souris ou à la manette.

> **⚠ À lire d'abord — logiciel de test.** ICEBREAKER est un projet de loisir fait par une
> personne qui n'est pas développeuse, avec une IA (Claude) qui écrit l'essentiel du code. Il est
> libre et gratuit, fait avec soin — mais **jamais audité, sans garantie ni support**, et **pas prêt
> pour un usage intensif, sécurisé ou professionnel**. Son auteur n'est pas responsable des bugs,
> des pertes de données ou des problèmes de sécurité.
>
> - **N'y mets rien de sensible** : ni mots de passe, ni banque, ni documents médicaux, juridiques
>   ou confidentiels — vault chiffré ou non.
> - **Sauvegarde ton vault régulièrement** : c'est un dossier, copie-le (\`vault export\` quand il est chiffré).
> - **Aide si tu veux** : signale les bugs, raconte comment ça s'est passé, partage des idées, fais
>   des modules et des thèmes — github.com/kiddoko/ICEBREAKER (Issues et Discussions).
>
> Le texte complet : DISCLAIMER.md sur github.com/kiddoko/ICEBREAKER.

## La visite en 30 secondes

\`\`\`
┌ ◆ ▾  vault   ⌂ home  ✎ idées  ♪ musique × + ─────────── uplink ■ │ heure ┐
│ ┌────────┐ ┌───────────────────────────────────────────────────────────┐ │
│ │ ★ épin.│ │  widgets : horloge · météo · tâches · habitudes · stats…  │ │
│ │ arbre  │ │  e = modifier · a = ajouter un widget · entrée = l'ouvrir │ │
│ └────────┘ └───────────────────────────────────────────────────────────┘ │
│ ┌ shell: zsh · ibsh · log ────────────────────────────────── ≡ ─ □ ────┐ │
│ │ ◆ ~/notes ❯ _                                                        │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
└ barre d'état : touches d'ici · ◧ ▾ ◨ ▣ · ✦ fx · ⌘K menu · F1 aide ───────┘
\`\`\`

En haut à gauche, **◆ ▾** est le menu du deck (**◆ icebreaker ▾** dans une fenêtre large).

| Tu veux… | Fais ça |
|---|---|
| trouver ou faire n'importe quoi | **LE MENU** : ⌘K, ou maj deux fois (même en tapant) — tape pour chercher, ou une touche + entrée (m ⏎ = MODULES) |
| voir tous les raccourcis | **⌘/ / Ctrl+/** |
| écrire une note | **⌘N / Ctrl+N**, ou *+ note* dans l'arbre |
| le journal (aujourd'hui) | **⌘J / Ctrl+J**, ou \`journal\` · \`journal "une ligne"\` ajoute une ligne sans l'ouvrir |
| changer l'apparence | les réglages (**◆ icebreaker ▾** en haut à gauche — **◆ ▾** dans une fenêtre étroite — ou **⌘, / Ctrl+,**) → APPARENCE, ou \`theme\` |
| couper une fonction | **MODULES** (⌘⇧M) → espace |
| apprendre le shell | clique sur n'importe quoi : la commande que ça lance s'affiche dans le **log** du shell (à sa droite) |
| savoir ce que fait un élément | pose le pointeur dessus : une bulle dit ce qu'il fait et la commande qu'il lance |
| voir tout ce que le deck sait faire | **CATALOG** (\`catalog\`) : chaque commande, réglage, raccourci, fonction… et comment l'appeler |
| quelqu'un d'autre sur ce deck (ou un deck pour le travail) | la page de connexion → **+ nouveau compte** : ses réglages, son thème et son vault à lui |

## À lire ensuite

- [[modules]] — chaque module, ce qu'il fait, sa commande
- [[ui]] — HOME, les widgets, l'arbre, les onglets, les épingles, les réglages
- [[shell]] — ibsh, ton vrai terminal, les scripts, les macros
- [[keys]] — le clavier, la souris, la manette
- [[privacy]] — ce qui reste ici, ce qui sort, le mode furtif, les modules que tu installes
- [[ai]] — l'IA comme assistant de travail : écrire, trier, planifier (facultatif, peut être locale)
- \`starthere dev\` écrit **FOR DEVELOPERS/** — thèmes, modules, packs de sons, bricoler le deck (en anglais)

> Tout ici est une note normale : change-la, déplace-la, supprime-la.
> Ces notes sont dans la langue du deck : change-la (Réglages → TOI) et celles que tu
> n'as pas modifiées suivent ; celles que tu as modifiées restent à toi. \`starthere\` remet
> celles qui manquent, \`starthere --force\` les réécrit toutes.
`,

    "modules.md": `# Les modules

Une fonction = un module. Chaque module peut être **coupé, supprimé et
réinstallé** (MODULES → espace / x, ou le STORE) — ceux livrés avec le deck aussi.

\`\`\`
   ┌──┐ ┌──┐ ┌──┐ ┌──┐
   │▦ │ │◆ │ │☂ │ │◷ │   MODULES (⌘⇧M) : un anneau d'éclats (les puces que les netrunners enfichent)
   └──┘ └──┘ └──┘ └──┘   ←↑↓→ choisir · entrée lancer · espace allumer/couper · suppr retirer · tape pour chercher
\`\`\`

Donne une **couleur** à un module (clic droit sur un module → couleur, ou \`modules tag todo cyan\`) :
son éclat prend cette couleur. La barre du haut filtre : tape pour chercher (**/**),
clique sur des carrés de couleur pour ne voir que ces couleurs (\`modules view cyan pink\`). NEXUS
a la même barre. Les carrés de couleur de l'arbre en cochent plusieurs aussi (\`tag view red blue\`).

| Module | Ce qu'il fait | Essaie |
|---|---|---|
| **TODO** | des tâches avec priorités, échéances, étiquettes, **récurrentes** — et les \`- [ ]\` de tes notes | \`todo add "sport" --every mon,wed,sat\` |
| **HABITS** | des cases qui se remettent à zéro chaque jour, des séries ▲ | \`habit add "eau" --times 8\` |
| **REMINDERS** | une notification avant et à l'heure | \`remind "appeler maman" ven 18h\` |
| **CALENDAR** | un agenda local (+ Google si tu veux) | \`cal add "dentiste" ven 14h30\` |
| **JOURNAL** | une page par jour, le bilan du soir | \`journal\` · \`journal "une ligne"\` · \`daily\` |
| **STATS** | des chiffres dans le temps, venus des modules et de toi | \`stats set poids 72 --unit kg\` |
| **WEATHER** | n'importe quel endroit, un ciel ASCII animé, la semaine | \`weather Tokyo\` |
| **CLOCKS** | des minuteurs (plusieurs), un chrono avec des tours, le monde, des réveils | \`timer 4m thé\` · \`clock alarm 7:30 --days mon-fri\` |
| **FOCUS** | un anneau pomodoro, le mode zen | \`focus open\` |
| **NEWS** | ta région, ton pays, des catégories ou tes mots — une page et un widget | \`news page\` · \`news show ai\` |
| **MUSIC** | ton dossier de musique, ce qui joue | \`music play daft punk\` |
| **UPLINK** | l'IA : la discussion (en onglets), le widget chatbox | ⌘⇧U |
| **NEXUS** | le vault en pseudo-3D | \`explore\` |
| **SYSMON** | les signes vitaux de la machine | \`sysmon\` |
| **VOICE** | le deck parle (voix locales) — tu choisis ce qu'il dit : erreurs, rappels, événements, l'heure… | \`voice test\` · \`say bonjour\` |

Les réglages propres à chaque module : ⚙ → les sections ◇ en bas.
Les modules se parlent (\`modules api\` liste ce qu'ils partagent). **CATALOG**
(\`catalog\` dans le shell) montre tout ce que le deck et ses modules
savent faire — commandes, réglages, raccourcis, fonctions, widgets — et comment appeler chacun.

Un module venu du STORE ou de ton vault démarre **coupé** : l'allumer
montre ce qu'il demande et ce que son code fait dont un module ne devrait pas avoir besoin
(\`plugin audit <id>\`). N'allume que ce en quoi tu as confiance — voir [[privacy]].
`,

    "ui.md": `# L'interface

## HOME
Des widgets sur une grille de 12 colonnes, plusieurs pages (\`[\` \`]\`).
Les **carrés raccourcis** sont tes **épingles** sur HOME : e puis a → *Raccourci*, ou
clic droit sur une note / un dossier → *Ajouter au HOME*, ou \`home link new\`. Un carré ouvre n'importe quoi en un clic — un
module, une note, un dossier, une page, une macro, n'importe quelle commande — et dit quoi sur sa
bande de couleur. Un carré **dossier** ouvre un petit navigateur dessous : entrée y entre,
← retour, → avance, n une note, d un dossier, suppr à la corbeille.

| Touche | Sur HOME |
|---|---|
| ←↑↓→ / Tab | choisir un widget |
| entrée | ouvrir sa fenêtre (plus grande, utilisable) |
| e | modifier : les flèches déplacent, maj+flèches redimensionnent (ou tire le coin **◢**), **a** ajoute, **x** retire |
| m | MODULES |

Les widgets restent **exactement là où tu les mets** — laisse des trous si tu veux. Fais glisser un
widget en mode modification : un fantôme suit la souris, l'endroit où il va atterrir s'affiche
en pointillés, il bouge quand tu lâches.
**Le même widget, plusieurs fois** : ajoute-le encore (a, ou clic droit → *un exemplaire de plus
de ce widget*). Chaque copie a ses propres réglages — deux horloges avec des cadrans
différents, deux widgets météo pour deux villes (c dans sa fenêtre), des horloges du monde avec
leurs propres villes.
Un **texte trop long** pour sa place défile tout seul quand la souris est dessus ou que
sa ligne est choisie — partout dans le deck.

## L'arbre (à gauche)
\`\`\`
VAULT              8
 + note   + dir
 ■■■■■■■■            ← étiquettes de couleur : clique sur une pour ne voir que celle-là
 ★ ✎ idées          ← épinglé (p épingle l'élément choisi)
 ▾ journal/      2
 ├─ 2026-11-17
 └─ 2026-11-18
 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄
 🗑 corbeille   3   ← la dernière ligne : la corbeille (la voir, remettre des choses)
 ▸ϟ projets/   ■ 3   ← une icône à toi, étiqueté cyan (le carré, à droite)
\`\`\`

**Clic droit sur n'importe quoi** (ou la touche menu, maj+F10) : ouvrir, renommer (F2),
dupliquer, épingler, copier le chemin ou un [[lien]], une **couleur** (rouge, orange, jaune,
vert, cyan, bleu, violet, rose — comme dans Ableton), une **icône**, la corbeille.
Dans le shell : \`tag notes/idees.md red\`, \`tag view red\`, \`icon projets ϟ\`.
Les étiquettes et les icônes vivent dans ton vault (.icebreaker/tags.json, icons.json).
**Maj + molette sur l'arbre** (ou **⇧↑ / ⇧↓** dans l'arbre) avance fichier par fichier (un
petit clic à chaque fois) et montre chaque fichier aussitôt dans un onglet d'aperçu que le suivant
remplace — ouvres-en un pour de bon (clic, entrée) et il reste. La molette seule
fait défiler l'arbre.
**Glisser-déposer** : fais glisser une note ou un dossier sur un autre dossier pour l'y déplacer
(sous la dernière ligne = la racine du vault ; \`mv\` fait pareil). Fais glisser des fichiers depuis
le Finder / l'Explorateur sur un dossier de l'arbre : ils y sont **copiés**
(les originaux restent où ils étaient ; jamais écrasés : « a copy.md »).
**Un clic sélectionne** une note (alors F2, Suppr / ⌘⌫, p agissent dessus), un **double-clic**
(ou entrée) l'ouvre ; un clic replie un dossier. **Quitte et reviens : tout est comme tu
l'as laissé** — les dossiers ouverts de l'arbre, tes onglets et leurs groupes, les cadres et leurs tailles,
l'arbre et le shell montrés ou cachés, l'onglet du shell, la page où tu étais, la fenêtre.

## Onglets, épingles, réglages
- Les onglets en haut : 1…9 (quand tu ne tapes pas) ou ⌘1…9 ; ⌘W, ⇧Échap ou un clic du milieu en ferme un et montre l'onglet d'avant. NEXUS, STORE, MODULES, les réglages et la corbeille s'ouvrent en onglets comme les autres. Les pages viennent d'abord, courtes, × quand tu les survoles ; tes documents (notes, le journal, un morceau) après un trait léger, avec ● quand ils ne sont pas enregistrés. Sur HOME sans rien à fermer, Échap ouvre le menu **◆ ICEBREAKER** (F10 partout).
- **La barre d'état** (en bas) est à toi : fais glisser un élément sur le côté, clic droit pour le déplacer, le cacher ou
  le grouper avec celui de sa gauche (\`statusbar join | alone <élément>\`). ◧ ▾ ◨ ▣ montrent et cachent
  l'arbre, le shell, le panneau — ▣ laisse la page seule.
- **Le log** à côté d'un shell large : **›** sur sa ligne le replie en onglet, fais glisser la ligne pour l'élargir
  (\`log width 40\`), *‹ à côté du shell* dans son onglet le remet.
- **Épingles** : une seule liste pour tout ce que tu gardes à un clic — notes, dossiers,
  modules, pages, macros, commandes. Elles s'affichent en haut de l'arbre et dans le
  widget *épinglés*, et *Ajouter au HOME* en met aussi une sur HOME en carré. Désépingle-la :
  son carré part aussi. \`pin projets --key ctrl+shift+p\`.
- **Réglages** (⌘,) : les catégories à gauche, les réglages à droite, tape pour chercher. Un réglage
  montre sa valeur à droite ; ses commandes (‹ ›, ✎, ›) apparaissent sur la ligne où tu
  es. Un réglage changé a un **▎** à sa gauche : **suppr** le remet par défaut, et
  *↺ tout par défaut* (en bas à droite) remet toute la catégorie. Survole un
  réglage pour voir ce qu'il fait et la commande du shell qui fait la même chose.
  **Espace** agit sur la ligne où tu es (celle sous la souris, sinon celle choisie
  avec ↑↓) : il coche une case, tourne un ‹ choix ›, et met un curseur à 0 puis le remet
  où il était (couper / remettre le son ; sans 0, comme la luminosité : sa valeur par défaut et retour). Les curseurs avancent toujours **de 1 en 1** — fais glisser la poignée,
  appuie sur la barre, la molette ou ←→ ; maintenus, ils vont plus vite, toujours de 1 en 1. La **molette**
  (un glissement à deux doigts sur le trackpad aussi) déplace la ligne où tu es ; sur un curseur elle le fait
  avancer, de 1 en 1. Un champ avec une liste (Format des dates, un modèle…) l'ouvre avec ↓ ou ▾ — tous
  les choix, l'actuel choisi. Une ligne **grisée** dépend d'un autre réglage
  (les lignes de la voix quand la voix est coupée, Clé du vault sur un vault non chiffré…).
- **Réglages → CLAVIER** : chaque raccourci sur une page — clique sur ses touches pour les changer,
  clique sur sa touche **≡** pour changer sa touche dans LE MENU, suppr pour celle par défaut.
- **Réglages → NOTIFICATIONS** : une case chacune — à l'écran, le son, le centre de
  notifications (seulement quand le deck n'est pas devant, si tu veux), lu à voix haute.
- **Comptes** : chaque compte est son propre deck — ses réglages, son thème, ses
  sons, son vault, sa connexion Google. La **page de connexion** est l'entrée :
  ton nom et ton mot de passe, ou **+ nouveau compte** (un compte de ce deck l'approuve
  avec son nom et son mot de passe, puis tu choisis le nouveau nom et le mot de passe, et
  le setup se lance pour lui). Ton icône de profil n'apparaît qu'une fois le nom **et**
  le mot de passe justes — jamais juste parce qu'un nom existe. ⚙ TOI → *se déconnecter* (ou ⌘⇧L, \`lock\`) ramène la page
  de connexion ; \`account passwd\` change ton nom ou ton mot de passe, \`account delete\`
  supprime ton compte (tes notes restent).
- **Le setup** (LE MENU → *setup*) : les chapitres en haut, tes réponses écrites à
  gauche (clique sur une pour la changer). Un chiffre ou un clic choisit (un thème, et
  les effets d'EFFETS, s'affichent aussitôt sur tout le deck), entrée ou un second
  clic le garde ; tab passe (dans la question du dossier du vault, il complète le nom du
  dossier, comme un terminal), échap revient en arrière, ctrl+entrée termine. Le **mode furtif** s'applique
  dès que tu le choisis : plus rien en ligne n'est proposé après (pas de question d'IA, pas de position, pas de
  Google). En chiffrant le vault, un mauvais mot de passe redemande simplement. Après, une **visite guidée** :
  UPLINK (le même visage que son widget de HOME) montre chaque partie de l'écran tour à tour (→ suivant, ← retour, échap passe — il
  demande d'abord). \`tour\` la rejoue.
- **⌘Z annule la dernière chose que tu as faite** (ctrl+Z sous Windows / Linux), où que tu sois : un
  réglage, un thème, un widget déplacé ou redimensionné, un fichier envoyé à la corbeille, un
  renommage, une nouvelle note ou un dossier, une tâche, un rappel, une habitude cochée, un événement — aussi depuis la
  fenêtre d'un widget. ⌘⇧Z (ou ctrl+Y) la refait. Dans une note, ⌘Z
  annule d'abord ta frappe. \`undo list\` montre ce qui peut être annulé, \`undo 3\`
  reprend trois choses. **Désinstaller un module** s'annule aussi, mais seulement juste
  après (ses fichiers reviennent et il est rallumé) : une fois que tu as fait autre chose, le
  STORE le réinstalle.
- **✦ fx** (barre d'état, ou Réglages → APPARENCE → Effets) : un curseur par effet —
  **bloom** (une lueur douce autour de ce qui brille — le logo, l'onglet choisi, le texte
  d'accent — comme des tubes néon ; à 100 % un halo net de quelques lettres de large), les lignes de balayage, le vignettage, la **séparation RVB** (des
  franges rouges et bleues sur le texte, les cadres et les glyphes — jamais sur les fonds),
  la lueur (ce qui brille éclaire), la netteté, la **courbure** (le verre bombé d'un
  vieux tube : l'image gonfle, les lignes se courbent vers les bords ; coupée par défaut). 0 = coupé, jusqu'à 200 %.
  **Vitesse du scintillement** (Réglages) règle la vitesse du scintillement CRT (\`fx flicker 150\`).
  Ou un préréglage : **none · light · medium · heavy · party** (\`fx heavy\`). Chaque
  thème retient ses propres effets.
- **THEME STUDIO** (\`launch studio\`) : entrée sur une couleur ouvre une **palette** — 18
  teintes × 10 nuances à la saturation que tu choisis, des gris, les couleurs du thème ;
  les flèches ou la souris, tab pour la saturation et le champ #hex, entrée la garde.
  Un bouton changé montre **•** et, sur sa ligne, **↺** : retour à la valeur du thème.
- Barre d'état, à droite : **◧ ▾ ◨ ▣** — l'arbre, le shell, le panneau, et **la page
  seule** (tout le reste replié ; encore : tout revient, \`frame solo\`) ·
  **♪** coupe tout le son · **☾** l'économiseur d'écran (chaque thème a le sien : une ville néon,
  un ordinateur central des années 80, un sonar, la distorsion, une liseuse). **La barre se range comme tu veux** : fais glisser un
  élément sur le côté, clic droit pour le déplacer ou le cacher (\`statusbar\`, \`statusbar reset\`).
- **Bulles d'aide** : pose le pointeur sur n'importe quoi — une bulle dit ce que ça fait et la commande
  que ça lance ; elle part dès que tu bouges. Dans les Réglages, ce que fait un réglage est à
  droite de sa ligne.
- **QUAND ?** : partout où un jour ou une heure est demandé (une échéance, un rappel, un événement, un
  réveil, les jours d'une habitude), un petit calendrier et une horloge — les flèches, un clic, aujourd'hui / demain —
  ou tape-le comme toujours (« demain 9h », « +3d »). Un clic sur **la date et l'heure** en haut
  à droite ouvre un **mini calendrier** (les jours avec des événements ont un point).
- **SYSMON** montre aussi la carte graphique (son usage et sa mémoire quand le système les donne) ;
  **NEXUS** écrit sur chaque nœud ce qu'il est (dossier, note, pdf…) et, quand le pointeur se pose sur
  l'un d'eux, déplie une petite fenêtre de ce qu'il contient ; **CALENDAR → ⇣ import** lit un CSV ou un
  .ics (\`cal import\`) ; la fenêtre d'**UPLINK** règle son œil (au survol, partout, fermé),
  s'il parle et s'il cligne ; \`neofetch\` dessine la machine en HUD.
- **Lisible dans tous les thèmes** : le texte secondaire et les indications gardent assez de contraste quelles que soient
  les couleurs du thème (THEMES.md).
- **Ctrl + molette** change l'échelle de l'interface (sur tous les systèmes), comme ctrl+= / ctrl+-.
  **⇧ + molette** va à ce qui est sous le pointeur ; sur l'arbre elle fait avancer la sélection.
- **◨ panneau latéral** (barre d'état, ⌘⇧P, ou \`panel\`) : une colonne à droite dont les
  widgets restent visibles sur toutes les pages. Clique dessus : **a** ajoute un widget ; le bouton **✎ modifier** (en bas à droite) ou **⌘E / ctrl+E** le modifie.
  **Le mode modification est partagé** par HOME et le panneau (e sur l'un ou l'autre, échap le termine), et
  marche de la même façon : tab choisit un widget, les flèches le déplacent, **maj+flèches**
  l'agrandissent / le rapetissent, fais-le glisser pour le déplacer (entre HOME et le panneau aussi),
  tire le bord du bas d'un widget du panneau pour le redimensionner, x le retire. Une bande en travers de
  HOME et du panneau dit que tu modifies (**✓ fini** termine).
  Les widgets du panneau restent **là où tu les mets**, trous compris (rien ne remonte
  pour boucher un trou) ; plus haut que la fenêtre, il **défile** (molette). Quand tu fais glisser un
  widget sur le panneau, **une ligne montre où il va atterrir** — entre deux
  widgets, ceux du dessous descendent pour faire de la place. Un ⌘Z annule le déplacement. Aller à une autre
  page termine le mode modification.
- **Des horloges de toutes les tailles** : chaque style d'horloge (numérique, segments, binaire, points,
  analogique, minimal…) a une version minuscule, petite, moyenne, grande et énorme — fais le
  widget aussi petit que tu veux, il reste dans le style choisi.
- **MOON** a sa propre page (\`moon open\`, ou le widget MOON) : la lune comme elle est
  ce soir, dessinée et éclairée du bon côté, sa phase, les quatre prochaines phases, et le
  mois en calendrier de lunes. ←→ un jour, ↑↓ une semaine, **t** aujourd'hui. Tout est calculé sur ton
  ordinateur, sans réseau.
- **Actus** : chaque widget d'actus répond à une question, *qu'est-ce que je montre ?* — **ta région**,
  les grands titres de **ton pays**, des **catégories** que tu coches (science, IA, monde…) ou **tes
  propres mots** (« formule 1 »). Son en-tête le dit toujours (◉ Paris, ◉ science · IA) ; un clic
  dessus le change. **À la une** : un article, en grand, avec son résumé (↻ un autre). La
  **page NEWS** (\`news page\`) a les mêmes quatre en onglets, l'article lu à droite.
  \`news show science ai\`, \`news show formula 1\`, \`news mode featured\`.
- **Cadres** : l'arbre, la page, le panneau latéral et le shell peuvent aller n'importe où — dans
  **ibsh** (le shell du deck : ton vrai terminal et les modules ne peuvent pas réorganiser l'écran) :
  \`layout preset classic | shell-right | panel-left | tree-bottom\`, \`frame move shell
  top\`, fais glisser la bordure entre deux cadres pour redimensionner, \`frame fold tree\` en replie un en
  bande (un clic l'ouvre), \`layout reset\` ; **⌘Z / Ctrl+Z** annule. **Groupes d'onglets** : dépose un onglet sur
  un autre (\`▣ nom 3\` ; le survol les liste, le clic droit renomme ou dégroupe).
- **Réveils** : \`clock alarm 7:30 debout --days mon-fri\`, \`clock alarm\` les
  liste, \`clock alarm rm 1\` · \`on\` · \`off\` · \`snooze\` (dans ibsh ; ton vrai terminal peut en
  régler un, rien d'autre) ; **a** sur la page CLOCKS. Un écran
  entier sonne (s répète dans 5 min, entrée arrête ; le B / A de la manette), avec le son et une
  notification — tant qu'ICEBREAKER tourne. \`clock alarm test\` l'essaie.
- **◆ icebreaker ▾** (le coin gauche de la rangée du haut, le bouton teinté, F10 ; **◆ ▾** dans une fenêtre étroite) : le menu du deck —
  modules, store, nexus, réglages, aide d'abord (chacun s'ouvre en onglet), puis quoi de neuf,
  mises à jour, et **⏻ se déconnecter** (retour à la page de connexion, ⌘⇧L / Ctrl+Shift+L). Il n'y a pas de barre
  de menus : la rangée du haut, ce sont les onglets des cadres, avec uplink et l'horloge dans son coin droit.
- **Quoi de neuf** : après chaque mise à jour, une petite page s'ouvre une fois — la version en grand,
  ce qui est nouveau, ce qui est corrigé. Pour la revoir : \`changelog\`, Réglages → MISES À JOUR →
  *Quoi de neuf*, ou LE MENU ; ← → pour les versions d'avant.
- **Les onglets** sont posés sur leur cadre (celui de la page, celui du shell ; VAULT et PANEL en ont
  un chacun). Ils sont larges quand il y en a peu et rétrécissent quand tu en ouvres plus ; quand
  ils ne tiennent plus, **▾ +N** liste les autres. **⌂ HOME est épinglé** : toujours
  le premier onglet (⌘1 / Ctrl+1), impossible de le fermer par erreur. Une page du menu (STORE,
  réglages…) s'affiche en premier, allumée, avec × pour la fermer (ou échap). **Fais glisser un onglet sur un autre
  cadre** (celui de l'arbre, du panneau, du shell) pour l'y garder, à côté de l'onglet de ce cadre
  — ou clic droit → *Déplacer vers*, ou \`tab move 3 panel\` dans ibsh. Un clic sur l'onglet du cadre
  (VAULT, PANEL, un terminal) ramène son contenu.
- **PULSE** (un widget de HOME) : ce qui se passe dans tes modules, une ligne chacun —
  le prochain événement, les tâches à faire, le prochain rappel, la musique, le minuteur focus…
- **Ton icône de profil** : Réglages → TOI → icône de profil (ou \`avatar\`) : un petit
  visage en pixel art ou un glyphe, dans la couleur que tu aimes. Elle est sur l'écran de connexion
  et dans \`whoami\`.
- **Les sons** : Réglages → SON : le volume de tout, puis un **mélangeur** — un
  curseur chacun pour les déplacements, les notifications, le texte qui s'écrit tout seul,
  tes touches, le démarrage, et le son que les **modules** jouent eux-mêmes (un module
  autorisé — autorisation « audio » — montre ♪ son nom dans la barre d'état pendant qu'il
  joue : un clic, ou \`audio stop\`, le fait taire). Le curseur **Clavier** (à 0 par
  défaut : touches silencieuses) donne à ta frappe le son de touche du thème — un autre quand tu
  effaces — joué au moment où la touche descend.
- Une page qui **joue du clavier** (un piano, un tracker, un jeu) garde toutes les touches tant
  qu'elle est devant, alt + flèches aussi : **échap** ferme d'abord ce que la page a ouvert, puis
  rend les touches au deck (l'arbre ou le shell les prend), un clic sur la
  page les lui redonne. Dans la page d'un module, ⌘C ⌘X ⌘V ⌘A sont à la page.
- Un module peut **ouvrir un type de fichier** (BreakerMED : .bmed .mod .med) : double-clique dessus
  dans l'arbre, ou \`open songs/air.mod\`, et il s'ouvre dans ce module. Hors des
  dossiers que le module peut lire, on te demande d'abord (ce fichier seulement) ; deux modules pour
  un même type : tu choisis une fois (\`plugin open-with\` le montre et le change).
- **Les fenêtres de dialogue** : les réponses sont toujours **en bas à droite** — la sortie (Non, fermer) à
  gauche, la suite (Oui, ouvrir) à droite ; ← → choisissent, y / n répondent. Une
  question dont la réponse sûre est non (supprimer pour de bon…) commence sur Non.
- Rangée du haut : **UPLINK ■** — le carré est vert quand ton IA est là, ambre pendant
  qu'elle réfléchit, rouge quand elle est coupée (sa bulle dit quelle IA ; un clic l'ouvre).
- **Une petite fenêtre** : la barre d'état et les en-têtes de page laissent tomber d'abord ce qui sert
  le moins au lieu de se chevaucher ou de se couper.
- **Le texte qui s'écrit tout seul** — la visite, les notifications, les dialogues, le setup,
  les réponses d'UPLINK, la sortie du shell — avec un petit bip, comme un vieux RPG,
  jamais plus d'une seconde de retard. Réglages → APPARENCE → *Vitesse du texte* (50 par
  défaut ; 100 = d'un coup, un bip).
- **Les notes** : une barre d'outils en haut — enregistrer (● rouge quand ce n'est pas enregistré : l'onglet a un point rouge
  aussi, ⌘S ou un clic droit sur l'onglet enregistre), enregistrer sous, une nouvelle note, la note d'avant /
  d'après dans le dossier, annuler, refaire.
- **Une note changée ailleurs** (Obsidian, iCloud, un autre éditeur, l'IA) revient
  toute seule quand tu n'as pas de modifications non enregistrées. Avec des modifications, rien n'est écrasé :
  sa barre d'outils dit *changé sur le disque* — **Prendre celle du disque** (⌘Z ramène la tienne)
  ou **Garder la mienne**.
- **REMINDERS, TODO, HABITS sur HOME** : Suppr (⌘⌫) sur la ligne sous la souris
  la retire (une habitude demande d'abord), clic droit → **Modifier…** la change ; dans leur
  fenêtre, e modifie et Suppr retire la ligne choisie. Dans le shell : \`todo edit 3 "…"\`,
  \`remind edit 2 "…" ven 18h\`, \`habit edit 1 "…" --times 8\`.
- **TODO lit aussi tes notes** : chaque \`- [ ] …\` écrit dans une note s'affiche dans la page
  et le widget TODO, avec le nom de la note. La cocher là écrit \`- [x]\` dans la note,
  sur cette ligne même (si la ligne a changé depuis, il le dit et laisse la note tranquille) ;
  ⌘Z la décoche. Dans le shell : \`todo\` les liste comme \`notes/x.md:12\`, \`todo done
  notes/x.md:12\` en coche une. HABITS reste sa propre liste.
- **Un widget vers une autre page de HOME** : clic droit → *Déplacer vers la page*, ou en mode modification
  **[ ]** (il part, et tu pars avec lui), ou fais-le glisser sur un numéro de page en bas.
- **Plein écran** (F11, \`fullscreen\`) : tout l'écran, l'encoche d'un MacBook
  comprise — les rangées derrière la caméra deviennent une fine bande (le nom du deck, l'heure).
- **Le curseur** est une fine barre qui glisse de lettre en lettre (plus longue et plus douce
  quand il saute loin, une traîne légère derrière lui), s'éclaire un peu à chaque touche et
  respire au lieu de clignoter sèchement (*Réduire les animations* : il saute).
- **‹ valeur ›** (les réglages, le cadran d'une horloge…) : un clic sur la moitié gauche recule, sur
  la moitié droite avance.
- **Un rappel sans heure** est pour dans une heure (\`remind "thé"\`, ou entrée sur un
  « quand ? » vide).
- **Les heures, en français ou en anglais, partout** (rappels, \`todo add … --due\`, \`cal add\`) :
  \`+1h\`, \`1h\`, \`30min\`, \`19:00\`, \`19h\`, \`19h30\`, \`demain 9h\`, \`tomorrow 9am\`,
  \`ven 18h\`, \`fri 6pm\`, \`24/12 9:00\`, \`dans 1h\`, \`à 19h\`, \`ce soir\`. « 1h »… « 6h » seuls veulent dire
  « dans ce délai » ; avec un jour (« demain 6h »), ou à partir de 7h, une heure de la journée.
- **Des listes partout** : un champ qui demande une ville, un dossier, un modèle, une commande…
  propose une liste (▾) et complète avec Tab.
- **UPLINK** : chaque message dit qui l'a écrit — toi sur une bande teintée, UPLINK avec son
  modèle. Avant chaque conversation il lit sa **page de contexte** (\`context\` l'ouvre) :
  qui tu es, comment il doit te parler, comment ton vault est organisé — construite
  par le deck, sans IA — plus ce que tu ajoutes, et ce qu'il apprend. Un clic sur la case VOIX
  (en bas à droite) arrête la lecture. La voix lit une réponse pendant qu'elle
  s'écrit, phrase par phrase ; en japonais, UPLINK commence par une courte
  version parlée, lue aussitôt.
- **La voix** ne dit rien pendant que tu te connectes et que le deck charge : ses premiers mots sont
  le salut. Les alertes et les notifications sont lues pour ce qu'elles disent — jamais le
  nom de l'appli (« ICEBREAKER ») devant.
- **MODULES**, c'est la scène de NEXUS avec les modules dessus : chacun un éclat de sa couleur,
  avec son état ; ils s'allument l'un après l'autre quand la page s'ouvre. **Tape** simplement
  pour chercher (MODULES et NEXUS n'ont pas de raccourcis par lettre) : espace allume ou coupe un module,
  suppr le retire, entrée le lance. Même le **TERMINAL** est un module : coupe-le et
  le panneau du shell disparaît (les commandes se lancent encore depuis LE MENU, ce qu'elles demandent vient dans une
  fenêtre). Chaque module livré avec le deck est dans le **STORE** (tape pour chercher
  là aussi, suppr retire) : retires-en un, remets-le de là. **Mises à jour** : Réglages → MISES À JOUR (chaque jour, télécharger
  tout seul, installer tout seul ou demander d'abord) ou \`update\` dans le shell ; \`store update\` pour les
  modules. Un module qui en demande un autre (\`requires\`) le fait installer et allumer avec lui.
- **Texte fluide** : chaque lettre qui apparaît arrive en fondu — ce que tu tapes, le
  terminal, la discussion (Réglages → APPARENCE → *Texte fluide*).
- **Les réglages** ont des noms courts et habituels (Zoom, Taille du texte, V-Sync, Réduire les animations,
  Volume, Mélangeur…) ; ce que chacun fait s'affiche sous la liste pour la ligne où tu es
  ou sous la souris.
- **Les menus du clic droit** : des noms courts et habituels (Ouvrir, Renommer…, Dupliquer, Supprimer…) ;
  ce que fait une ligne s'affiche dans une bande sous le menu quand elle est choisie.
- **Les raccourcis ressortent** : chaque touche écrite dans l'interface (⌘⇧P, ctrl+K, F2,
  échap, les lettres des lignes d'aide) est posée sur une touche à elle. **Prends une
  manette** et elles deviennent ses boutons — A / ✕ / B pour entrée, B / ○ pour échap, Y / △
  pour ⌘K, la croix pour les flèches — sur une manette Xbox, PlayStation ou Nintendo ; une
  touche du clavier ramène les touches.
- **Sur un Mac sans touche Suppr** : ⌘⌫ fait ce que fait Suppr (mettre une note à la corbeille dans
  l'arbre, retirer un widget, un fichier dans le navigateur).
- **Les curseurs** ont tous le même aspect et la même façon de marcher : la barre, une poignée carrée, le nombre à
  droite (← → avancent, la molette aussi, double-clic sur le nombre pour le taper).
- Packs de sons : Réglages → SON → pack de sons — chaque thème garde le sien. Les packs faits
  de fichiers audio vont dans \`.icebreaker/sounds/packs/<nom>/\` (comment en faire un :
  \`starthere dev\`, puis FOR DEVELOPERS/sound-packs).
- **Le défilement** : les listes et les pages glissent un peu après la molette et s'arrêtent en
  haut et en bas.
- **Fluidité** (Réglages → APPARENCE) : la synchro verticale (suit ton écran,
  120 Hz compris) ou tes propres images par seconde (0-240 ; 0 = pas d'animations),
  la luminosité, et *Réduire les animations* pour les machines plus lentes.
`,

    "shell.md": `# Le shell

Deux shells vivent dans le panneau du bas (─ ou *▾ shell* dans la barre d'état le cache,
⌘\` le ramène) :

| Onglet | Quoi |
|---|---|
| **zsh** (bash, fish, powershell…) | ton vrai shell, à son nom, **plus** toutes les commandes d'ICEBREAKER, dans le dossier où tu es (**cmd** n'en a aucune : prends PowerShell ou ibsh). Les macros au-dessus sont dites à la façon de ce shell (\`ls -la\` est \`Get-ChildItem -Force\` dans PowerShell) |
| **ibsh** | le shell d'ICEBREAKER : il ne voit que le vault, \`rm\` va dans .trash. Ouvres-en plusieurs : chacun a son dossier et son historique ↑ |
| **+** (ctrl+shift+\`) | un nouvel onglet : **ibsh** (entrée), ou n'importe quel shell de cet ordinateur — zsh, bash, fish ; PowerShell, cmd, WSL sous Windows (\`term new bash\`, \`term shells\`). Clic droit sur un onglet : renommer, fermer. Les onglets reviennent comme tu les as laissés |
| **log** | à droite du shell quand il est large (un onglet quand il est étroit, ou avec \`log side off\`) : ce que tu as tapé et cliqué (avec la sortie), les erreurs (un code — E102… — et quoi faire : \`errors E102\`), les messages ; les pastilles du haut filtrent (\`log show errors\`) |

\`\`\`
◆ ~/notes ❯ todo add "livrer" --urgent --due ven
◆ ~/notes ❯ ls | grep idee
◆ ~/notes ❯ man todo          (chaque commande a son manuel : man <cmd>, <cmd> -h)
\`\`\`

- **Arrêter une commande** : ctrl+C sous Windows / Linux, **⌘X** sur un Mac (ou la vraie touche
  Contrôle + C) — dans ibsh ça arrête ce qui tourne ou la question posée (^C, l'invite
  revient) ; dans ton vrai terminal ⌘X envoie ctrl+C. Échap arrête aussi une question.
- **Tab** complète les commandes et les chemins ; un nom avec des espaces se met entre guillemets :
  \`cd STA\` + Tab → \`cd "START HERE/"\`.
- Une commande d'ICEBREAKER lancée dans ton vrai terminal dit ce qui n'a pas marché (en rouge) et
  rend son code de sortie : \`$?\` et le ✕ de l'invite montrent qu'elle a échoué.
- **\`exit\`** dans ibsh cache le shell, comme ctrl+\`. **\`quit\`** quitte ICEBREAKER, comme ⌘Q / Alt+F4 :
  les pages s'enregistrent, le vault se verrouille, une mise à jour en attente s'installe. Dans un script \`exit\` termine seulement le
  script ; dans ton vrai terminal \`exit\` est celui de ce shell (il ferme ce terminal).
- Chaque clic a sa commande : \`save\`, \`save as <chemin>\`, \`copy path\` / \`copy link\`, \`tree reveal\`,
  \`tab close others | right | all\`, \`modules on | off <id>\`, \`settings <catégorie>\`, \`setup\`.

## Commandes pratiques
| | |
|---|---|
| \`menu\` | LE MENU (\`menu add t "launch todo"\` : ⌘K t ⏎ la lance) |
| \`help\` · \`help all\` · \`help todo\` | les commandes pour commencer · toutes · celles d'un module |
| \`catalog function todo\` | ce que tu peux appeler — \`--json\` pour les scripts ; \`catalog api\` : chaque pièce de \`ib.ui\` / \`ib.lib\` |
| \`notify --alert "thé" "il est prêt"\` | t'appeler toi-même comme le fait un rappel |
| \`account\` · \`lock\` | sous quel compte tu es · se déconnecter (la page de connexion) |
| \`say "le thé est prêt"\` | la voix du deck le dit — la voix et la langue de Réglages → VOIX, comme UPLINK (muette quand le son est coupé ou la voix éteinte) |
| \`plugin audit <id>\` | ce que fait le code d'un module avant de lui faire confiance |

## Scripts (≡)
Des lignes de shell gardées dans \`.icebreaker/scripts/\`, lancées en un clic (≡, en haut à droite du
shell) ou avec \`script <nom>\`.
Les scripts \`.ibsh\` tournent dans le deck ; \`.sh .py .js .ps1\`… tournent dans ton terminal.
**Importe**-en un de n'importe où : ≡ → importer, ou \`script import "~/x.sh" travail\`.

\`\`\`
# matin.ibsh — une commande par ligne, # commentaires, les {blancs} sont demandés
todo ls --today
habit
news
\`\`\`

## En plus grand
□ (en haut à droite du shell) en fait un grand onglet après les autres (la page où tu
étais reste un onglet) ; \`term dock\` remet un terminal dans le panneau. Une page qu'une commande
tapée là ouvre (\`todo open\`, le \`new\` d'un module) arrive en onglet derrière lui : les
touches restent dans le shell (ctrl+tab y va).

## Copier ce qui est à l'écran
Fais glisser la souris sur la sortie d'ibsh (ou de ton vrai terminal) pour la sélectionner ; un double-clic
prend un mot, un triple-clic la ligne. ⌘C la copie (ctrl+C sous Windows / Linux —
sans rien de sélectionné, ctrl+C arrête toujours la commande). Clic droit → Copier aussi.

## La corbeille
\`rm\`, Suppr dans l'arbre et clic droit → corbeille déplacent les choses dans .trash (pas encore
supprimées). Une note envoyée là ferme ses onglets et quitte les épingles ; ⌘Z ramène
la note et ses épingles (pas l'onglet : rouvre-la). \`trash\` la liste, \`trash restore 2\` en remet une là où elle
vivait. La dernière ligne de l'arbre, *corbeille* (ou \`trash open\`), ouvre la page CORBEILLE : tout ce qu'elle
contient, le plus récent d'abord, avec l'endroit d'où ça vient — entrée le remet, r ailleurs,
o l'ouvre pour le lire. **Supprimer pour de bon** (suppr), ou *✕ vider la corbeille* en
haut : il demande d'abord et ça **ne s'annule pas** — pas de ⌘Z, pas de copie gardée
(\`trash purge 2\`, \`trash empty\`). Toi seul le peux : jamais un module, ni ton vrai terminal.

## Macros
Des boutons au-dessus de ton terminal qui tapent une commande : \`macro add deploy "git pull"\`.
Clic droit sur une → **Définir un raccourci…** : appuie sur les touches, vois ce qu'elles remplaceraient, OK.
Un raccourci peut faire plusieurs choses à la suite (+ une autre action). ◂ au bout de
la rangée cache les macros, ⌗ sur le shell (ou ⌘⇧K) les ramène
(\`macro hide\` / \`macro show\`).
`,

    "keys.md": `# Touches, souris, manette

**Tous les raccourcis, avec une recherche : ⌘/ (Ctrl+/).** La lettre dit ce qu'il fait
(H home, M modules, E explorer, U uplink, T l'arbre, P le panneau, S le shell, K les macros,
F les effets, L verrouiller). **Change n'importe lequel** dans **Réglages → CLAVIER** : clique sur ses touches,
appuie sur les nouvelles (il te dit ce qu'elles remplaceraient) ; sa colonne **≡** est sa touche
dans LE MENU ; suppr remet celle par défaut ; *↺ tout par défaut* les remet tous
(il demande d'abord). Sur la page RACCOURCIS : F2 et Suppr font pareil. Shell : \`keys list\`,
\`keys set panel ctrl+shift+b\`, \`keys reset all\`. Les tiens : \`bind ctrl+shift+1 "open notes/idees.md"\`.
Sur un Mac, ⌘ joue le rôle de Ctrl.

| Partout | |
|---|---|
| ⌘/ | les raccourcis |
| ⌘, | les réglages |
| ⌘⇧H · ⌘⇧M · ⌘⇧E | HOME · MODULES · NEXUS (explorer) |
| ⌘⇧U | UPLINK, la discussion avec l'IA |
| ⌘⇧T · ⌘⇧P · ⌃\` | l'arbre · le panneau latéral · le shell (⌃\` : la touche à gauche du 1, ² sur un AZERTY de PC) |
| ⌘K · ⇧⇧ | **LE MENU** : tape pour tout chercher, ou une touche + entrée (m ⏎ = MODULES). Maj deux fois marche partout, même en tapant |
| ⌘⇧K · ⌘⇧F | les macros · les effets |
| ⌘N · ⌘⇧N | nouvelle note · nouveau dossier |
| ⌘J | le journal, ouvert à aujourd'hui |
| ⌘⇧L | verrouiller (se déconnecter) |
| ⌘Z · ⌘⇧Z | annuler · refaire — la dernière chose faite (réglages, widgets, corbeille, renommages, nouvelles notes, tâches, rappels…) |
| ⌘⇧⌫ | la corbeille |
| ⇧Échap · ⌘W | fermer l'onglet |
| ⌥⌫ (ctrl+⌫ sous Windows / Linux) | effacer tout le mot d'avant — les notes et tous les champs de texte |
| 1…9 | aller à cet onglet (quand tu ne tapes pas) |
| Tab · F6 · ⇧F6 | l'élément suivant · la partie de l'écran suivante / précédente |

Chaque réglage peut revenir à sa valeur par défaut : un réglage changé a un **▎** à sa gauche,
**suppr** (ou ↺ sur sa ligne) le remet, et le bouton en bas à droite de chaque
catégorie les remet tous (\`config reset <clé>\`). Réglages → CLAVIER : chaque raccourci
et sa touche dans LE MENU, changés d'un clic.

| Souris | |
|---|---|
| clic | le fait — et le **log** du shell montre la commande |
| double-clic | ouvrir (dans l'arbre aussi : un clic sélectionne, un clic replie un dossier) |
| glisser · double · triple-clic | sélectionner du texte dans une note, ibsh ou le terminal (un mot, une ligne) — ⌘C copie |
| boutons précédent / suivant | comme un navigateur : la note que cet onglet montrait avant / après (ouverte sur place depuis l'arbre) |
| glissement à deux doigts → ← (trackpad) | pareil, après / avant |
| ⇧ + précédent / suivant, ⇧ + glissement | l'onglet d'avant / d'après |
| double-clic · clic du milieu · ⇧ clic (arbre) | ouvrir la note ici, à la place de la note de cet onglet · dans un nouvel onglet |
| pincer · ctrl+molette | interface plus grande / plus petite |
| clic droit | un menu pour ce qui est dessous : notes, dossiers, onglets, widgets, cartes, le shell, l'éditeur (copier, coller…) |
| survol | la commande et le raccourci |

| Manette | |
|---|---|
| croix / stick | se déplacer |
| A · B | valider · retour |
| Y · X | LE MENU · le clavier à l'écran |
| LB · RB | les onglets (une pression) |
| RB maintenu | **LE MENU** : le stick choisit, lâche pour lancer (ou la croix et A) |

Pendant que tu utilises la manette, les raccourcis écrits à l'écran montrent ses boutons (ceux qu'elle
a) : pas besoin de traduire ⏎ en A.

Tout peut aller dans LE MENU : clic droit sur une note, un dossier, un module ou une macro →
*Ajouter au MENU…* et appuie sur la touche que tu veux, ou \`menu add t "launch todo"\`.
`,

    "ai.md": `# L'IA, comme assistant de travail

Facultative. ICEBREAKER marche entièrement sans elle ; avec elle, c'est un collègue qui a
lu tes notes quand tu le lui demandes. Choisis-en une dans ⚙ UPLINK (IA) : Claude Code
(ton abonnement Claude), une clé d'API, ou **Ollama** (un modèle sur cette machine, rien
n'en sort). Le mode furtif la coupe entièrement.

## Où elle est
| | |
|---|---|
| **UPLINK** (⌘⇧U) | une discussion, aussi longue que tu veux — plusieurs à la fois en onglets (ctrl+T une nouvelle, ctrl+[ ctrl+] pour passer de l'une à l'autre, ctrl+shift+W ou un clic droit sur un onglet pour la fermer) |
| le widget **chat** | une question rapide depuis HOME |
| \`ask\` dans le shell | une question, et tu peux lui envoyer n'importe quoi par un tube |

## Écrire
\`\`\`
ask "un mail poli pour décliner la réunion de vendredi" > notes/reponse.md
cat notes/brouillon.md | ask "plus court, garde mon ton" > notes/brouillon-v2.md
\`\`\`

## Trier et résumer
\`\`\`
cat notes/boite/*.md | ask "regroupe-les par sujet, une ligne chacun"
journal ls | ask "qu'est-ce que j'ai repoussé sans arrêt ce mois-ci ?"
grep -r "TODO" notes | ask "lesquels sont vraiment urgents ?"
\`\`\`

## Planifier, puis le rendre réel
Demande un plan, puis change toi-même en tâches les lignes que tu gardes — c'est toi
qui décides :
\`\`\`
ask "découpe 'déménager' en étapes d'une heure ou moins"
todo add "appeler les déménageurs" --due ven
todo add "emballer les livres" --every sat --cycles 3
\`\`\`

## Bonnes habitudes
- Donne-lui le texte (\`cat … |\`) : elle ne voit que ce que tu envoies.
- Demande un format : « un tableau », « des puces », « une ligne chacun ».
- Garde ce qui sert dans une note (\`> notes/x.md\`) : la réponse devient la tienne.
- La voix : ⚙ VOIX → lire à voix haute les réponses d'UPLINK.
`,

    "privacy.md": `# Vie privée

- Tes notes sont de **simples fichiers Markdown** dans ce dossier, sauf si tu le chiffres
  (plus bas). Pas de cloud, pas de compte en ligne.
- Ce qui va en ligne, et seulement quand tu t'en sers : l'IA que tu as choisie (ou aucune — ou
  un modèle local avec Ollama), la météo (open-meteo.com), les actus, Google
  Agenda si tu le connectes, GitHub quand tu installes depuis le STORE (ou la
  voix, ou le pack d'encodeurs : \`encoders install\`, pour les modules qui exportent en MP3,
  M4A, OGG ou Opus).
- **Ce que reçoit l'IA** : tes messages, les notes que toi ou elle choisissez, et sa
  **page de contexte** (\`context\` l'ouvre) : ton profil, les noms de tes dossiers,
  les notes récentes et les épingles, les modules allumés. Avec Ollama, rien de tout ça ne quitte
  la machine.
- **Mode furtif** (⚙ VIE PRIVÉE, ou \`stealth\`) : rien ne quitte la machine. Rien du tout.
- **Comptes** : chaque compte a un mot de passe (haché avec Argon2id, jamais
  stocké). Avant que tu te connectes, rien de personne n'est chargé : pas de vault, pas de
  réglages, pas de module. Un nouveau compte doit être approuvé par un compte existant.
- Un compte **verrouille l'appli**. Son vault peut aussi être **chiffré** : \`vault encrypt\`
  (d'abord une sauvegarde zip en clair à côté du vault, chaque fichier vérifié ; à la fin il propose
  de supprimer ce zip — tes notes en clair ; plus tard : \`vault wipe-backup\`, et les copies dans
  Time Machine, iCloud ou la Corbeille sont à toi de les supprimer). Ensuite ce dossier
  ne contient que du bruit — pas de note, pas de nom — et ton mot de passe l'ouvre à la connexion ; ICEBREAKER
  et ibsh marchent comme toujours, ton vrai terminal, Obsidian et git voient du bruit.
  \`vault export <dossier>\` : une copie en clair. \`vault decrypt\` : retour aux fichiers en clair.
  Il donne une **clé de secours** : 24 mots, montrés une fois — écris-les sur papier. Mot de passe
  oublié ? Page de connexion → *mot de passe oublié ?*. \`vault recovery\` : une nouvelle. \`vault rekey\` (Réglages → VIE PRIVÉE → Clé du vault) : une nouvelle clé pour tout le vault, tout chiffré à nouveau — si une vieille copie peut être entre les mains de quelqu'un.
  C'est une option (Réglages → VIE PRIVÉE), dans les deux sens, aussi souvent que tu veux.
  Trois choses : la **clé du vault** chiffre les fichiers (tu ne la vois jamais) ; ton **mot de passe**
  et la **clé de secours** sont deux portes vers elle. Tapées dans le shell, ces commandes restent dans
  le shell ; depuis les Réglages ou LE MENU, chaque étape est une fenêtre.
- **Ton vault emporte ton compte** (son nom, un hachage du mot de passe, tes
  réglages) : sur un autre ordinateur ou depuis une clé USB, page de connexion → *ouvrir un vault*
  (*parcourir* choisit le dossier). Le déplacer : Réglages → VAULT → *Déplacer le vault*.
  Un vault chiffré emporte tout. Un vault non chiffré est un dossier
  où n'importe qui y ayant accès peut écrire : il n'apporte jamais de mot de passe, tes touches, macros,
  épingles ni ta liste de modules, et ses autres réglages seulement après ton oui.
- **Les modules ne peuvent pas toucher au chiffrement**, ni aux fichiers de ton compte dans le vault.
  Non chiffré, n'importe qui pouvant ouvrir ce dossier sur ton disque peut lire tes notes.
- **Se déconnecter** (⌘⇧L) : retour à la page de connexion.
- **Notifications** (⚙ NOTIFICATIONS) : à l'écran, le son, le centre de notifications
  de ton système, lu à voix haute — une case chacune.
- **Le vault est un mur** : le deck ne lit et n'écrit qu'à l'intérieur — aucun chemin,
  aucun lien (symlink) ne mène dehors. Seul ton terminal atteint le reste de
  l'ordinateur, avec tes propres droits.
- **Les modules que tu installes** démarrent coupés. En allumer un montre ses
  autorisations et ce que son code fait dont un module ne devrait pas avoir besoin (\`plugin
  audit <id>\`). Ils tournent dans un **bac à sable** : seulement ce que leurs autorisations permettent —
  rien du deck, de la page, du côté natif ni du réseau. Un module ne
  tourne jamais avec plus que les autorisations que tu as approuvées, ni avec un autre code : si une
  mise à jour en demande plus, ou si son code a changé sans toi, il reste coupé jusqu'à ce que tu
  le rallumes (\`plugin reload\` approuve le code d'un module que tu écris). Ce qu'un module te demande porte
  son nom en tête.
- **Les autorisations, en mots simples** — pas de surprise : ce qu'un module peut atteindre a un nom
  que tu peux lire (*Lire tes notes*, *Modifier tes notes* — tout le vault ou un
  dossier —, *Utiliser ton IA*, *Jouer du son*, *Aller en ligne* vers un site nommé, *Taper dans ton
  vrai terminal*…) et un niveau. Les plus risquées sont **redemandées la première fois
  qu'elles servent vraiment** (non · cette fois — ce fichier seulement — · toujours), et chaque
  commande pour ton vrai terminal est montrée d'abord, en entier. **Réglages → AUTORISATIONS** liste chaque module avec chaque
  autorisation, son niveau et sa dernière utilisation : entrée en retire une ou la redonne,
  le module continue de tourner. Dans le shell : \`plugin info <module>\` (son état et pourquoi), \`plugin perms\`, \`plugin revoke todo
  vault:write\`, \`plugin grant todo vault:write\`. Une mise à jour qui demande plus
  attend ton oui : dis non et tu gardes la version que tu as.
- **Le journal des accès** : qui a utilisé quelle autorisation, quand, sur quoi — un module, l'IA,
  ton vrai terminal. Des noms seulement (le chemin d'une note, un site), 30 jours, sur cet
  ordinateur seulement. Le filtre **◈ accès** du log, ou \`plugin perms <module>\`.
- **Ce que l'IA peut lire** (Réglages → AUTORISATIONS) : rien · ce que tu lui donnes — une
  note que tu nommes dans ton message (« résume idées »), que tu lui envoies par un tube ou que tu as devant toi ·
  tout ton vault. L'horloge, en haut à droite, dit **◈ …** (la note) pendant qu'elle lit. Écrire une
  note demande toujours.
- **Ton vrai terminal** (Réglages → AUTORISATIONS) : ce qu'un programme que tu lances là peut
  demander au deck — rien · tes notes seulement · les notes, les minuteurs et les réveils. Ce que toi seul
  peux faire se tape toujours dans ibsh.
`,
  };
}
