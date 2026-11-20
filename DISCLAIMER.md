# Read this first

*(en français plus bas)*

> **In one glance — ICEBREAKER is test software.** Not ready for heavy, secure or
> professional use.
> 1. **Store nothing sensitive in it** — encrypted vault or not.
> 2. **Back up your vault regularly** (copy its folder; `vault export` when it's encrypted).
> 3. **No warranty, no support, no responsibility** — you use it at your own risk.
> 4. **Help if you like**: report bugs, tell us how it went, share ideas, make modules and
>    themes — [Issues](https://github.com/kiddoko/ICEBREAKER/issues),
>    [Discussions](https://github.com/kiddoko/ICEBREAKER/discussions),
>    [CONTRIBUTING.md](CONTRIBUTING.md).

**ICEBREAKER is a hobby project.** It's made by one person who is **not a professional
developer**, for the fun of it, with an AI (Claude, by Anthropic) writing most of the code
— what people call *vibe coding*. It is built with care, tested on real use, and its code
and docs are open for anyone to read. But:

- **Nobody has audited it.** No security company, no expert review. The security work
  described in [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) is our own — honest, but
  amateur.
- **The vault encryption is new** and home-made on top of well-known libraries
  (XChaCha20-Poly1305, Argon2id). It protects a stolen laptop or a lost USB key from a
  curious person; it has **not** been checked by cryptographers.
- **It can have bugs that lose data.** Keep **backups** of your vault (it's plain files
  you can copy — or `vault export` when it's encrypted).
- **Modules made by others** run in a sandbox, but a module can still misbehave with the
  permissions you give it. Only *verified* modules (reviewed in the official STORE) have been
  read by the project; anything else is on you.
- **There is no support, no promise, no guarantee.** It's provided **"as is"** under the
  [MIT license](LICENSE): **the author and the contributors are not responsible for any
  damage, data loss, security problem or anything else that happens because of it.**
- It isn't a professional tool, and doesn't pretend to be. It's **test software: not ready
  for heavy, secure or professional use.** Try it, play with it, keep notes in it that you
  could afford to lose or to see leak — and **never what must not leak or be lost**:
  passwords, banking, medical, legal or work-confidential documents.

If that's fine with you: welcome, have fun — and help make it better: **report bugs**, tell
us **how it went** for you, share **ideas**, make **modules and themes**
([CONTRIBUTING.md](CONTRIBUTING.md), [docs/PLUGINS.md](docs/PLUGINS.md),
[docs/THEMES.md](docs/THEMES.md)).

---

## À lire d'abord

> **En un coup d'œil — ICEBREAKER est un logiciel de test.** Pas prêt pour un usage
> intensif, sécurisé ou professionnel.
> 1. **N'y mets rien de sensible** — vault chiffré ou non.
> 2. **Sauvegarde ton vault régulièrement** (copie son dossier ; `vault export` s'il est chiffré).
> 3. **Aucune garantie, aucun support, aucune responsabilité** — tu l'utilises à tes risques.
> 4. **Aide si tu veux** : signale les bugs, raconte comment ça s'est passé, propose des
>    idées, fais des modules et des thèmes — [Issues](https://github.com/kiddoko/ICEBREAKER/issues),
>    [Discussions](https://github.com/kiddoko/ICEBREAKER/discussions),
>    [CONTRIBUTING.md](CONTRIBUTING.md).

**ICEBREAKER est un projet perso.** Il est fait par une seule personne **qui n'est pas
développeur**, pour le plaisir, avec une IA (Claude, d'Anthropic) qui écrit l'essentiel du
code — ce qu'on appelle du *vibe coding*. Il est fait avec soin, testé au quotidien, et son
code et sa doc sont ouverts à tous. Mais :

- **Personne ne l'a audité.** Aucune entreprise de sécurité, aucun expert. Le travail de
  sécurité décrit dans [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) est le nôtre —
  honnête, mais amateur.
- **Le chiffrement du vault est récent**, fait maison avec des bibliothèques reconnues. Il
  protège d'un curieux un ordinateur volé ou une clé USB perdue ; il n'a **pas** été vérifié
  par des cryptographes.
- **Il peut avoir des bugs qui font perdre des données.** Garde des **sauvegardes** de ton
  vault.
- **Les modules faits par d'autres** tournent dans un bac à sable, mais un module peut quand
  même mal se comporter avec les permissions que tu lui donnes. Seuls les modules *vérifiés*
  (relus dans le STORE officiel) ont été lus par le projet ; le reste, c'est à tes risques.
- **Aucune assistance, aucune promesse, aucune garantie.** Il est fourni **« tel quel »**
  sous [licence MIT](LICENSE) : **l'auteur et les contributeurs ne sont pas responsables des
  dommages, pertes de données, failles de sécurité ou quoi que ce soit d'autre qui
  arriverait à cause de lui.**
- Ce n'est pas un outil professionnel et il ne prétend pas l'être. C'est un **logiciel de
  test : pas prêt pour un usage intensif, sécurisé ou professionnel.** Essaie-le, amuse-toi,
  gardes-y des notes que tu pourrais te permettre de perdre ou de voir fuiter — et **jamais ce
  qui ne doit ni fuiter ni être perdu** : mots de passe, banque, santé, documents juridiques
  ou confidentiels de travail.

Si ça te va : bienvenue, amuse-toi — et aide à l'améliorer : **signale les bugs**, raconte
**comment ça s'est passé**, propose des **idées**, fais des **modules et des thèmes**
([CONTRIBUTING.md](CONTRIBUTING.md), [docs/PLUGINS.md](docs/PLUGINS.md),
[docs/THEMES.md](docs/THEMES.md)).
