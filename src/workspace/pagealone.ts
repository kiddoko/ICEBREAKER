/**
 * A page alone — a module's full-window mode (`ib.ui.fullWindow`, BreakerMED's 8 tracks on a
 * laptop): the page asks, the tree, the panel and the shell fold away (the status bar's ▣,
 * Workspace.toggleSolo); asked again, or the page leaves the front (another tab, closed), they
 * come back. It only gives back what it took: frames you folded yourself stay as you left them,
 * and frames you brought back yourself end its claim. Pure: it says what to do, the workspace does it.
 */
export class PageAlone {
  /** the page that folded everything, while it still owns that */
  owner: unknown = null;
  /** the page whose claim you ended (you brought the frames back): it may not fold them again
   * until it has left the front once — a module can't fight your choice */
  private refused: unknown = null;

  /** the page `app` asks for it (`on`) or not; `solo`: everything is folded now */
  request(app: unknown, on: boolean, solo: boolean): "fold" | "restore" | null {
    if (on) {
      if (solo || app === this.refused) return null; // already (by you, or by it) · or you said no
      this.owner = app;
      return "fold";
    }
    if (this.owner !== app || !solo) return null;
    this.owner = null;
    return "restore";
  }

  /** each frame: `front` is the page in front, `solo` whether everything is still folded */
  tick(front: unknown, solo: boolean): "restore" | null {
    if (this.refused !== null && front !== this.refused) this.refused = null;
    if (this.owner === null) return null;
    if (!solo) return void ((this.refused = this.owner), (this.owner = null)), null; // you brought them back yourself
    if (front === this.owner) return null;
    this.owner = null;
    return "restore";
  }
}
