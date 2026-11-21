/**
 * WHAT'S NEW: the short notes the deck shows once after an update
 * (workspace/whatsnew.ts), and again with `changelog` or Settings → UPDATES.
 *
 * Bundled with the app — not in the vault, not in the tree. Newest first.
 * Plain words for people, not developers: what they can now do ("New") and what
 * works better ("Fixed"), 3–8 lines each, one line each (about 70 characters at
 * most). The full story stays in CHANGELOG.md.
 *
 * A minor version (0.6.0, 0.7.0) gets the big "release" layout: give it a
 * `headline` (one line that sums the version up) — workspace/whatsnew.ts.
 *
 * To add a version: copy the first entry, change the version, write both
 * languages. `date` is left out until the release is out (then YYYY-MM-DD).
 */
export interface NotesText {
  /** what you can now do */
  added: string[];
  /** what works better */
  fixed: string[];
  /** a minor version's one-line summary, shown big */
  headline?: string;
}

export interface VersionNotes {
  version: string;
  /** YYYY-MM-DD; none while it isn't released */
  date?: string;
  en: NotesText;
  fr: NotesText;
}

export const NOTES: VersionNotes[] = [
  {
    version: "0.5.5",
    date: "2026-11-21",
    en: {
      added: [
        "CRT curvature now really bends the picture, like the glass of a tube",
        "Clicks follow the curve: they land on the letter you see",
        "Modules can export MP3, M4A, OGG and Opus (`encoders install`)",
      ],
      fixed: [
        "The chat widget takes your typing: just type, the chat opens with it",
        "A click on the chat widget's “type here” line opens the chat",
        "With the curve on, CRT lines, glow and colour fringes bend with it",
      ],
    },
    fr: {
      added: [
        "La courbure CRT courbe vraiment l'image, comme le verre d'un tube",
        "Les clics suivent la courbe : ils tombent sur la lettre que tu vois",
        "Les modules exportent en MP3, M4A, OGG et Opus (`encoders install`)",
      ],
      fixed: [
        "Le widget de conversation prend la frappe : tape, le chat s'ouvre avec",
        "Un clic sur la ligne « écris ici » du widget ouvre le chat",
        "Courbure active : lignes CRT, glow et franges couleur se courbent aussi",
      ],
    },
  },
  {
    version: "0.5.4",
    date: "2026-11-21",
    en: {
      added: [
        "Modules can play sound — with their own fader in Settings → SOUND",
        "Modules can read and write files of any kind (songs, images…)",
        "Pages that play the keyboard: a piano gets every key, esc gives them back",
        "Dialogs: the answers always bottom right — No on the left, Yes on the right",
        "UPLINK ■ in the top bar: green ready, amber thinking, red off",
        "Gamepad buttons drawn in pixel art for your kind of pad",
        "This screen, once after each update (and Settings → UPDATES)",
      ],
      fixed: [
        "Small windows: nothing overlaps or gets cut, the least useful goes first",
        "NEWS: an “à la une” header, no glued words, cut summaries end with …",
        "The effects panel's descriptions never cover the presets' names",
        "Updates: a failed install keeps the download and can try again",
      ],
    },
    fr: {
      added: [
        "Les modules peuvent jouer du son — avec leur curseur dans Réglages → SON",
        "Les modules lisent et écrivent tout type de fichier (morceaux, images…)",
        "Pages qui jouent du clavier : un piano a toutes les touches, échap les rend",
        "Fenêtres : les réponses toujours en bas à droite — Non à gauche, Oui à droite",
        "UPLINK ■ dans la barre du haut : vert prêt, orange réfléchit, rouge éteint",
        "Les boutons de manette dessinés en pixel art pour ton type de manette",
        "Cet écran, une fois après chaque mise à jour (et Réglages → MISES À JOUR)",
      ],
      fixed: [
        "Petites fenêtres : plus rien ne se chevauche ni n'est coupé",
        "NEWS : en-tête « à la une », plus de mots collés, résumés coupés avec …",
        "Les descriptions du panneau d'effets ne cachent plus le nom des préréglages",
        "Mises à jour : une installation ratée garde le fichier et peut réessayer",
      ],
    },
  },
  {
    version: "0.5.3",
    date: "2026-11-21",
    en: {
      added: [
        "Select and copy text in ibsh: drag, double-click, triple-click, then ⌘C",
        "TRASH: delete for good (it asks first), or empty the whole trash",
        "THEME STUDIO: a colour palette, and ↺ to put a value back",
        "Effects: CRT curvature and flicker speed",
        "⇧⌫ deletes the previous word · ⇧↑ ⇧↓ walk the tree file by file",
      ],
      fixed: [
        "RGB split only on text and frames, 3× cheaper; a cleaner bloom",
        "Settings follow the trackpad; sliders step one at a time",
        "Suggestion lists show every choice even when the field has text",
        "`say` speaks with the voice and language chosen in Settings",
        "NEWS headlines no longer stay scrambled; WEATHER tries again after an error",
      ],
    },
    fr: {
      added: [
        "Sélectionner et copier du texte dans ibsh : glisser, double-clic, ⌘C",
        "CORBEILLE : supprimer pour de bon (ça demande avant), ou tout vider",
        "THEME STUDIO : une palette de couleurs, et ↺ pour remettre une valeur",
        "Effets : la courbure CRT et la vitesse du scintillement",
        "⇧⌫ efface le mot d'avant · ⇧↑ ⇧↓ parcourent l'arbre fichier par fichier",
      ],
      fixed: [
        "Décalage RVB sur le texte seulement, 3× moins cher ; bloom plus propre",
        "Les réglages suivent le trackpad ; les curseurs avancent d'un cran",
        "Les listes de suggestions montrent tous les choix même si le champ est rempli",
        "`say` parle avec la voix et la langue choisies dans les Réglages",
        "Les titres NEWS ne restent plus brouillés ; WEATHER réessaie après une erreur",
      ],
    },
  },
  {
    version: "0.5.2",
    date: "2026-11-21",
    en: {
      added: [
        "`exit` quits ICEBREAKER, like ⌘Q",
        "One `journal` command: open today, or add a line without opening it",
        "TODO reads the - [ ] of your notes, and ticks them there",
        "⌘A selects the text of the search fields",
      ],
      fixed: [
        "self-destruct is gone: nothing in the deck deletes your vault for good",
        "Windows terminal: exit ends the tab; what you type at start isn't lost",
        "“Typographic” quotes work in ibsh; a quote left open says so",
        "`plugin reload` refreshes a module's open page",
        "Key hints read Ctrl on Windows and Linux",
      ],
    },
    fr: {
      added: [
        "`exit` quitte ICEBREAKER, comme ⌘Q",
        "Une seule commande `journal` : ouvrir aujourd'hui, ou y ajouter une ligne",
        "TODO lit les - [ ] de tes notes, et les coche dedans",
        "⌘A sélectionne le texte des champs de recherche",
      ],
      fixed: [
        "self-destruct n'existe plus : rien n'efface ton vault pour de bon",
        "Terminal Windows : exit ferme l'onglet ; rien de tapé au démarrage n'est perdu",
        "Guillemets « typographiques » acceptés dans ibsh ; un guillemet ouvert le dit",
        "`plugin reload` met à jour la page ouverte d'un module",
        "Les raccourcis s'écrivent Ctrl sur Windows et Linux",
      ],
    },
  },
];

/** The notes of a version, or undefined when it has none. */
export function notesFor(version: string): VersionNotes | undefined {
  return NOTES.find((n) => n.version === version);
}
