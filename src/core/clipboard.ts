/**
 * Copying text out of the deck.
 *
 * The async Clipboard API is the normal path. Some webviews (WKWebView on
 * macOS, WebKitGTK on Linux) only allow clipboard writes inside a native
 * "copy" event — e.g. when the user picks Edit → Copy or presses Cmd+C, which
 * the macOS menu turns into such an event. So we also remember the last text
 * the app wanted to copy, and the input layer hands it over during that event.
 */
let pending: string | null = null;

export function copyToClipboard(text: string): void {
  pending = text;
  const fallback = () => {
    try {
      document.execCommand("copy"); // fires a "copy" event → takePendingCopy()
    } catch {
      /* nothing else we can do */
    }
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => (pending = null), fallback);
  } else fallback();
}

/**
 * Write the clipboard now, whatever the webview allows outside a copy event: the desktop app
 * asks the native side (a module's ⌘C answered a moment later, from its sandbox); the browser
 * preview, the Clipboard API. Whether it worked.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  if ("__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("plugin:clipboard-manager|write_text", { text });
      return true;
    } catch {
      /* fall through */
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    copyToClipboard(text); // the next copy event hands it over
    return false;
  }
}

/** Used by the input layer inside a native copy/cut event. */
export function takePendingCopy(): string | null {
  const t = pending;
  pending = null;
  return t;
}

/**
 * Read the clipboard (right-click → paste). The desktop app asks the native
 * side (no permission bubble); the browser preview uses the Clipboard API.
 */
export async function readClipboard(): Promise<string> {
  if ("__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return (await invoke<string>("plugin:clipboard-manager|read_text")) ?? "";
    } catch {
      /* fall through */
    }
  }
  try {
    return (await navigator.clipboard?.readText?.()) ?? "";
  } catch {
    return "";
  }
}
