import { icon, type IconId } from "../core/skin/icons";

/** The icon shown for a file by its type (the tree, the file browser, the trash…): an icon id, core/skin/icons.ts. */
const KINDS: [RegExp, IconId][] = [
  [/\.py$/i, "file.python"], [/\.(js|mjs|cjs|ts|tsx|jsx)$/i, "file.js"], [/\.(sh|zsh|bash|fish|ibsh|ps1|bat)$/i, "file.script"], [/\.(rs|go|c|cpp|h|java|kt|swift|rb|lua)$/i, "file.code"],
  [/\.(json|toml|ya?ml|ini|conf|cfg)$/i, "file.config"], [/\.(csv|tsv|xlsx?)$/i, "file.table"], [/\.(html?|css|svg)$/i, "file.web"], [/\.(txt|log)$/i, "file.text"],
  [/\.(png|jpe?g|gif|webp|heic|bmp)$/i, "file.image"], [/\.pdf$/i, "file.pdf"], [/\.(mp3|wav|flac|m4a|ogg|aiff?)$/i, "file.audio"], [/\.(mp4|mov|mkv|webm)$/i, "file.video"],
  [/\.(zip|tar|gz|7z|rar)$/i, "file.archive"], [/\.(canvas|base)$/i, "file.canvas"],
];
export const fileIconId = (name: string): IconId => KINDS.find(([re]) => re.test(name))?.[1] ?? "file.other";
export const fileIcon = (name: string): string => icon(fileIconId(name));
