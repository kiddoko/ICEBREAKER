/**
 * Starter content: written into a brand-new (empty) vault on first launch,
 * and used as the whole vault in browser mode.
 */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

export const WELCOME_NOTE = `# Welcome to ICEBREAKER

You just jacked into your deck. Everything here is a plain **Markdown** file
in your vault — open it with Obsidian, vim, anything. Nothing is locked in.

> **⚠ Test software.** ICEBREAKER is a hobby project, never audited, not ready for heavy,
> secure or professional use. **Store nothing sensitive here** (encrypted vault or not) and
> **back up this folder regularly**. Bugs, ideas, modules and themes are welcome:
> github.com/kiddoko/ICEBREAKER. More in **START HERE/README**.

## First moves
- **⌘K** (or shift twice) opens THE MENU — everything is in there
- **⌘Z** undoes anything; \`tour\` in the shell shows you around
- **⌘N** writes a new note, **⌘J** opens today's journal entry
- **⌃\`** shows or hides the shell — the key left of 1: \` on a QWERTY keyboard, ² on a
  PC's AZERTY (or click **▾** in the status bar)
- **F1** opens the manual; **START HERE/** in the tree is the guide

## The shell is real-ish
Try these in the shell panel:

\`\`\`sh
ls -la
tree
grep -i ice *.md
journal "jacked in for the first time"
cat Welcome.md | ask "summarize this in one line"
neofetch
\`\`\`

## Links and tags
Notes link with [[wikilinks]] like [[START HERE/README]] and get tags like #getting-started.
**⌘Enter** on a link follows it.

- [ ] write a first journal entry
- [ ] set your handle: \`config set user.handle <you>\`
- [ ] try another theme: \`theme set amber\`
`;

/** The same note for an account in French (a new vault is seeded in its account's language). */
export const WELCOME_NOTE_FR = `# Bienvenue dans ICEBREAKER

Tu viens de te brancher sur ton deck. Tout ici est un simple fichier **Markdown**
dans ton vault — ouvre-le avec Obsidian, vim, n'importe quoi. Rien n'est enfermé.

> **⚠ Logiciel de test.** ICEBREAKER est un projet de loisir, jamais audité, pas prêt pour un usage
> intensif, sécurisé ou professionnel. **N'y mets rien de sensible** (vault chiffré ou non) et
> **sauvegarde ce dossier régulièrement**. Bugs, idées, modules et thèmes bienvenus :
> github.com/kiddoko/ICEBREAKER. Plus dans **START HERE/README**.

## Premiers gestes
- **⌘K** (ou maj deux fois) ouvre LE MENU — tout est dedans
- **⌘Z** annule n'importe quoi ; \`tour\` dans le shell te fait visiter
- **⌘N** écrit une nouvelle note, **⌘J** ouvre l'entrée du journal du jour
- **⌃\`** montre ou cache le shell — la touche à gauche du 1 : ² sur un clavier AZERTY de PC,
  \` sur un QWERTY (ou un clic sur **▾** dans la barre d'état)
- **F1** ouvre le manuel ; **START HERE/** dans l'arbre est le guide

## Le shell est presque vrai
Essaie ceci dans le panneau du shell :

\`\`\`sh
ls -la
tree
grep -i ice *.md
journal "branché pour la première fois"
cat Bienvenue.md | ask "résume ça en une ligne"
neofetch
\`\`\`

## Liens et étiquettes
Les notes se lient avec des [[wikiliens]] comme [[START HERE/README]] et ont des étiquettes comme #premiers-pas.
**⌘Entrée** sur un lien le suit.

- [ ] écrire une première entrée de journal
- [ ] choisir ton nom : \`config set user.handle <toi>\`
- [ ] essayer un autre thème : \`theme set amber\`
`;

export function demoVault(): Record<string, string> {
  return {
    "Welcome.md": WELCOME_NOTE,
    "notes/ideas.md": `# Ideas

- a plugin that turns my journal into a weekly zine #idea
- learn enough Japanese to read street signs in Shinjuku #japanese
- [[notes/reading-list]] needs pruning

> The street finds its own uses for things.
`,
    "notes/reading-list.md": `# Reading list

- [x] Neuromancer
- [ ] Count Zero
- [ ] Mona Lisa Overdrive
- [ ] Snow Crash
`,
    [`journal/${iso(daysAgo(2))}.md`]: `---
date: ${iso(daysAgo(2))}
tags: [journal]
---
# ${iso(daysAgo(2))}

## log
- set up the deck
- wrote a theme draft #theming
`,
    [`journal/${iso(daysAgo(1))}.md`]: `---
date: ${iso(daysAgo(1))}
tags: [journal]
---
# ${iso(daysAgo(1))}

## log
- 45 min of Japanese #japanese
- [ ] finish the reading list review
`,
  };
}
