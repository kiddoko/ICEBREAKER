// A module that asks for NO permission. Everything below must say "closed".
// (docs/SECURITY_AUDIT.md "How to repeat the test")
let got = "";
export async function activate(ib) {
  const r = [];
  const t = async (name, f) => { try { const v = await f(); r.push(name + ": OPEN " + String(v).slice(0, 60)); } catch (e) { r.push(name + ": closed (" + String(e && e.message || e).slice(0, 70) + ")"); } };
  const refused = async (line) => { const c = await ib.shell.run(line); if (c) throw new Error("exit " + c); return "ran" + (got ? " and captured: " + got.slice(0, 30) : ""); };
  // the command that would receive what a pipe captures
  ib.commands.register({ name: "sbxgrab", summary: "keeps what's piped into it", run(ctx) { got = ctx.stdin; } });
  await t("ib.vault.read", () => ib.vault.read("Welcome.md"));
  await t("ib.vault.write", () => ib.vault.write("notes/from-bare.md", "x"));
  await t("ib.vault.notes", () => ib.vault.notes().length);
  await t("pipe a note into my command", () => refused("cat Welcome.md | sbxgrab"));
  await t("read a note with <", () => refused("sbxgrab < Welcome.md"));
  await t("redirect into a note", () => refused("echo x > notes/from-bare.md"));
  await t("touch", () => refused("touch notes/from-bare.md"));
  await t("rm", () => refused("rm Welcome.md"));
  await t("mv", () => refused("mv Welcome.md notes/moved.md"));
  await t("mkdir", () => refused("mkdir from-bare"));
  await t("journal add", () => refused("journal add from-bare"));
  await t("note", () => refused("note from-bare"));
  await t("ask (the AI)", () => refused("ask hello"));
  await t("todo add (another module's command)", () => refused("todo add from-bare"));
  await t("remind (another module's command)", () => refused('remind "from-bare" 23:59'));
  await t("undo (what YOU did)", () => refused("undo"));
  await t("todo.list (your tasks)", () => ib.modules.call("todo", "list"));
  await t("todo.add", () => ib.modules.call("todo", "add", "from-bare"));
  await t("calendar.today (your agenda)", () => ib.modules.call("calendar", "today"));
  await t("reminders.list", () => ib.modules.call("reminders", "list"));
  await t("habits.list", () => ib.modules.call("habits", "list"));
  await t("music.status", () => ib.modules.call("music", "status"));
  await t("journal.append", () => ib.modules.call("journal", "append", "from-bare"));
  await t("uplink.ask", () => ib.modules.call("uplink", "ask", "hello"));
  await t("terminal.run", () => ib.modules.call("terminal", "run", "echo from-bare"));
  await t("deck.setting user.location", () => ib.modules.call("deck", "setting", "user.location"));
  ib.commands.register({ name: "sbxbare", summary: "what a module with no permission could do", run(ctx) { for (const l of r) ctx.out(l + "\n"); ctx.out(got ? "CAPTURED: " + got.slice(0, 40) + "\n" : "captured nothing\n"); } });
}
