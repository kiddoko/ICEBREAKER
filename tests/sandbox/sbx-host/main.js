// The deck's side of what modules asked for (0.8.1): docs/SANDBOX.md, "How to repeat the test".
export function activate(ib) {
  ib.commands.register({
    name: "sbxhost",
    summary: "sandbox host test",
    // Tab: `sbxhost <tab>` → new open export; `sbxhost export <tab>` → wav mod
    complete: { "": ["new", "open", "export"], export: ["wav", "mod"] },
    run(ctx) {
      ctx.out("sbxhost " + ctx.args.join(" ") + "\n");
      return 0;
    },
  });
  ib.apps.register({
    kind: "sbx-host", title: "Host test", icon: "◇", launcher: true, rawKeys: true,
    create: (_deck, args) => {
      const log = [];
      const say = (s) => { log.push(s); if (log.length > 12) log.shift(); };
      let file = args && args.file ? args.file : "";
      let text = "";
      let menu = false;
      const load = async (p) => {
        file = p;
        try {
          const bytes = await ib.vault.readBytes(p);
          say("read " + p + ": " + bytes.length + " bytes");
        } catch (e) {
          say("read " + p + " refused: " + e.message);
        }
        ib.ui.redraw();
      };
      if (file) void load(file);
      return {
        kind: "sbx-host", key: "sbx-host", title: () => "host test",
        status: () => "m: a menu (esc closes it) · ⌘C copies · keys show down/up",
        openFile: (p) => { say("openFile " + p); void load(p); },
        onKey: (k) => {
          if (k.combo === "ctrl+c" || k.combo === "ctrl+x") {
            ib.ui.copy("copied from sbx-host: " + (file || "no file")).then((ok) => say("copy " + ok), (e) => say("copy refused: " + e.message));
            say("key " + k.combo);
            return true;
          }
          if (k.combo === "ctrl+v" || k.combo === "ctrl+a") return say("key " + k.combo), true;
          if (k.key === "m") menu = !menu;
          say("down " + k.key + (k.repeat ? " (repeat)" : ""));
          return true;
        },
        onKeyUp: (k) => say("up " + k.key),
        onText: (t) => { text = t; say("text " + JSON.stringify(t.slice(0, 40))); return true; },
        onAction: (a) => {
          if (a === "back" && menu) { menu = false; say("esc closed my menu"); return true; }
          if (a === "back") { say("esc: nothing of mine"); return false; }
          return false;
        },
        render(ui, r, focused) {
          const box = ui.box(r, { title: "HOST TEST", focused });
          ui.text(box.x + 1, box.y, "file: " + (file || "-"), { fg: ui.c.accent }, box.w - 2);
          ui.text(box.x + 1, box.y + 1, "menu: " + (menu ? "open (esc closes it)" : "closed"), {}, box.w - 2);
          log.forEach((l, i) => ui.text(box.x + 1, box.y + 3 + i, l, { fg: ui.c.faint }, box.w - 2));
        },
      };
    },
  });
}
