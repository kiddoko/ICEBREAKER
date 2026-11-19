/** The glyph shown for a file by its type (the tree, the file browser, the trash…). */
/** A glyph per file type (notes need none): code, scripts, data, media… */
const ICONS: [RegExp, string][] = [
  [/\.py$/i, "∿"], [/\.(js|mjs|cjs|ts|tsx|jsx)$/i, "ʝ"], [/\.(sh|zsh|bash|fish|ibsh|ps1|bat)$/i, "❯"], [/\.(rs|go|c|cpp|h|java|kt|swift|rb|lua)$/i, "λ"],
  [/\.(json|toml|ya?ml|ini|conf|cfg)$/i, "⚙"], [/\.(csv|tsv|xlsx?)$/i, "▥"], [/\.(html?|css|svg)$/i, "◇"], [/\.(txt|log)$/i, "≡"],
  [/\.(png|jpe?g|gif|webp|heic|bmp)$/i, "▣"], [/\.pdf$/i, "▤"], [/\.(mp3|wav|flac|m4a|ogg|aiff?)$/i, "♪"], [/\.(mp4|mov|mkv|webm)$/i, "▶"],
  [/\.(zip|tar|gz|7z|rar)$/i, "▦"], [/\.(canvas|base)$/i, "◫"],
];
export const fileIcon = (name: string) => ICONS.find(([re]) => re.test(name))?.[1] ?? "◦";
