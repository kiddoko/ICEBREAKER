import { fmt } from "../../core/ansi";
import { ICON_CHOICES, isTagColor, TAG_COLORS, TAG_NAMES, type TagColor } from "../../vault/marks";
import type { Command } from "../types";

/** A coloured ● for the terminal (24-bit colour). */
function dot(c: TagColor, ch = "●"): string {
  const h = TAG_COLORS[c].slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `\x1b[38;2;${r};${g};${b}m${ch}\x1b[39m`;
}

export const tagCommand: Command = {
  name: "tag",
  summary: "colour tags on files and folders (red, orange, yellow, green, cyan, blue, purple, pink)",
  usage: "tag                        every tag, by colour\ntag <path> <colour>        tag it\ntag rm <path>              untag it\ntag ls <colour>            everything of that colour\ntag view <colour…> | off  the tree shows those colours (+red adds / takes out one)",
  man: "Colours: " + TAG_NAMES.join(", ") + ".\nThe colour shows on the icon in the tree (VAULT). Click a dot above the tree to see one colour only.\nStored in the vault, in .icebreaker/tags.json: they travel with it. Renames carry them; the trash drops them.\nRight-click on a file or folder → colour does the same.",
  examples: [
    ["tag notes/ideas.md red", "a red note"],
    ["tag projects cyan", "a cyan folder"],
    ["tag ls red", "everything red"],
    ["tag view red", "the tree shows the red things only"],
  ],
  complete: () => ["rm", "ls", "view", ...TAG_NAMES],
  async run(ctx) {
    const d = ctx.deck;
    await d.marks.load();
    const [a, b] = ctx.args;
    if (!a) {
      const counts = d.marks.counts();
      if (!Object.values(counts).some(Boolean)) return ctx.out(fmt.dim("no tags yet — tag notes/ideas.md red, or right-click → colour\n")), 0;
      for (const c of TAG_NAMES) {
        if (!counts[c]) continue;
        ctx.out(`${dot(c)} ${fmt.bold(c)}\n`);
        for (const p of d.marks.tagged(c)) ctx.out(`   ${p}${d.vault.isDir(p) ? "/" : ""}\n`);
      }
      return 0;
    }
    if (a === "ls") {
      if (!b || !isTagColor(b)) return ctx.err(`usage: tag ls <colour>   (${TAG_NAMES.join(", ")})\n`), 1;
      for (const p of d.marks.tagged(b)) ctx.out(`${p}${d.vault.isDir(p) ? "/" : ""}\n`);
      return 0;
    }
    if (a === "view") {
      // tag view red blue (those) · tag view +red (add / take out one) · tag view off
      const sb = d.workspace.sidebar;
      const words = ctx.args.slice(1);
      if (!words.length || words[0] === "off") return sb.setFilter([]), ctx.out(fmt.dim("the tree shows everything\n")), 0;
      const bad = words.find((w) => !isTagColor(w.replace(/^\+/, "")));
      if (bad) return ctx.err(`tag view: "${bad}" isn't a colour (${TAG_NAMES.join(", ")})\n`), 1;
      const next = new Set(words.some((w) => w.startsWith("+")) ? sb.colours : []);
      for (const w of words) {
        const c = w.replace(/^\+/, "") as TagColor;
        if (w.startsWith("+") && next.has(c)) next.delete(c);
        else next.add(c);
      }
      sb.setFilter([...next]);
      ctx.out(next.size ? `the tree shows ${[...next].join(", ")} — tag view off\n` : fmt.dim("the tree shows everything\n"));
      return 0;
    }
    if (a === "rm") {
      if (!b) return ctx.err("usage: tag rm <path>\n"), 1;
      await d.marks.setTag(ctx.resolve(b), null);
      return 0;
    }
    if (!b) {
      const c = d.marks.tagOf(ctx.resolve(a));
      ctx.out(c ? `${dot(c)} ${c}\n` : fmt.dim("no colour\n"));
      return 0;
    }
    const p = ctx.resolve(a);
    if (!d.vault.find(p) && !d.vault.isDir(p)) return ctx.err(`tag: ${a}: not found\n`), 1;
    if (b === "none" || b === "off") return void (await d.marks.setTag(p, null)), 0;
    if (!isTagColor(b)) return ctx.err(`tag: "${b}" isn't a colour (${TAG_NAMES.join(", ")})\n`), 1;
    await d.marks.setTag(p, b);
    ctx.out(`${dot(b)} ${p}\n`);
    return 0;
  },
};

export const iconCommand: Command = {
  name: "icon",
  summary: "a custom icon (one character) for a file or folder in the tree",
  usage: "icon <path> <glyph>   set it (★ ♥ ⚡ λ… any single character)\nicon rm <path>        back to the default icon\nicon ls               every custom icon\nicon glyphs           some ideas",
  man: "Default icons follow the file type: ∿ python, ʝ javascript/typescript, ❯ scripts, λ other code, ⚙ config, ▥ tables, ▣ images, ♪ audio, ▶ video, ▤ pdf, ▦ archives.\nStored in the vault, in .icebreaker/icons.json. Right-click → icon does the same.",
  examples: [
    ["icon notes/ideas.md ★", "a star"],
    ["icon projects ⚡", "a folder with a lightning bolt"],
    ["icon rm projects", "the default one again"],
  ],
  complete: () => ["rm", "ls", "glyphs"],
  async run(ctx) {
    const d = ctx.deck;
    await d.marks.load();
    const [a, b] = ctx.args;
    if (!a || a === "ls") {
      const all = Object.entries(d.marks.icons);
      if (!all.length) return ctx.out(fmt.dim("no custom icons — icon notes/ideas.md ★, or right-click → icon\n")), 0;
      for (const [p, g] of all) ctx.out(`${g}  ${p}${d.vault.isDir(p) ? "/" : ""}\n`);
      return 0;
    }
    if (a === "glyphs") return ctx.out(ICON_CHOICES.join(" ") + "\n"), 0;
    if (a === "rm") {
      if (!b) return ctx.err("usage: icon rm <path>\n"), 1;
      await d.marks.setIcon(ctx.resolve(b), null);
      return 0;
    }
    const p = ctx.resolve(a);
    if (!d.vault.find(p) && !d.vault.isDir(p)) return ctx.err(`icon: ${a}: not found\n`), 1;
    if (!b) return ctx.out(`${d.marks.iconOf(p) ?? fmt.dim("default")}\n`), 0;
    await d.marks.setIcon(p, b);
    ctx.out(`${[...b][0]}  ${p}\n`);
    return 0;
  },
};
