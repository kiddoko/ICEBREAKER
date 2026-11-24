/**
 * EVERY COMMAND OF THE DECK, CLASSIFIED — what a STORE / vault module's line may run
 * (`ib.shell.run`, a click on one of its areas). An allow-list: a command that isn't here is
 * refused to modules until someone classes it (tests/classes.test.ts fails the build first),
 * so a new command is never open by accident (that happened in 0.6 with `layout`, `frame`
 * and `tab move`).
 *
 *   open    any module that may run the deck's commands (permission "shell"). What it reads
 *           or writes still goes through the vault's guard (shell/origin.ts).
 *   mixed   open, but some of its sub-commands are yours only (shell/privileged.ts decides)
 *   notify  open, and it also needs "notify" (it shows or says something to you)
 *   ai      needs "ai" (it talks to your AI provider)
 *   online  never from a module: it sends words to a service on the internet (a place to
 *           open-meteo, a search to the news feeds) — a module goes online only with its own
 *           "net:<host>" permission, through ib.net
 *   yours   never from a module: it changes what only you decide, or shows what you did
 *
 * Your real terminal isn't a module: it follows shell/privileged.ts and Settings →
 * PERMISSIONS → "Your real terminal".
 */
export type CommandClass = "open" | "mixed" | "notify" | "ai" | "online" | "yours";

const list = (klass: CommandClass, names: string): [string, CommandClass][] => names.split(/\s+/).filter(Boolean).map((n) => [n, klass]);

export const COMMAND_CLASS: Readonly<Record<string, CommandClass>> = Object.fromEntries([
  // files and text: reading and writing notes is checked on every path by the vault's guard
  ...list("open", "save copy ls pwd tree cat head tail wc grep find mkdir touch rm mv cp echo sort uniq open journal note checkboxes daily tag icon"),
  // looking around, help
  ...list("open", "help man date cal whoami uname hostname uptime true false sleep which neofetch fortune colors changelog context catalog errors manual tour"),
  // pages, widgets, the look
  ...list("open", "rain fullscreen panel worldclock quote focus moon timer stopwatch matrix explore widget launch view scale palette osk settings sound mute audio sysmon fx link uplink"),
  // open, with sub-commands that are yours (shell/privileged.ts)
  ...list("mixed", "vault plugin store update config macro modules menu keys shortcuts home stealth trash theme voice encoders layout tab clock term"),
  ...list("notify", "notify say"),
  ...list("ai", "ask chat"),
  ...list("online", "weather news"),
  // yours: accounts, what runs later, what you did, where you are in the shell, the screen
  ...list("yours", "exit quit setup reboot undo redo account logout login factory-reset script bind unbind pin unpin starthere frame history env export clear cd avatar log debug statusbar"),
]);

/** What your real terminal may run when it's limited to your notes (`shell.bridge` = "notes"). */
export const NOTE_COMMANDS: ReadonlySet<string> = new Set("ls pwd tree cat head tail wc grep find mkdir touch rm mv cp echo sort uniq open journal note checkboxes daily tag icon help man true false".split(" "));

/** A command's class, by its own name (never an alias: the registry resolves those first). */
export const classOf = (name: string): CommandClass | undefined => COMMAND_CLASS[name];
