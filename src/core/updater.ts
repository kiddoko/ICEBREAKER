import type { Deck } from "../deck";
import type { AppUpdateInfo } from "../platform/types";
import { APP_VERSION } from "../plugins/host";
import { checkModuleUpdates, updateModule, type ModuleUpdate } from "../plugins/updates";
import { t } from "./i18n";

/**
 * UPDATES — ICEBREAKER itself and the modules installed from a repo, the way a program
 * does it (Settings → UPDATES, the `update` command):
 *
 *   look        never · at start · every day (`updates.check`)
 *   download    by itself, in the background, or when you say (`updates.download`)
 *   install     ask first (default) or by itself (`updates.install`) — ICEBREAKER by
 *               itself installs when you quit, never in your face
 *
 * Stealth mode looks for nothing. One check covers both; one "install" installs both.
 * Built-in modules come with ICEBREAKER's own updates.
 */
export class Updater {
  /** a newer ICEBREAKER, once found (downloaded or not) */
  app: AppUpdateInfo | null = null;
  /** bytes of ICEBREAKER downloaded so far, while it downloads */
  progress: { done: number; total: number | null } | null = null;
  modules: ModuleUpdate[] = [];
  checkedAt = 0;
  busy = false;
  error = "";
  /** ICEBREAKER itself couldn't be checked (no release there, no network): not "up to date" */
  appError = "";
  /** what was already offered this session (not asked twice) */
  private offered = "";
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deck: Deck) {}

  get version(): string {
    return APP_VERSION;
  }

  /** Nothing can be updated here (the web version: no native side). */
  get canUpdateApp(): boolean {
    return !!this.deck.platform.appUpdate;
  }

  /** After login: the first look a little later, then one every day (as settings say). */
  start(): void {
    if (this.timer) clearInterval(this.timer);
    setTimeout(() => void this.auto(), 30_000);
    this.timer = setInterval(() => void this.auto(), 60 * 60_000);
  }

  private lastCheck(): number {
    try {
      return Number(localStorage.getItem("icebreaker.updates.checked") || 0);
    } catch {
      return 0;
    }
  }

  /** What `updates.check` allows now (not in stealth mode, never twice a day for "daily"). */
  private due(): boolean {
    const s = this.deck.settings.data.updates;
    if (this.deck.settings.data.privacy.stealth || s.check === "never") return false;
    if (s.check === "start") return !this.checkedAt;
    return Date.now() - this.lastCheck() > 23 * 3600_000;
  }

  /** The background round: look, download if allowed, then install or ask. */
  async auto(): Promise<void> {
    if (this.busy || !this.due()) return;
    await this.check().catch(() => {});
    const s = this.deck.settings.data.updates;
    if (s.download && this.app && !this.app.downloaded) await this.download().catch(() => {});
    if (!this.pending()) return;
    if (s.install === "auto") {
      // modules now (they're small, nothing restarts); ICEBREAKER when you quit
      if (this.modules.length) await this.installModules();
      if (this.app?.downloaded) this.deck.notify(t("ICEBREAKER {v} is ready: it installs when you quit", { v: this.app.version }), "info");
      return;
    }
    const key = `${this.app?.version ?? ""}|${this.modules.map((m) => `${m.id}@${m.latest}`).join()}`;
    if (key === this.offered) return;
    this.offered = key;
    if (await this.deck.confirm(t("Updates are ready"), this.summary())) await this.installAll(true);
  }

  /** Something to install? */
  pending(): boolean {
    return !!this.app || this.modules.length > 0;
  }

  /** Lines a person reads: what's new. */
  summary(): string {
    const lines: string[] = [];
    if (this.app) lines.push(`ICEBREAKER ${this.app.current} → ${this.app.version}${this.app.downloaded ? "" : ` (${t("not downloaded yet")})`}${this.app.notes ? `\n  ${this.app.notes.split("\n").slice(0, 4).join("\n  ")}` : ""}`);
    for (const m of this.modules) lines.push(`${m.name} ${m.have} → ${m.latest}`);
    return lines.join("\n") || t("everything is up to date");
  }

  /** Look for both (ICEBREAKER and the modules). Errors are kept in `error`, not thrown away. */
  async check(): Promise<void> {
    this.busy = true;
    this.error = "";
    this.deck.requestFrame();
    try {
      const errors: string[] = [];
      this.appError = "";
      if (this.deck.platform.appUpdate) {
        try {
          const found = await this.deck.platform.appUpdate.check(this.deck.settings.data.updates.endpoint);
          // keep what was already downloaded for this same version
          this.app = found ? { ...found, downloaded: this.app?.version === found.version ? this.app.downloaded : found.downloaded } : null;
        } catch (e) {
          this.appError = e instanceof Error ? e.message : String(e);
          errors.push(`ICEBREAKER couldn't be checked: ${this.appError} (${this.deck.settings.data.updates.endpoint || "the official releases"})`);
        }
      }
      const m = await checkModuleUpdates(this.deck);
      this.modules = m.updates;
      errors.push(...m.errors);
      this.error = errors.join("\n");
      this.checkedAt = Date.now();
      try {
        localStorage.setItem("icebreaker.updates.checked", String(this.checkedAt));
      } catch {
        /* a convenience only */
      }
    } finally {
      this.busy = false;
      this.deck.requestFrame();
    }
  }

  /** Download ICEBREAKER's update (nothing installed). */
  async download(): Promise<void> {
    const u = this.deck.platform.appUpdate;
    if (!u || !this.app) return;
    this.progress = { done: 0, total: null };
    try {
      this.app = await u.download((done, total) => ((this.progress = { done, total }), this.deck.requestFrame()));
    } finally {
      this.progress = null;
      this.deck.requestFrame();
    }
  }

  /** The modules' updates, now. Returns what was updated. */
  async installModules(): Promise<string[]> {
    const done: string[] = [];
    for (const m of [...this.modules]) {
      try {
        done.push(await updateModule(this.deck, m));
        this.modules = this.modules.filter((x) => x.id !== m.id);
      } catch (e) {
        this.error = `${m.id}: ${e instanceof Error ? e.message : e}`;
      }
    }
    return done;
  }

  /** Everything ready: the modules, then ICEBREAKER (downloaded first if needed; it restarts). */
  async installAll(restart = true): Promise<void> {
    if (this.modules.length) {
      const done = await this.installModules();
      if (done.length) this.deck.notify(`${t("updated")}: ${done.join(", ")}`, "success");
    }
    if (!this.app || !this.deck.platform.appUpdate) return;
    if (!this.app.downloaded) await this.download();
    if (!restart) return;
    try {
      await this.deck.platform.appUpdate.install();
    } catch (e) {
      // the native side lost the download (an earlier failed try, a restart of the deck…):
      // look again, download again, and try once more
      if (!/nothing downloaded/.test(String(e))) throw e;
      this.app.downloaded = false;
      await this.check();
      if (!this.app) throw e;
      await this.download();
      await this.deck.platform.appUpdate.install();
    }
  }

  /** On quit, with "install by itself": the downloaded ICEBREAKER goes in (the next launch is the new one). */
  async onQuit(): Promise<void> {
    if (this.deck.settings.data.updates.install === "auto" && this.app?.downloaded) await this.deck.platform.appUpdate?.install(false).catch(() => {});
  }
}
