/**
 * THE DECK'S OWN ACTIONS on THE MENU (⌘K): what you find by searching
 * ("journal", "zoom", "effects"…). Modules add theirs with ib.palette.register;
 * the catalog lists them all (kind "action").
 */
import type { Deck } from "./deck";
import { applyFxPreset, FX_PRESET_NAMES, FX_PRESETS } from "./workspace/fxpanel";
import { scriptsMenu } from "./shell/commands/scripts";
import { pickFolder } from "./workspace/filebrowser";
import { q } from "./ui/ui";

export function registerCoreActions(deck: Deck): void {
  const act = (id: string, title: string, run: () => void, hint?: string, group = "deck") => deck.actions.register({ id, title, run, hint, group });
  act("journal.today", "Journal: today", () => void deck.openJournal(new Date()), "ctrl+j", "journal");
  act("journal.yesterday", "Journal: yesterday", () => void deck.openJournal(new Date(Date.now() - 86400_000)), undefined, "journal");
  act("note.new", "New note", () => void deck.newNote(), "ctrl+n", "notes");
  act("folder.new", "New folder", () => void deck.newFolder(), "ctrl+shift+n", "notes");
  act("scripts.menu", "Scripts… (run one of your saved shell scripts)", () => void scriptsMenu(deck), undefined, "shell");
  act("terminal.open", "Terminal in a tab", () => void deck.act("term open"), undefined, "shell");
  act("shortcuts.open", "Keyboard shortcuts (all, searchable)", () => void deck.openApp("shortcuts"), "ctrl+/", "deck");
  act("daily.log", "Daily log (end-of-day check-in)", () => void deck.shell.runLine("daily"), undefined, "journal");
  // what only the shell did until now (the rest of the shell's commands are shell tools: ls, cat, grep…)
  act("notes.checkboxes", "Open checkboxes in my notes (- [ ])", () => void deck.shell.runLine("checkboxes").then(() => deck.workspace.focusShell()), undefined, "notes");
  act("notes.find", "Find a file by name…", () => void deck.prompt("Find a file by name", { placeholder: "a part of its name" }).then((v) => v?.trim() && void deck.shell.runLine(`find ${v.trim()}`).then(() => deck.workspace.focusShell())), undefined, "notes");
  act("shell.history", "Shell history (what was typed)", () => void deck.shell.runLine("history").then(() => deck.workspace.focusShell()), undefined, "shell");
  act("deck.redo", "Redo (what undo took back)", () => void deck.act("redo"), "ctrl+shift+z", "deck");
  act("deck.lock", "Log out (lock the deck)", () => deck.lockNow(), undefined, "deck");
  act("setup.run", "Setup (first-run questionnaire)", () => void deck.openApp("setup"), undefined, "deck");
  act("tour.run", "Guided tour (UPLINK shows you around)", () => void deck.act("tour"), undefined, "deck");
  act("ai.context", "UPLINK's context page (who you are, how it talks)", () => void deck.act("context"), undefined, "ai");
  act("sound.mute", "Mute everything (again: sound back)", () => void deck.act("mute"), undefined, "deck");
  act("modules.open", "Modules (all apps and plugins)", () => void deck.openApp("modules"), undefined, "deck");
  act("link.open", "Open LINK (AI chat)", () => void deck.openApp("link"), "ctrl+space", "ai");
  act("ai.key", "Set Anthropic API key", () => void deck.shell.runLine("config key"), undefined, "ai");
  act("ai.provider", "Cycle AI provider (Claude Code ⇄ Anthropic API ⇄ local Ollama)", () => {
    const order = ["claude-code", "anthropic", "ollama"] as const;
    deck.settings.set("ai.provider", order[(order.indexOf(deck.settings.data.ai.provider) + 1) % order.length]);
    deck.notify(`AI provider: ${deck.settings.data.ai.provider}`);
  }, undefined, "ai");
  act("shell.focus", "Focus shell", () => deck.workspace.focusShell(), "ctrl+`", "view");
  act("sidebar.toggle", "Toggle file tree", () => deck.workspace.toggleSidebar(), "ctrl+b", "view");
  act("view.fullscreen", "Toggle fullscreen", () => void deck.toggleFullscreen(), "F11", "view");
  act("view.zoomin", "Zoom in", () => deck.zoom(1), "ctrl+=", "view");
  act("view.zoomout", "Zoom out", () => deck.zoom(-1), "ctrl+-", "view");
  act("view.osk", "On-screen keyboard", () => deck.workspace.toggleOsk(), "pad X", "view");
  act("fx.panel", "Visual effects… (bloom, scanlines, vignette)", () => deck.workspace.fxPanel(), "✦ fx", "fx");
  for (const p of FX_PRESET_NAMES) act(`fx.${p}`, `Effects: ${p} — ${FX_PRESETS[p].hint}`, () => applyFxPreset(deck, p), undefined, "fx");
  act("fx.rain", "Screensaver", () => deck.screensaver(), undefined, "fx");
  act("deck.reboot", "Reboot (replay boot sequence)", () => deck.reboot(), undefined, "deck");
  act("deck.quit", "Quit ICEBREAKER", () => void deck.quit(), undefined, "deck");
  act("vault.rescan", "Rescan vault", () => void deck.vault.rescan(), undefined, "vault");
  // the vault's encryption and place: each one asks (password, confirmation) in a window or the ibsh tab
  if (deck.platform.vault.crypt) {
    const asking = (line: string) => () => {
      void deck.act(line);
      deck.workspace.focusShell();
    };
    act("vault.encrypt", "Encrypt the vault (a backup first, a recovery key to write down)", asking("vault encrypt --window"), undefined, "vault");
    act("vault.decrypt", "Decrypt the vault (back to plain files)", asking("vault decrypt --window"), undefined, "vault");
    act("vault.recovery", "A new recovery key for the vault (24 words)", asking("vault recovery --window"), undefined, "vault");
    act("vault.rekey", "A new key for the vault (everything encrypted again)", asking("vault rekey --window"), undefined, "vault");
    act("vault.status", "Is the vault encrypted?", asking("vault status"), undefined, "vault");
    act("vault.export", "A plain copy of the vault in a folder (it stays encrypted)", () => {
      // a new folder inside the one you choose (the copy needs an empty one)
      const d = new Date(), z = (n: number) => String(n).padStart(2, "0");
      const name = `Icebreaker-plain-copy-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
      void pickFolder(deck, "A PLAIN COPY OF THE VAULT IN…").then((p) => p && asking(`vault export --window ${q(`${p.replace(/[\\/]+$/, "")}/${name}`)}`)());
    }, undefined, "vault");
  }
  if (deck.platform.vault.move) act("vault.move", "Move the vault elsewhere (a USB key, another disk)", () => {
    void deck.act("vault move --window");
    deck.workspace.focusShell();
  }, undefined, "vault");
  act("plugin.new", "Create a plugin…", async () => {
    const id = await deck.prompt("Plugin id", { placeholder: "my-plugin" });
    if (id) void deck.shell.runLine(`plugin new ${id}`);
  }, undefined, "dev");
  act("theme.new", "Create a theme from the current one…", async () => {
    const name = await deck.prompt("Theme name", { placeholder: "my-theme" });
    if (name) void deck.shell.runLine(`theme new ${name}`);
  }, undefined, "dev");
}
