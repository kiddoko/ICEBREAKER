export function activate(ib) {
  ib.commands.register({
    name: "sbxdemo",
    summary: "sandbox demo",
    async run(ctx) {
      ctx.out("hello from the sandbox · " + ib.vault.notes().length + " notes\n");
      const name = await ctx.read("your name");
      ctx.out("hi " + name + "\n");
      const first = ib.vault.notes()[0];
      if (first) ctx.out("first note: " + first + " (" + (await ib.vault.read(first)).length + " chars)\n");
      return 0;
    },
  });
  ib.palette.register({ id: "sbx.hello", title: "Sandbox: say hello", run: () => ib.ui.notify("hello from the sandbox palette", "success") });
  ib.apps.register({
    kind: "sbx", title: "Sandbox", icon: "◇", launcher: true,
    create: () => {
      const list = new ib.lib.ListView();
      let shown = "";
      const field = new ib.lib.Field({ icon: "⌕", placeholder: "filter notes", onChange: (q) => { shown = q; } });
      let clicks = 0;
      return {
        kind: "sbx", key: "sbx", title: () => "sandbox",
        status: () => "type to filter · click the button",
        onText: (t) => field.onText(t),
        onKey: (k) => field.onKey(k),
        onAction: (a) => list.onAction(a),
        render(ui, r, focused) {
          const box = ui.box(r, { title: "SANDBOX", focused });
          field.render(ui, { x: box.x + 1, y: box.y, w: box.w - 2, h: 1 }, { focused });
          const row = new ib.lib.Row(ui, box.x + 1, box.y + 2, box.x + box.w - 1);
          row.button("clicked " + clicks, () => { clicks++; });
          row.checkbox(clicks % 2 === 1, { label: "odd" });
          list.items = ib.vault.notes().filter((n) => n.includes(shown));
          list.render(ui, { x: box.x + 1, y: box.y + 4, w: box.w - 2, h: box.h - 4 }, focused, (n, rr) => ui.text(rr.x + 1, rr.y, n, {}, rr.w - 2));
        },
      };
    },
  });
  ib.widgets.register({ id: "sbx", title: "sandbox", size: { w: 3, h: 2 }, render(ui, r) { ui.text(r.x + 1, r.y, "◇ sandboxed widget", { fg: ui.c.accent }); } });
}
