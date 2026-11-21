import { coreServices } from "./core-services";
import type { AppSpec, PaletteAction } from "../apps/types";
import type { Deck } from "../deck";
import type { Command } from "../shell/types";
import type { WidgetSpec } from "../widgets/types";
import type { PluginManifest, PluginModule } from "./api";

/**
 * EVERYTHING IS A MODULE. Only the frame stays core: HOME, notes and their
 * editor, the file tree, the shell, settings, setup, the store and the
 * module manager itself. Every feature on top of that is a package the user
 * can switch off, remove and reinstall — the ones that ship with the deck too.
 *
 * The features below were written inside the core; they're grouped here into
 * packages. At start-up `detachCorePackages` takes their commands, apps,
 * widgets and palette actions out of the core, and the plugin host puts them
 * back, tagged with the package id, when the package is on — exactly like a
 * plugin from the store. (Bundled plugins in /plugins and plugins from the
 * vault go through the same host.)
 */
export interface CorePackage {
  id: string;
  name: string;
  description: string;
  icon: string;
  commands?: string[];
  apps?: string[];
  widgets?: string[];
  actions?: string[];
  /** false: widget-only, not shown in the MODULES hive (still in STORE → installed, and `plugin ls`) */
  launcher?: boolean;
  /** what else switches with it (the deck's own pieces that aren't a command, a page or a widget) */
  onSwitch?: (deck: Deck, on: boolean) => void;
}

export const CORE_PACKAGES: CorePackage[] = [
  { id: "nexus", name: "NEXUS", icon: "⬡", description: "the vault as a place: a pseudo-3D carousel to fly through folders, search, rename, sort", commands: ["explore"], apps: ["explorer"] },
  { id: "uplink", name: "UPLINK", icon: "◆", description: "your AI: LINK chat, ask and chat in the shell, the uplink widget", commands: ["link", "chat", "ask"], apps: ["link"], widgets: ["ai", "chat"], actions: ["link.open", "ai.key", "ai.provider"] },
  { id: "journal", name: "JOURNAL", icon: "☾", description: "one page a day, the daily check-in, streaks and the journal calendar", commands: ["journal", "daily"], apps: ["journal"], widgets: ["streak", "calendar"], actions: ["journal.today", "journal.add", "journal.yesterday", "daily.log"] },
  { id: "sysmon", name: "SYSMON", icon: "▤", description: "the machine's vitals: cpu, memory, processes", commands: ["sysmon"], apps: ["sysmon"], widgets: ["system"] },
  { id: "studio", name: "THEME STUDIO", icon: "◐", description: "every knob of the current theme, with a live preview", apps: ["studio"] },
  { id: "voice", name: "VOICE", icon: "◖", description: "the deck's voice: local text-to-speech through a robot filter", commands: ["voice"], launcher: false },
  { id: "news", name: "NEWS", icon: "≡", description: "headlines for your area or a topic, with summaries", commands: ["news"], widgets: ["news"] },
  { id: "weather", name: "WEATHER", icon: "☂", description: "now, the next 24 h and the week (open-meteo.com)", commands: ["weather"], apps: ["weather"], widgets: ["weather"] },
  { id: "clocks", name: "CLOCKS", icon: "◷", description: "the clock, world clocks, a timer and a stopwatch", commands: ["timer", "stopwatch", "worldclock", "clock"], apps: ["clocks"], widgets: ["clock", "worldclock"] },
  { id: "focus", name: "FOCUS", icon: "◎", description: "a pomodoro timer", commands: ["focus"], apps: ["focus"], widgets: ["focus"] },
  { id: "moon", name: "MOON", icon: "◑", description: "tonight's moon and the next phases", commands: ["moon"], widgets: ["moon"], launcher: false },
  { id: "matrix", name: "MATRIX", icon: "ﾑ", description: "digital rain on HOME: does nothing, looks great", commands: ["matrix"], widgets: ["matrix"], launcher: false },
  { id: "quotes", name: "QUOTES", icon: "❝", description: "a line to think about, every hour", commands: ["quote"], widgets: ["quote"], launcher: false },
  {
    id: "terminal",
    name: "TERMINAL",
    icon: "❯",
    description: "the shell panel: your real terminals, ibsh and the log, a terminal as a tab, your scripts",
    commands: ["term", "script"],
    apps: ["terminal"],
    actions: ["terminal.open", "shell.focus", "shell.history", "scripts.menu"],
    // off: no shell panel at all; commands still run (THE MENU, BLOCKS, macros) and what
    // they ask comes as dialogs (shell/shell.ts readLine)
    onSwitch: (deck, on) => deck.workspace.setTerminalModule(on),
  },
];

interface Stash {
  commands: Command[];
  apps: AppSpec[];
  widgets: WidgetSpec[];
  actions: PaletteAction[];
}
const stashes = new Map<string, Stash>();

/** Take the packages' items out of the core (call after the core registered everything). */
export function detachCorePackages(deck: Deck): void {
  for (const p of CORE_PACKAGES) {
    const st: Stash = { commands: [], apps: [], widgets: [], actions: [] };
    for (const n of p.commands ?? []) {
      const c = deck.commands.get(n);
      if (c && c.name === n) (st.commands.push(c), deck.commands.register({ ...c, source: p.id }));
    }
    for (const k of p.apps ?? []) {
      const a = deck.apps.get(k);
      if (a) (st.apps.push(a), deck.apps.register(a, p.id));
    }
    for (const w of p.widgets ?? []) {
      const s = deck.widgets.get(w);
      if (s) (st.widgets.push(s), deck.widgets.register(s, p.id));
    }
    for (const id of p.actions ?? []) {
      const x = deck.actions.get(id);
      if (x) (st.actions.push(x), deck.actions.register(x, p.id));
    }
    // registered under the package's id, then removed: the host puts them back
    deck.commands.unregisterSource(p.id);
    deck.apps.unregisterSource(p.id);
    deck.widgets.unregisterSource(p.id);
    deck.actions.unregisterSource(p.id);
    stashes.set(p.id, st);
  }
}

/** The packages as plugin-host entries. */
export function corePackageEntries(deck: Deck, version: string): { manifest: PluginManifest; load: () => Promise<PluginModule> }[] {
  return CORE_PACKAGES.map((p) => ({
    manifest: { id: p.id, name: p.name, version, description: p.description, author: "icebreaker", permissions: [], core: true, icon: p.icon, launcher: p.launcher },
    load: async () => ({
      activate() {
        const st = stashes.get(p.id);
        if (!st) return;
        for (const c of st.commands) deck.commands.register({ ...c, source: p.id });
        for (const a of st.apps) deck.apps.register(a, p.id);
        for (const w of st.widgets) deck.widgets.register(w, p.id);
        for (const x of st.actions) deck.actions.register(x, p.id);
        deck.services.exposeAll(p.id, coreServices(deck)[p.id] ?? {});
        p.onSwitch?.(deck, true);
      },
      deactivate() {
        p.onSwitch?.(deck, false);
      },
    }),
  }));
}
