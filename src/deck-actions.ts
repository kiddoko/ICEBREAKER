/**
 * THE DECK'S OWN ACTIONS on THE MENU (⌘K): what you find by searching
 * ("journal", "zoom", "effects"…). Modules add theirs with ib.palette.register;
 * the catalog lists them all (kind "action").
 */
import type { Deck } from "./deck";
import { applyFxPreset, FX_PRESET_NAMES, FX_PRESETS } from "./workspace/fxpanel";
import { scriptsMenu } from "./shell/commands/scripts";

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
  act("deck.lock", "Log out (lock the deck)", () => deck.lockNow(), undefined, "deck");
  act("setup.run", "Setup (first-run questionnaire)", () => void deck.openApp("setup"), undefined, "deck");
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
  act("plugin.new", "Create a plugin…", async () => {
    const id = await deck.prompt("Plugin id", { placeholder: "my-plugin" });
    if (id) void deck.shell.runLine(`plugin new ${id}`);
  }, undefined, "dev");
  act("theme.new", "Create a theme from the current one…", async () => {
    const name = await deck.prompt("Theme name", { placeholder: "my-theme" });
    if (name) void deck.shell.runLine(`theme new ${name}`);
  }, undefined, "dev");
}
