// SPDX-License-Identifier: GPL-3.0-or-later
// ===========================================================================
// ABS-DA (ABS Desktop App) — an unofficial Windows desktop app for Audiobookshelf.
// Copyright (C) 2026 Farathim. Free software under the GNU GPL v3 or later; see LICENSE.
//
// Runs the official Audiobookshelf web app (player, reader and every admin
// tool) with a dark custom title bar and desktop extras: remembered server,
// login and window size, mouse back/forward buttons, outside links opening in
// your browser, themes and bookshelf art, the system tray, a single running
// instance, and installer/portable builds.
//
// Layout: the window itself shows our title bar (titlebar.html). The
// Audiobookshelf web app runs in a WebContentsView placed underneath it.
// ===========================================================================

const {
  app, BrowserWindow, WebContentsView, Menu, Tray, ipcMain, shell, dialog,
  screen, session, safeStorage, webContents, net, Notification, clipboard,
} = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { normalizeServer, probeServer } = require("./server");
const { SHELF_ARTS, artUrl } = require("./shelf-art");
const { pickLang, stringsFor, translator, LANGUAGES } = require("./i18n");

// ---------------------------------------------------------------------------
// Settings folder: next to the .exe for the portable build, %APPDATA% when installed.
// Versions before 2.0 were called "Audiobookshelf Player" — carry their settings
// (server, saved login, theme, window size) over once, so upgrading is seamless.
// ---------------------------------------------------------------------------
let dataFolderProblem = null;   // portable: a data folder we can't write to (see whenReady)
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  const dir = process.env.PORTABLE_EXECUTABLE_DIR;
  const oldDir = path.join(dir, "abs-player-data");
  const newDir = path.join(dir, "abs-da-data");
  try { if (!fs.existsSync(newDir) && fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir); } catch {}
  // The folder next to the .exe must be writable (not a protected folder or a locked USB stick).
  try {
    fs.mkdirSync(newDir, { recursive: true });
    const probe = path.join(newDir, ".write-test");
    fs.writeFileSync(probe, "ok");
    fs.unlinkSync(probe);
    app.setPath("userData", newDir);
  } catch {
    dataFolderProblem = newDir;
    app.setPath("userData", path.join(require("os").tmpdir(), "abs-da-data-portable"));   // just to show the message
  }
} else {
  const newDir = app.getPath("userData");
  const oldDir = path.join(app.getPath("appData"), "Audiobookshelf Player");
  // Everything but the caches: the saved login needs its key from "Local State", and the
  // web app's sign-in lives in "Local Storage" / "Network".
  const SKIP = /cache|^blob_storage$/i;
  if (!fs.existsSync(path.join(newDir, "config.json")) && fs.existsSync(path.join(oldDir, "config.json"))) {
    try {
      fs.cpSync(oldDir, newDir, {
        recursive: true,
        filter: (src) => !SKIP.test(path.basename(src)) || src === oldDir,
      });
    } catch {}
  }
}

// The portable .exe unpacks the app into %TEMP%\<random name> on every start and runs it
// from there (that is how electron-builder's portable works); the folder is removed when
// the app closes normally. Started *directly* from such a folder (Windows search, an old
// pin, the Properties window…) it would run without your settings, as an old version
// that can vanish any time: say so and stop (see whenReady).
const exeDir = path.dirname(process.execPath);
const exeName = path.basename(process.execPath);
// An unpacked copy of *this* app: its app.asar carries our package name. (Read as a plain
// file through original-fs: opening it as an archive would keep it open, undeletable.)
// A folder with only resources\ left is a half-removed one and counts too.
const PKG_NAME = require("./package.json").name;
const isUnpackFolder = (dir) => {
  if (!/^[0-9A-Za-z]{20,40}$/.test(path.basename(dir))) return false;
  const ofs = require("original-fs");
  try {
    if (!ofs.existsSync(path.join(dir, exeName)) && ofs.readdirSync(dir).join() !== "resources") return false;
    const asar = ofs.readFileSync(path.join(dir, "resources", "app.asar")).toString("latin1");
    return new RegExp(`"name"\\s*:\\s*"${PKG_NAME}"`).test(asar);
  } catch { return false; }
};
const sameDir = (a, b) => {
  try { return fs.realpathSync.native(a).toLowerCase() === fs.realpathSync.native(b).toLowerCase(); } catch { return false; }
};
const startedFromTemp = app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE &&
  sameDir(path.dirname(exeDir), os.tmpdir()) && isUnpackFolder(exeDir);

// Portable: folders left in %TEMP% by copies that were closed by force, or by older
// versions (about 265 MB each), are removed a little after start. A copy that is still
// running keeps its .exe locked, so it is skipped.
function cleanOldUnpackFolders() {
  if (!process.env.PORTABLE_EXECUTABLE_FILE || !isUnpackFolder(exeDir)) return;
  const tmp = path.dirname(exeDir);
  let names = [];
  try { names = fs.readdirSync(tmp); } catch { return; }
  for (const name of names) {
    const dir = path.join(tmp, name);
    if (name.toLowerCase() === path.basename(exeDir).toLowerCase() || !isUnpackFolder(dir)) continue;
    const exe = path.join(dir, exeName);
    try { if (fs.existsSync(exe)) fs.closeSync(fs.openSync(exe, "r+")); } catch { continue; }   // in use
    // (Windows may keep the empty folder itself while another program, e.g. a browser
    // the app opened, still uses it as its working folder; the files are what count.)
    // original-fs: Electron's normal fs treats app.asar as a folder, which trips up rm.
    require("original-fs").promises.rm(dir, { recursive: true, force: true, maxRetries: 2 }).catch(() => {});
  }
}

// App → Use hardware acceleration (off = the cure for drawing glitches with some
// graphics drivers). Must be decided before the app is ready, so read it here.
try {
  const early = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "config.json"), "utf8"));
  if (early.hardwareAcceleration === false) app.disableHardwareAcceleration();
} catch {}

// Only one copy of the app at a time — launching it again focuses the open one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// A fixed Windows app ID: groups the app's notifications/taskbar correctly, and is the
// name of its "Start with Windows" registry entry (the uninstaller removes that entry).
const APP_ID = "com.farathim.audiobookshelfplayer";
app.setAppUserModelId(APP_ID);

// Started by Windows at sign-in ("Start with Windows") → go straight to the tray.
const startHidden = process.argv.includes("--hidden");

const BG = "#232323";              // matches the Audiobookshelf dark theme (no white flash)
const ICON = path.join(__dirname, "build", "icon.ico");
const PRELOAD = path.join(__dirname, "preload.js");

// Custom title bar height (its colours come from the theme).
const TITLE_H = 36;

// Style fixes for bugs in the Audiobookshelf web app itself, added to every server page.
//  - Bug #4818: the volume slider and playback-speed menu pop up *behind* the
//    ebook reader (reader is z-60, player bar z-50). While the reader is open,
//    lift the player above it. The reader already stops 164px above the bottom
//    to make room for the player, so only those pop-up menus are affected.
//  - The seek bar's hover bubble ("9:09:59 - Chapter 22") is a glaring white box:
//    make it dark with light text and a theme-coloured border and arrow.
const ABS_CSS_FIXES = `
  body:has(#reader) #mediaPlayerContainer { z-index: 61 !important; }
  #mediaPlayerContainer .volumeMenu { z-index: 30; }
  #mediaPlayerContainer div.bg-white.text-black.rounded-full:has(> p) {
    background: var(--color-primary, #232323) !important; color: #f3f4f6 !important;
    border: 1px solid var(--tb-logo, #f0a848); box-shadow: 0 2px 10px rgba(0, 0, 0, .6); }
  #mediaPlayerContainer div.bg-white.text-black.rounded-full:has(.arrow-down) { background: transparent !important; }
  #mediaPlayerContainer .arrow-down { border-top-color: var(--tb-logo, #f0a848) !important; }
  /* Side menu "Issues" (books with missing files…): red tint → a tint of the theme's
     accent, with the warning icon in that colour so it still stands out. */
  #siderail-buttons-container a[href*="filter=issues"] {
    background-color: color-mix(in srgb, var(--tb-logo, #f0a848) 16%, transparent) !important; }
  #siderail-buttons-container a[href*="filter=issues"]:hover {
    background-color: color-mix(in srgb, var(--tb-logo, #f0a848) 30%, transparent) !important; }
  #siderail-buttons-container a[href*="filter=issues"] .material-symbols { color: var(--tb-logo, #f0a848); }
`;
// Web-app bug fixes that need code (run in every server page once the web app is up):
//  - Library folder picker ("Choose a Folder"): it asks /api/filesystem?path=<folder>
//    without encoding the folder, so a name with & # + (e.g. "Audio & Books") is cut
//    off and the server answers "Invalid path" → "Failed to load data". Encode it.
//    (If a future web app encodes it itself, it is decoded first, so never twice.)
const ABS_JS_FIXES = `(() => {
  const ax = window.$nuxt && $nuxt.$axios;
  if (!ax || !ax.interceptors) return false;
  if (window.__absdaFixes) return true;
  window.__absdaFixes = true;
  ax.interceptors.request.use((cfg) => {
    const m = String(cfg.url || "").match(/^(.*\\/api\\/filesystem\\?path=)(.*)(&level=\\d+)$/);
    if (m) {
      let p = m[2];
      if (!/[&#+ ]/.test(p)) { try { p = decodeURIComponent(p); } catch (e) {} }
      cfg.url = m[1] + encodeURIComponent(p) + m[3];
    }
    return cfg;
  });
  return true;
})()`;
function applyWebAppFixes(contents, attempt = 0) {
  if (!contents || contents.isDestroyed() || !isServerUrl(contents.getURL())) return;
  contents.executeJavaScript(ABS_JS_FIXES)
    .then((ok) => { if (!ok && attempt < 10) setTimeout(() => applyWebAppFixes(contents, attempt + 1), 1500); })
    .catch(() => {});
}

// ---- Themes ----------------------------------------------------------------
// The Audiobookshelf web app takes its colours from CSS variables (--color-primary
// = page background, --color-bg = panels, --color-black-* = grays for borders/
// hover/inputs, --color-accent), so a theme just overrides those. `title` colours
// the custom title bar and Windows' minimise/maximise/close buttons. `success` is the
// action colour (Save / Scan Library buttons, on/off switches); red and orange stay as they are.
//
// With a Windows Contrast Theme on, Windows swaps every colour for the contrast
// theme's colours (sliders like volume and the seek bar vanish). All themes
// except "Windows contrast colours" opt the app out of that.
const NO_FORCED_COLORS_CSS = ":root, *, *::before, *::after { forced-color-adjust: none !important; }";
const DEFAULT_TITLE = { bg: "#1b1b1b", fg: "#e5e5e5", hover: "#333333", logo: "#f0a848" };

const THEMES = {
  abs: { label: "Audiobookshelf", title: DEFAULT_TITLE },
  midnight: {
    label: "Midnight",
    title: { bg: "#0e1420", fg: "#e3e8f2", hover: "#263045", logo: "#5aa9ff" },
    tint: "rgba(14, 26, 54, 0.62)",
    shelf: "linear-gradient(180deg, #5b6f96 0%, #33456b 17%, #33456b 88%, #1c2742 100%)",
    scroll: "#46598a",
    page: "linear-gradient(to right bottom, #1c2536, #121826)",
    colors: {
      primary: "#121826", bg: "#1c2536", accent: "#5aa9ff", success: "#2f6fc4",
      "black-50": "#b6bfd0", "black-100": "#6b7790", "black-200": "#556078", "black-300": "#3e485d",
      "black-400": "#2c3446", "black-500": "#1b2232", "black-600": "#111724", "black-700": "#0c111b",
    },
  },
  oled: {
    label: "OLED Black",
    title: { bg: "#000000", fg: "#e5e5e5", hover: "#1f1f1f", logo: "#f0a848" },
    tint: "rgba(0, 0, 0, 0.6)",
    shelf: "linear-gradient(180deg, #3a3a3a 0%, #1f1f1f 17%, #1f1f1f 88%, #0d0d0d 100%)",
    scroll: "#3a3a3a",
    page: "linear-gradient(to right bottom, #111111, #000000)",
    colors: {
      primary: "#000000", bg: "#111111",
      "black-50": "#b5b5b5", "black-100": "#5c5c5c", "black-200": "#474747", "black-300": "#333333",
      "black-400": "#222222", "black-500": "#141414", "black-600": "#0a0a0a", "black-700": "#050505",
    },
  },
  forest: {
    label: "Forest",
    title: { bg: "#0f1612", fg: "#e2ebe4", hover: "#26342b", logo: "#74d68a" },
    tint: "rgba(14, 40, 24, 0.6)",
    shelf: "linear-gradient(180deg, #6f8f6a 0%, #3f5a3b 17%, #3f5a3b 88%, #24361f 100%)",
    scroll: "#4e6b49",
    page: "linear-gradient(to right bottom, #1f2b24, #141c17)",
    colors: {
      primary: "#141c17", bg: "#1f2b24", accent: "#74d68a", success: "#3e8f55",
      "black-50": "#b8c6bc", "black-100": "#6c8072", "black-200": "#55675a", "black-300": "#3f4e44",
      "black-400": "#2d3a31", "black-500": "#1c251f", "black-600": "#121914", "black-700": "#0c120e",
    },
  },
  mocha: {
    label: "Mocha",
    title: { bg: "#15110e", fg: "#eee5dd", hover: "#322822", logo: "#e6a85c" },
    tint: "rgba(40, 24, 12, 0.35)",
    shelf: "linear-gradient(180deg, #a07a55 0%, #6b4a2c 17%, #6b4a2c 88%, #45301b 100%)",
    page: "linear-gradient(to right bottom, #2a221d, #1c1714)",
    colors: {
      primary: "#1c1714", bg: "#2a221d", accent: "#e6a85c", success: "#a86f35",
      "black-50": "#cbbfb5", "black-100": "#7d6f65", "black-200": "#645850", "black-300": "#4c423b",
      "black-400": "#382f2a", "black-500": "#241e1a", "black-600": "#17130f", "black-700": "#110d0b",
    },
  },
  amethyst: {
    label: "Amethyst",
    title: { bg: "#141220", fg: "#e9e5f5", hover: "#2f2a45", logo: "#b58cff" },
    tint: "rgba(36, 20, 66, 0.6)",
    shelf: "linear-gradient(180deg, #8a73b8 0%, #54417e 17%, #54417e 88%, #2f2350 100%)",
    scroll: "#6a5596",
    page: "linear-gradient(to right bottom, #27233a, #1b1828)",
    colors: {
      primary: "#1b1828", bg: "#27233a", accent: "#b58cff", success: "#7350c0",
      "black-50": "#c4bfda", "black-100": "#78729c", "black-200": "#5e5982", "black-300": "#474263",
      "black-400": "#34304c", "black-500": "#221f33", "black-600": "#161423", "black-700": "#100e19",
    },
  },
  // Easier to see: pure black, white text, yellow highlights, strong outlines.
  highcontrast: {
    label: "High contrast",
    title: { bg: "#000000", fg: "#ffffff", hover: "#3a3a3a", logo: "#ffd400" },
    tint: "rgba(0, 0, 0, 0.55)",
    shelf: "linear-gradient(180deg, #ffffff 0%, #c8c8c8 17%, #c8c8c8 88%, #8a8a8a 100%)",
    scroll: "#ffffff",
    page: "linear-gradient(#000000, #000000)",
    // Notifications: extra-bright type colours (the white outline is in `css` below).
    toast: { success: "#00e676", error: "#ff5252", warning: "#ffd400", info: "#40c4ff", default: "#ffd400", outline: "#ffffff" },
    colors: {
      primary: "#000000", bg: "#000000", accent: "#ffd400", success: "#008a3e",
      "black-50": "#ffffff", "black-100": "#e6e6e6", "black-200": "#c8c8c8", "black-300": "#9a9a9a",
      "black-400": "#2a2a2a", "black-500": "#161616", "black-600": "#0a0a0a", "black-700": "#000000",
      // The web app's grey text, made bright.
      "gray-200": "#ffffff", "gray-300": "#ffffff", "gray-400": "#f0f0f0", "gray-500": "#dcdcdc", "gray-600": "#c4c4c4",
    },
    css: `
      input, textarea, select { border-color: #ffffff !important; }
      :focus-visible { outline: 3px solid #ffd400 !important; outline-offset: 2px !important; }
      #siderail-buttons-container a { border-bottom-color: #4a4a4a !important; }
      #appbar { border-bottom: 1px solid #4a4a4a; }
      .globalSearchMenu, .librariesDropdownMenu, [role="menu"], [role="listbox"] { border-color: #ffffff !important; }
      html:root body [cy-id="seriesLengthMarker"], html:root body [cy-id="booksInSeries"], html:root body [cy-id="seriesSequenceList"],
      html:root body [cy-id="seriesSequence"], html:root body [cy-id="podcastEpisodeNumber"], html:root body [cy-id="numEpisodes"] {
        background-color: #000000 !important; color: #ffffff !important; outline: 2px solid #ffffff; }
      html:root body #appbar div:has(> ul.librariesDropdownMenu) > button,
      html:root body #appbar a[href$="/account"],
      html:root body #appbar .absda-search input { border-color: #ffffff !important; background: #000000 !important; }
    `,
  },
  contrast: { label: "Windows contrast colours", contrast: true, title: DEFAULT_TITLE },
};

// The web app's own wood bookshelf image, e.g. url("…/wood_default.jpg").
// Read from the page once, so themes can lay a colour tint over it.
let woodTexture = null;
async function readWoodTexture(contents) {
  if (woodTexture || contents.isDestroyed()) return;
  try {
    const v = await contents.executeJavaScript(
      "getComputedStyle(document.documentElement).getPropertyValue('--bookshelf-texture-img').trim()"
    );
    if (v && v.startsWith("url(")) woodTexture = v;
  } catch {}
}

// Pop-up notifications ("Library … created", errors…): the theme's panel colour with a
// coloured stripe, icon and progress bar per type, instead of bright full-colour blocks.
// (View → Notifications → Use theme colours turns this off.)
function toastCss(panel, accent, status) {
  const s = { success: "#43b581", error: "#e5534b", warning: "#d9a03f", info: accent, default: accent, ...status };
  const T = ".Vue-Toastification__toast";
  const border = s.outline
    ? `border: 2px solid ${s.outline} !important; border-left: 8px solid var(--absda-toast) !important;`
    : "border: 1px solid rgba(255, 255, 255, .12) !important; border-left: 6px solid var(--absda-toast) !important;";
  return `
    ${T} { background: ${panel} !important; color: #f3f4f6 !important; ${border}
      box-shadow: 0 8px 24px rgba(0, 0, 0, .45) !important; }
    ${["success", "error", "warning", "info", "default"].map((k) => `${T}--${k} { --absda-toast: ${s[k]}; }`).join("\n    ")}
    ${T} > svg, ${T} .Vue-Toastification__icon { color: var(--absda-toast) !important; fill: currentColor !important; }
    ${T} .Vue-Toastification__close-button { color: rgba(255, 255, 255, .55) !important; opacity: 1 !important; }
    ${T} .Vue-Toastification__close-button:hover { color: #fff !important; }
    ${T} .Vue-Toastification__progress-bar { background: var(--absda-toast) !important; }`;
}

// Hue (0–360°) of a "#rrggbb" colour.
function hexHue(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
// The listening-activity calendar (Stats) colours its days in fixed GitHub greens
// (inline styles). Turn those greens to the theme's accent hue; the grey "no
// listening" days and the light→dark steps stay as they are.
function heatmapCss(accent) {
  const shift = Math.round(hexHue(accent) - 135);   // the greens sit around 135°
  if (Math.abs(shift) < 12) return "";
  return `[class~="rounded-xs"][style*="outline-offset"] { filter: hue-rotate(${shift}deg) !important; }`;
}

// The CSS added to every page for a theme.
function themeCss(id) {
  const t = THEMES[id];
  const parts = [];
  if (!t.contrast) parts.push(NO_FORCED_COLORS_CSS);
  if (t.colors) {
    parts.push("html:root {" + Object.entries(t.colors).map(([k, v]) => ` --color-${k}: ${v} !important;`).join("") + " }");
  }
  // Bookshelf art: a texture from shelf-art.js, none (flat), or the classic wood
  // tinted in the theme's colour.
  const artId = shelfArtId();
  const art = SHELF_ARTS[artId];
  if (artId === "none") {
    parts.push("html:root { --bookshelf-texture-img: none !important; }");
  } else if (art.svg) {
    parts.push(`html:root { --bookshelf-texture-img: ${artUrl(art)} !important; }`);
  } else if (t.tint && woodTexture) {
    parts.push(`html:root { --bookshelf-texture-img: linear-gradient(${t.tint}, ${t.tint}), ${woodTexture} !important; }`);
  }
  // Shelf planks match the art (or the theme for classic wood / flat).
  const plank = art.plank || t.shelf;
  if (plank) {
    // Library page planks use the variable; Home page planks have their own hard-coded gradient.
    parts.push(`html:root { --bookshelf-divider-bg: ${plank} !important; }`);
    parts.push(`.bookshelfDividerCategorized { background: ${plank} !important; }`);
  }
  if (t.scroll) {
    // Both scrollbar styles: the standard one (used by the bookshelf) wins over the older ::-webkit one.
    parts.push(`::-webkit-scrollbar-thumb, ::-webkit-scrollbar-thumb:hover { background: ${t.scroll} !important; }`);
    parts.push(`#bookshelf { scrollbar-color: ${t.scroll} rgba(0, 0, 0, 0) !important; }`);
  }
  if (t.page) parts.push(`#bookshelf, #page-wrapper { background-image: ${t.page} !important; }`);
  if (t.colors && config.toastThemed !== false) parts.push(toastCss(t.colors.bg, t.title.logo, t.toast));
  if (t.colors && t.colors.success) {
    // "Info" buttons (Read, …) and info text: a lighter shade of the action colour, so
    // Play and Read belong together but stay different (and INFO in Logs stays readable).
    parts.push(`html:root { --color-info: color-mix(in srgb, ${t.colors.success} 78%, white) !important; }`);
    // Cover badges: the gold "number of books" on series and the brown "#1–3" on
    // collapsed series take the theme's action colour (white numbers stay readable).
    parts.push(`[cy-id="seriesLengthMarker"], [cy-id="booksInSeries"] { background-color: ${t.colors.success} !important; }
      [cy-id="seriesSequenceList"] { background-color: color-mix(in srgb, ${t.colors.success} 70%, black) !important; }`);
  }
  if (t.colors && t.colors.accent) {
    parts.push(heatmapCss(t.colors.accent));
    // Shelf labels under covers ("Continue Listening", series names): gold text and
    // border → a light tint of the theme's accent.
    parts.push(`.shinyBlack { color: color-mix(in srgb, ${t.title.logo} 45%, white) !important;
      border-color: color-mix(in srgb, ${t.title.logo} 60%, transparent) !important; }`);
    // The web app's yellow accent (Stats chart line and dots, progress bars on covers)
    // takes the theme's accent colour.
    parts.push(`html:root { --color-yellow-400: ${t.title.logo} !important; --color-yellow-300: ${t.title.logo} !important; }`);
  }
  if (!t.contrast) {
    // The web app's red "error" colour (Delete / Remove buttons, Missing, the "!" on
    // covers of books with issues, Invalid Cover, the side menu's Issues) takes the
    // theme's accent. Filled red buttons and badges get a darker shade of it so they
    // still read as "careful". (Notifications have their own colours.) On the Logs
    // page ERROR is the accent and WARN a light tint of it, so they stay apart.
    const a = t.title.logo;
    parts.push(`html:root { --color-error: ${a} !important; }
      .bg-error { background-color: color-mix(in srgb, ${a} 55%, black) !important; color: #fff !important; }
      .bg-red-100:has(> .border-error) { background-color: var(--color-bg) !important; }
      .w-12.text-right.text-warning { color: color-mix(in srgb, ${a} 45%, white) !important; }`);
  }
  if (t.css) parts.push(t.css);
  const tb = t.title;
  parts.push(`html:root { --tb-bg: ${tb.bg}; --tb-fg: ${tb.fg}; --tb-hover: ${tb.hover}; --tb-logo: ${tb.logo}; }`);
  // The connect / can't-reach screen (connect.css) follows the theme too.
  const c = t.colors || {};
  parts.push(`html:root { --cn-bg: ${c.primary || "#232323"}; --cn-card: ${c.bg || "#2e2d2b"}; ` +
    `--cn-field: ${c["black-400"] || "#3a3835"}; --cn-border: ${c["black-300"] || "#4a4744"}; --cn-accent: ${tb.logo}; }`);
  return parts.join("\n");
}

let win = null;                    // the window — shows our title bar
let view = null;                   // the Audiobookshelf web app, under the title bar
const wc = () => view.webContents;
let tray = null;                   // system tray icon
let isQuitting = false;            // true once the app is really quitting (not just hiding to tray)

let config = {};                   // { server, webUrl, themeMode } — saved in config.json
let clearHistoryOnLoad = false;    // drop the connect/error page from Back history
let lastNavAt = 0;

// "Remember me" state
let pendingLogin = null;           // credentials typed in, saved once the login succeeds
let reachedAppThisLaunch = false;  // got past the login page at least once this launch
let autoLoginUsed = false;         // auto sign-in is only attempted once per launch

// ---- small JSON file helpers ----------------------------------------------
const dataFile = (name) => path.join(app.getPath("userData"), name);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Could not save", file, err.message);
  }
}

// ---- remember window size / position --------------------------------------
// First start: 1280×720, but never more than 85% of the screen (with Windows display
// scaling a laptop screen can be only ~1280×700 usable), centred. A remembered size
// that's too big for the screen it opens on (e.g. a smaller monitor) is shrunk the same way.
function loadWindowState() {
  const s = readJson(dataFile("window-state.json"), {});
  const onScreen = Number.isFinite(s.x) && Number.isFinite(s.y) && screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return s.x >= a.x - 40 && s.y >= a.y - 40 && s.x < a.x + a.width - 120 && s.y < a.y + a.height - 120;
  });
  const area = (onScreen ? screen.getDisplayNearestPoint({ x: s.x, y: s.y }) : screen.getPrimaryDisplay()).workArea;
  const width = Math.min(s.width || 1280, Math.round(area.width * (s.width ? 1 : 0.85)));
  const height = Math.min(s.height || 720, Math.round(area.height * (s.height ? 1 : 0.85)));
  const state = { width, height, maximized: !!s.maximized };
  if (onScreen) {
    // Keep it fully on the screen.
    state.x = Math.min(Math.max(s.x, area.x), area.x + area.width - width);
    state.y = Math.min(Math.max(s.y, area.y), area.y + area.height - height);
  }
  // No position → Electron centres the window.
  return state;
}
function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  writeJson(dataFile("window-state.json"), { ...win.getNormalBounds(), maximized: win.isMaximized() });
}

// ---- "Remember me": saved login, encrypted with Windows' own protection ----
// (safeStorage uses Windows DPAPI — only your Windows account can decrypt it.)
const loginFile = () => dataFile("login.json");

function loadSavedLogin() {
  const d = readJson(loginFile(), null);
  if (!d || !d.data || d.server !== config.server) return null;   // saved for another server
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(d.data, "base64")));
  } catch {
    return null;   // e.g. portable copy moved to another PC — just type it again
  }
}
function saveLogin(creds) {
  if (!safeStorage.isEncryptionAvailable()) return;   // never store a password in plain text
  const data = safeStorage.encryptString(JSON.stringify({ username: creds.username, password: creds.password }));
  writeJson(loginFile(), { server: config.server, data: data.toString("base64") });
}
function forgetLogin() {
  pendingLogin = null;
  try { fs.unlinkSync(loginFile()); } catch {}
}

// Called on every page change. Once we're past the login page the sign-in
// worked, so a pending "Remember me" login gets saved.
function onServerPage(url) {
  if (!isServerUrl(url)) return;
  const pagePath = new URL(url).pathname.replace(/\/+$/, "");
  const rootPath = new URL(config.webUrl).pathname.replace(/\/+$/, "");
  if (/\/login$/i.test(pagePath) || pagePath === rootPath) return;   // login page, or the root that redirects
  reachedAppThisLaunch = true;
  if (pendingLogin) {
    saveLogin(pendingLogin);
    pendingLogin = null;
  }
}

// ---- page styles: bug fixes + theme ----------------------------------------
const themeKeys = new WeakMap();   // webContents → key of the inserted theme CSS
const themeId = () => (THEMES[config.themeMode] ? config.themeMode : "abs");
const currentTheme = () => THEMES[themeId()];

// Add our styles to a page. isNewPage = the page just (re)loaded, so anything
// inserted before is already gone. Runs one at a time per page, so quick theme
// switches can't leave an old theme's styles behind.
const cssQueues = new WeakMap();
function applyPageCss(contents, isNewPage) {
  const next = (cssQueues.get(contents) || Promise.resolve())
    .then(() => applyPageCssNow(contents, isNewPage))
    .catch(() => {});
  cssQueues.set(contents, next);
  return next;
}

async function applyPageCssNow(contents, isNewPage) {
  if (contents.isDestroyed()) return;
  if (isNewPage) {
    themeKeys.delete(contents);
    if (isServerUrl(contents.getURL())) {
      contents.insertCSS(ABS_CSS_FIXES).catch(() => {});
      await readWoodTexture(contents);   // before our theme replaces it
    }
  }
  // New theme in first, then the old one out: never a moment without one (with
  // Windows' contrast colours on, that gap let them paint parts of the page and stick).
  const oldKey = themeKeys.get(contents);
  themeKeys.delete(contents);
  const key = await contents.insertCSS(themeCss(themeId())).catch(() => null);
  if (key) themeKeys.set(contents, key);
  if (oldKey) await contents.removeInsertedCSS(oldKey).catch(() => {});
  // Let the page carry the colour setting into the e-book reader's frames (see preload.js).
  if (!contents.isDestroyed()) contents.send("desktop:sync-frames");
}

// Title bar buttons (drawn by Windows) and the web app's backdrop follow the theme.
function applyWindowColors() {
  const t = currentTheme();
  if (win && !win.isDestroyed()) {
    win.setTitleBarOverlay({ color: t.title.bg, symbolColor: t.title.fg, height: TITLE_H });
    win.setBackgroundColor(t.title.bg);
  }
  if (view) view.setBackgroundColor((t.colors && t.colors.primary) || BG);
  if (settingsView) settingsView.setBackgroundColor((t.colors && t.colors.primary) || BG);
}

// Re-apply the current theme to every open page (live, no reload).
function reapplyTheme() {
  applyWindowColors();
  for (const c of webContents.getAllWebContents()) {
    if (c.getType() === "window" || c.getType() === "browserView") applyPageCss(c, false);
  }
}

// Switch theme live (no reload, so playback isn't interrupted) and remember it.
function setTheme(id) {
  config = { ...config, themeMode: id };
  writeJson(dataFile("config.json"), config);
  reapplyTheme();
}

// Current bookshelf art (older versions had a wood on/off switch → "none").
function shelfArtId() {
  if (SHELF_ARTS[config.shelfArt]) return config.shelfArt;
  return config.woodShelf === false ? "none" : "classic";
}

// View → Bookshelf: pick the shelf art (live, remembered).
function setShelfArt(id) {
  config = { ...config, shelfArt: id };
  delete config.woodShelf;
  writeJson(dataFile("config.json"), config);
  reapplyTheme();
}

// ---- navigation helpers ----------------------------------------------------
function serverOrigin() {
  try { return new URL(config.webUrl).origin; } catch { return null; }
}
function isServerUrl(url) {
  const origin = serverOrigin();
  try { return !!origin && new URL(url).origin === origin; } catch { return false; }
}
function openExternal(url) {
  if (/^(https?|mailto):/i.test(String(url))) shell.openExternal(url);
}
function showConnectPage(mode, message) {
  wc().loadFile(path.join(__dirname, "connect.html"), { query: { mode, msg: message || "" } });
}
function loadServer() {
  clearHistoryOnLoad = true;
  wc().loadURL(config.webUrl);
}
function goHome() {
  if (config.webUrl) loadServer(); else showConnectPage("setup");
}
function navigate(direction, contents) {
  if (!view) return;
  const now = Date.now();
  if (now - lastNavAt < 350) return;   // side buttons can arrive twice (mouse event + app-command)
  lastNavAt = now;
  const h = (contents || wc()).navigationHistory;
  if (direction < 0 && h.canGoBack()) h.goBack();
  if (direction > 0 && h.canGoForward()) h.goForward();
}

// ---- view actions (used by the menu and the keyboard shortcuts) -----------
// ---- language of the desktop parts (menus, tray, dialogs, panel…) -----------
// Follows the language you use in Audiobookshelf (read from the web app), or the
// one picked in View → Language. Before you've signed in: Windows' language.
const uiLang = () => pickLang(config.langChoice && config.langChoice !== "auto"
  ? config.langChoice
  : (config.webLang || app.getLocale()));
const tr = (key, vars) => translator(uiLang())(key, vars);

// Tell every page (title bar, connect screen, the web app's extras) the new words.
function onLangChanged() {
  const s = stringsFor(uiLang());
  for (const c of webContents.getAllWebContents()) if (!c.isDestroyed()) c.send("desktop:strings", s);
  updateTrayTooltip();
  sendUpdateToTitleBar();
}
function setLangChoice(choice) {
  config = { ...config, langChoice: choice };
  writeJson(dataFile("config.json"), config);
  onLangChanged();
}
// Ask the web app which language it's showing (it can change on the Account page).
async function readWebLang(contents) {
  if (!contents || contents.isDestroyed() || !isServerUrl(contents.getURL())) return;
  try {
    const code = await contents.executeJavaScript(
      "(window.$nuxt && $nuxt.$languageCodes && $nuxt.$languageCodes.current) || ''");
    if (!code || code === config.webLang) return;
    const before = uiLang();
    config = { ...config, webLang: code };
    writeJson(dataFile("config.json"), config);
    if (uiLang() !== before) onLangChanged();
  } catch {}
}

// ---- pop-up notifications (View → Notifications) ------------------------------
// How long they stay, pausing while hovered, and where they appear — set on the
// web app's notification system in every page (the app itself and the overlay).
const TOAST_DURATIONS = [["short", 3000], ["normal", 5000], ["long", 10000], ["untilClosed", 0]];
const TOAST_POSITIONS = [["topRight", "top-right"], ["bottomRight", "bottom-right"], ["topCenter", "top-center"]];
const toastDuration = () => (TOAST_DURATIONS.some(([, ms]) => ms === config.toastDuration) ? config.toastDuration : 5000);
const toastPosition = () => (TOAST_POSITIONS.some(([, p]) => p === config.toastPosition) ? config.toastPosition : "top-right");
function applyToastSettings(contents, attempt = 0) {
  if (!contents || contents.isDestroyed() || !isServerUrl(contents.getURL())) return;
  const pause = config.toastPauseHover !== false;
  const opts = JSON.stringify({
    timeout: toastDuration() || false,   // false = stays until closed
    pauseOnHover: pause,
    pauseOnFocusLoss: pause,
    position: toastPosition(),
  });
  contents.executeJavaScript(
    `(() => { const t = window.$nuxt && $nuxt.$toast; if (t && t.updateDefaults) { t.updateDefaults(${opts}); return true; } return false; })()`)
    .then((ok) => { if (!ok && attempt < 10) setTimeout(() => applyToastSettings(contents, attempt + 1), 1500); })
    .catch(() => {});
}
function setToastSetting(key, value) {
  config = { ...config, [key]: value };
  writeJson(dataFile("config.json"), config);
  if (key === "toastThemed") reapplyTheme();
  else for (const c of webContents.getAllWebContents()) applyToastSettings(c);
}
function showTestToast() {
  if (!view) return;
  const contents = settingsView ? settingsView.webContents : wc();
  contents.executeJavaScript(
    `window.$nuxt && $nuxt.$toast && $nuxt.$toast.success(${JSON.stringify(tr("notif.testMsg"))})`).catch(() => {});
}
function notificationMenuItems() {
  return [
    {
      label: tr("notif.duration"),
      submenu: TOAST_DURATIONS.map(([key, ms]) => ({
        label: tr("notif." + key), type: "checkbox", checked: toastDuration() === ms,
        click: () => setToastSetting("toastDuration", ms),
      })),
    },
    {
      label: tr("notif.position"),
      submenu: TOAST_POSITIONS.map(([key, pos]) => ({
        label: tr("notif." + key), type: "checkbox", checked: toastPosition() === pos,
        click: () => setToastSetting("toastPosition", pos),
      })),
    },
    { label: tr("notif.pauseHover"), type: "checkbox", checked: config.toastPauseHover !== false,
      click: (item) => setToastSetting("toastPauseHover", item.checked) },
    { label: tr("notif.themed"), type: "checkbox", checked: config.toastThemed !== false,
      click: (item) => setToastSetting("toastThemed", item.checked) },
    { type: "separator" },
    { label: tr("notif.test"), click: showTestToast },
  ];
}

// ---- text size (zoom of the web app), remembered between starts ------------
const TEXT_SIZES = [["small", 0.9], ["normal", 1], ["large", 1.15], ["larger", 1.3], ["largest", 1.5]];
const textSize = () => (Number(config.textSize) > 0 ? Number(config.textSize) : 1);
function applyTextSize(contents) {
  if (!contents.isDestroyed() && isServerUrl(contents.getURL())) contents.setZoomFactor(textSize());
}
function setTextSize(f) {
  f = Math.round(Math.max(0.7, Math.min(2, f)) * 100) / 100;
  config = { ...config, textSize: f };
  writeJson(dataFile("config.json"), config);
  for (const c of webContents.getAllWebContents()) applyTextSize(c);
}
// Ctrl +/-/0 and Ctrl+mouse wheel: 10% steps.
function zoom(step) {
  setTextSize(step === 0 ? 1 : textSize() + step * 0.1);
}
function toggleFullScreen() {
  win.setFullScreen(!win.isFullScreen());
}
function toggleDevTools() {
  const c = wc();
  if (c.isDevToolsOpened()) c.closeDevTools(); else c.openDevTools({ mode: "detach" });
}

// Keyboard shortcuts — handled here so they work whether the title bar or the
// web app has focus (the menu only *shows* them).
function onShortcut(event, input) {
  if (input.type !== "keyDown") return;
  const key = input.key;
  const ctrl = input.control || input.meta;
  let action = null;
  if (key === "F5") action = () => wc().reload();
  else if (key === "F11") action = toggleFullScreen;
  else if (input.alt && !ctrl && key === "ArrowLeft") action = () => navigate(-1);
  else if (input.alt && !ctrl && key === "ArrowRight") action = () => navigate(1);
  else if (input.alt && !ctrl && key === "Home") action = goHome;
  else if (ctrl && input.shift && key.toLowerCase() === "i") action = toggleDevTools;
  else if (ctrl && !input.alt && (key === "=" || key === "+")) action = () => zoom(1);
  else if (ctrl && !input.alt && (key === "-" || key === "_")) action = () => zoom(-1);
  else if (ctrl && !input.alt && key === "0") action = () => zoom(0);
  if (action) {
    event.preventDefault();
    action();
  }
}

// ---- Start with Windows ----------------------------------------------------
// The startup entry must point at the real .exe: the installed app, or for the
// portable build the portable file itself (not its temporary unpacked copy).
// The path is quoted because it contains spaces (Electron doesn't quote it).
const loginItem = () => ({
  path: `"${process.env.PORTABLE_EXECUTABLE_FILE || process.execPath}"`,
  args: ["--hidden"],
});
const startsWithWindows = () => app.isPackaged && app.getLoginItemSettings(loginItem()).openAtLogin;
function setStartWithWindows(on) {
  if (!app.isPackaged) return;   // only the built app, not the development copy
  app.setLoginItemSettings({ openAtLogin: on, ...loginItem() });
  config.startWithWindows = on;
  writeJson(dataFile("config.json"), config);
}
// Re-register at every start, so the entry follows the .exe if it moved or was renamed
// (e.g. an update or a portable copy in a new folder).
function refreshStartWithWindows() {
  if (config.startWithWindows && !startsWithWindows()) setStartWithWindows(true);
}

// ---- system tray: keep playing with the window closed ---------------------
const closeToTray = () => config.closeToTray !== false;

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// What the official player is doing right now (reads its own player component
// and the media info it gives Windows).
async function playerState() {
  if (!view || view.webContents.isDestroyed()) return { active: false };
  try {
    return await view.webContents.executeJavaScript(`(() => {
      const el = document.getElementById('mediaPlayerContainer');
      const p = el && el.__vue__;
      if (!p) return { active: false };
      const m = navigator.mediaSession && navigator.mediaSession.metadata;
      return { active: true, playing: !!p.isPlaying, title: m ? m.title : '', artist: m ? m.artist : '',
        sleep: !!p.sleepTimerSet, sleepType: p.sleepTimerType, sleepLeft: p.sleepTimerRemaining || 0,
        hasChapters: !!(p.chapters && p.chapters.length) };
    })()`);
  } catch {
    return { active: false };
  }
}

// Send a command to the official player (the same ones Windows' media keys use).
function playerCommand(cmd) {
  const calls = {
    toggle: "p.isPlaying ? p.mediaSessionPause() : p.mediaSessionPlay()",
    back: "p.mediaSessionSeekBackward()",
    forward: "p.mediaSessionSeekForward()",
    prevChapter: "p.mediaSessionPreviousTrack()",
    nextChapter: "p.mediaSessionNextTrack()",
  };
  if (!calls[cmd] || !view) return;
  view.webContents.executeJavaScript(
    `(() => { const el = document.getElementById('mediaPlayerContainer'); const p = el && el.__vue__; if (p) { ${calls[cmd]}; } })()`
  ).catch(() => {});
}

// Sleep timer, using the official player's own timer (so the player shows it too).
// minutes = number of minutes, "chapter" = end of the current chapter, "cancel".
function sleepCommand(minutes) {
  let call;
  if (minutes === "cancel") call = "p.cancelSleepTimer()";
  else if (minutes === "chapter") call = "p.setSleepTimer({ timerType: 'chapter' })";
  else if (Number.isFinite(minutes) && minutes > 0) call = `p.setSleepTimer({ timerType: 'countdown', seconds: ${Math.round(minutes * 60)} })`;
  if (!call || !view) return;
  view.webContents.executeJavaScript(
    `(() => { const el = document.getElementById('mediaPlayerContainer'); const p = el && el.__vue__; if (p) { ${call}; } })()`
  ).catch(() => {});
  setTimeout(updateTrayTooltip, 300);
}

function sleepLabel(s) {
  if (!s.sleep) return "";
  return s.sleepType === "chapter" ? tr("tray.sleepChapter") : tr("tray.sleepIn", { n: Math.max(1, Math.ceil(s.sleepLeft / 60)) });
}

async function updateTrayTooltip() {
  if (!tray || tray.isDestroyed()) return;
  const s = await playerState();
  let tip = "ABS Desktop App";
  if (s.active && s.title) tip += `\n${s.playing ? "▶" : "❚❚"} ${s.title}${s.artist ? " — " + s.artist : ""}`;
  if (s.active && s.sleep) tip += `\n🌙 ${sleepLabel(s)}`;
  tray.setToolTip(tip.slice(0, 127));   // Windows limits tray tooltips to 127 characters
}

async function showTrayMenu() {
  const s = await playerState();
  const items = [];
  if (s.active) {
    if (s.title) items.push({ label: (s.title + (s.artist ? " — " + s.artist : "")).slice(0, 60), enabled: false });
    items.push(
      { label: s.playing ? tr("tray.pause") : tr("tray.play"), click: () => playerCommand("toggle") },
      { label: tr("tray.back"), click: () => playerCommand("back") },
      { label: tr("tray.forward"), click: () => playerCommand("forward") },
      { label: tr("tray.prevChapter"), click: () => playerCommand("prevChapter") },
      { label: tr("tray.nextChapter"), click: () => playerCommand("nextChapter") },
      { type: "separator" },
      {
        label: s.sleep ? tr("tray.sleepWith", { when: sleepLabel(s) }) : tr("tray.sleep"),
        submenu: [
          ...[15, 30, 45, 60, 90].map((min) => ({ label: tr("tray.minutes", { n: min }), click: () => sleepCommand(min) })),
          { type: "separator" },
          { label: tr("tray.endOfChapter"), enabled: s.hasChapters, click: () => sleepCommand("chapter") },
          { type: "separator" },
          { label: tr("tray.cancelSleep"), enabled: s.sleep, click: () => sleepCommand("cancel") },
        ],
      },
      { type: "separator" },
    );
  } else {
    items.push({ label: tr("tray.nothingPlaying"), enabled: false }, { type: "separator" });
  }
  items.push(
    { label: tr("tray.show"), click: showWindow },
    { type: "separator" },
    { label: tr("tray.quit"), click: () => app.quit() },
  );
  tray.popUpContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  tray = new Tray(ICON);
  tray.setToolTip("ABS Desktop App");
  tray.on("click", showWindow);
  tray.on("right-click", showTrayMenu);
  setInterval(updateTrayTooltip, 5000);   // keep "now playing" in the tooltip current
}

// ---- the window ------------------------------------------------------------
// Keep the web app filling everything below the title bar (all of it in full screen).
function layout() {
  if (!win || !view) return;
  const { width, height } = win.getContentBounds();
  const top = win.isFullScreen() ? 0 : TITLE_H;
  view.setBounds({ x: 0, y: top, width, height: Math.max(0, height - top) });
  if (settingsView) settingsView.setBounds(settingsBounds());
  // Menus close when the window changes size; a message box just follows it.
  if (uiOpen && uiOpen.kind === "menu") closeUi();
  if (uiOpen) uiView.setBounds({ x: 0, y: 0, width, height });
}

function createWindow() {
  const state = loadWindowState();
  const webPreferences = { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true };
  const theme = currentTheme();

  win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 560,
    title: "ABS Desktop App",
    icon: ICON,
    backgroundColor: theme.title.bg,
    show: false,
    // No Windows frame: we draw the title bar; Windows draws min/max/close in the theme's colours.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: theme.title.bg, symbolColor: theme.title.fg, height: TITLE_H },
    webPreferences,
  });
  if (state.maximized) win.maximize();
  // Portable: pinning the running app to the taskbar pins ABS-DA-Portable.exe, not the
  // temporary copy it runs from.
  if (process.env.PORTABLE_EXECUTABLE_FILE) {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE;
    win.setAppDetails({ appId: APP_ID, appIconPath: exe, appIconIndex: 0, relaunchCommand: `"${exe}"`, relaunchDisplayName: "ABS Desktop App" });
  }
  win.on("page-title-updated", (e) => e.preventDefault());   // window title follows the web app
  win.webContents.on("will-navigate", (e) => e.preventDefault());   // the title bar never navigates
  win.webContents.on("before-input-event", onShortcut);
  win.loadFile(path.join(__dirname, "titlebar.html"));
  win.once("ready-to-show", () => {
    if (startHidden) return;   // started with Windows → stay in the tray
    if (process.env.ABSDA_TEST_OFFSCREEN) {
      // For automated tests only: open far off-screen without taking focus, so the
      // person at the PC isn't disturbed (the window still draws for screenshots).
      win.setPosition(-20000, -20000);
      win.showInactive();
      return;
    }
    win.show();
    wc().focus();
  });
  // Closing hides to the tray (audio keeps playing) unless you're quitting or turned it off.
  win.on("close", (e) => {
    saveWindowState();
    if (isQuitting || !closeToTray() || !tray) return;
    e.preventDefault();
    win.hide();
    if (!config.trayHintShown) {
      tray.displayBalloon({
        iconType: "info",
        title: tr("tray.stillRunning"),
        content: tr("tray.stillRunningMsg"),
      });
      config = { ...config, trayHintShown: true };
      writeJson(dataFile("config.json"), config);
    }
  });
  win.on("focus", () => {
    win.webContents.send("titlebar:focus", true);
    if (view) { wc().focus(); readWebLang(wc()); }
  });
  win.on("blur", () => {
    win.webContents.send("titlebar:focus", false);
    if (uiOpen && uiOpen.kind === "menu") closeUi();   // like Windows' own menus
  });

  // The Audiobookshelf web app, in a panel under the title bar.
  // backgroundThrottling off: when the window is hidden in the tray, the web app's
  // timers (listening-progress sync) keep running at full speed.
  view = new WebContentsView({ webPreferences: { ...webPreferences, backgroundThrottling: false } });
  view.setBackgroundColor((theme.colors && theme.colors.primary) || BG);
  win.contentView.addChildView(view);
  layout();
  for (const ev of ["resize", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"]) win.on(ev, layout);

  const contents = view.webContents;
  contents.on("before-input-event", onShortcut);

  // Title bar text follows the web app's page title.
  contents.on("page-title-updated", (_e, title) => {
    win.setTitle(title);
    win.webContents.send("titlebar:title", title);
  });

  guardLinks(contents);

  // Settings pages open in their own window, so this page (and the player) stay put.
  // (Clicks on settings links are caught in preload.js; this catches the rest.)
  contents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (!isMainFrame || !isSettingsUrl(url)) return;
    openSettings(url);
    if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
    else routeMain("/");
  });

  // Server unreachable → friendly page with Retry / Change server.
  contents.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || String(url).startsWith("file:")) return; // -3 = aborted (normal)
    showConnectPage("error", `${desc} (${code})`);
  });

  // After connecting/retrying, forget the local page so Back doesn't return to it.
  contents.on("did-finish-load", () => {
    setTimeout(() => readWebLang(contents), 2500);   // once the web app has loaded its language
    checkPageStyles(contents);
    if (clearHistoryOnLoad && isServerUrl(contents.getURL())) {
      clearHistoryOnLoad = false;
      contents.navigationHistory.clear();
    }
  });

  // Mouse side buttons — Windows delivers these as app commands.
  win.on("app-command", (_e, cmd) => {
    if (cmd === "browser-backward") navigate(-1);
    if (cmd === "browser-forward") navigate(1);
  });

  // Track page changes (the web app is single-page, so in-page changes count too).
  contents.on("did-navigate", (_e, url) => onServerPage(url));
  contents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (!isMainFrame) return;
    onServerPage(url);
    readWebLang(contents);   // e.g. you just changed the language on the Account page
  });

  if (!app.isPackaged) contents.on("did-navigate", (_e, url) => console.log("[nav]", url));

  if (config.webUrl) loadServer(); else showConnectPage("setup");
}

// Your server stays in the app; links to other sites open in your browser.
// Exception: single sign-on (OpenID). Your server redirects to its login provider
// (Authentik, Keycloak, Authelia…); that login runs in the app until it sends you back.
function guardLinks(contents) {
  let ssoLogin = false;
  let navStart = "";   // where the current page load began (before any redirects)
  contents.on("did-start-navigation", (e) => {
    if (e.isMainFrame && !e.isSameDocument && !e.url.startsWith("about:")) navStart = e.url;
  });
  contents.on("will-redirect", (e) => {
    if (e.isMainFrame && isServerUrl(navStart) && !isServerUrl(e.url)) ssoLogin = true;
  });
  contents.on("did-navigate", (_e, url) => { if (isServerUrl(url)) ssoLogin = false; });
  contents.on("will-navigate", (e, url) => {
    if (!isServerUrl(url) && !(ssoLogin && /^https?:/i.test(url))) {
      e.preventDefault();
      openExternal(url);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isServerUrl(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { icon: ICON, backgroundColor: BG, autoHideMenuBar: true } };
    }
    openExternal(url);
    return { action: "deny" };
  });
}

// ---- settings overlay ------------------------------------------------------
// The web app's settings (everything under /config: server settings, libraries,
// users, stats…) and the Upload page open in a panel over the app, inside the
// same window, instead of replacing the page you're on. The app behind is dimmed;
// close with ✕, Esc or a click on the dimmed area.
let settingsView = null;

// The web app's path for a page, e.g. "/config/libraries" (without the /audiobookshelf base).
function appPath(url) {
  try {
    const root = new URL(config.webUrl).pathname.replace(/\/+$/, "");
    const u = new URL(url);
    const p = u.pathname.startsWith(root + "/") || u.pathname === root ? u.pathname.slice(root.length) : u.pathname;
    return (p || "/") + u.search;
  } catch { return "/"; }
}
const isSettingsUrl = (url) => isServerUrl(url) && /^\/(config|upload|account)(\/|$|\?)/.test(appPath(url));

// Show a page of the web app in the main window, without reloading it.
function routeMain(p) {
  if (!view) return;
  wc().executeJavaScript(`window.$nuxt && $nuxt.$router.push(${JSON.stringify(p)}).catch(() => {})`).catch(() => {});
}

// The panel: centred over the app with a margin all round (it follows the window size).
function settingsBounds() {
  const { width, height } = win.getContentBounds();
  const top = win.isFullScreen() ? 0 : TITLE_H;
  const areaH = Math.max(0, height - top);
  const w = Math.min(1280, Math.max(320, width - 2 * Math.max(24, Math.round(width * 0.04))));
  const h = Math.max(240, areaH - 2 * Math.max(20, Math.round(areaH * 0.04)));
  return { x: Math.round((width - w) / 2), y: top + Math.round((areaH - h) / 2), width: w, height: h };
}

// Inside the panel: the web app's top bar and side menu are hidden; our header
// (title + ✕, added by preload.js) sits on top; a thin frame outlines the panel.
const SETTINGS_BAR_H = 44;
const SETTINGS_CSS = `
  div:has(> #appbar) { height: ${SETTINGS_BAR_H}px !important; visibility: hidden !important; }
  #page-wrapper { height: calc(100% - ${SETTINGS_BAR_H}px) !important; }
  #page-wrapper .fixed.top-16 { top: ${SETTINGS_BAR_H}px !important; }
  div:has(> #siderail-buttons-container) { display: none !important; }
  #app-content.has-siderail { width: 100% !important; max-width: 100% !important; margin-left: 0 !important; left: 0 !important; }
  html::after { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 2147483001;
    border: 1px solid rgba(255, 255, 255, .22); }
  /* Settings menu: the open page gets the same marker as the app's side menu. */
  #page-wrapper .fixed.top-16 a > div.absolute.left-0 { display: none !important; }
  #page-wrapper .fixed.top-16 a[aria-current="page"] { background: rgba(255, 255, 255, .09) !important; }
  #page-wrapper .fixed.top-16 a[aria-current="page"] > div.absolute.left-0 {
    display: block !important; width: 5px !important; background: var(--tb-logo, #f0a848) !important; border-radius: 0 4px 4px 0; }
  #page-wrapper .fixed.top-16 a[aria-current="page"] p {
    font-weight: 600; text-decoration: underline; text-decoration-color: var(--tb-logo, #f0a848);
    text-decoration-thickness: 2px; text-underline-offset: 5px; }
`;

function openSettings(url) {
  if (!win || !view) return;
  if (settingsView) {
    // Already open: go to the asked-for page.
    settingsView.webContents.executeJavaScript(
      `window.$nuxt && $nuxt.$router.push(${JSON.stringify(appPath(url))}).catch(() => {})`).catch(() => {});
    settingsView.webContents.focus();
    return;
  }
  const t = currentTheme();
  settingsView = new WebContentsView({
    // backgroundThrottling off like the app's own view, so it always draws at once.
    webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  settingsView.setBackgroundColor((t.colors && t.colors.primary) || BG);
  win.contentView.addChildView(settingsView);   // on top of the app
  settingsView.setBounds(settingsBounds());
  const sc = settingsView.webContents;
  guardLinks(sc);
  sc.on("before-input-event", onShortcut);
  sc.on("dom-ready", () => sc.insertCSS(SETTINGS_CSS).catch(() => {}));
  // Leaving settings (e.g. a link to a book or the home page) → show that in the app.
  // (The login page is part of opening settings: the web app passes through it to
  // check your sign-in, then continues to the settings page.)
  const leave = (u) => {
    if (!isServerUrl(u) || isSettingsUrl(u)) return;
    const p = appPath(u);
    if (/^\/login(\/|$|\?)/.test(p)) {
      if (/[?&]redirect=/.test(p)) return;   // just checking your sign-in on the way in
      closeSettings();                        // you signed out (Account → Logout)
      if (view) wc().reload();
      return;
    }
    routeMain(p);
    closeSettings();
  };
  sc.on("did-navigate-in-page", (_e, u, isMainFrame) => { if (isMainFrame) leave(u); });
  sc.on("did-navigate", (_e, u) => leave(u));
  sc.loadURL(url);
  sc.focus();
  wc().send("desktop:overlay", true);   // dim the app behind (preload.js)
}

function closeSettings() {
  if (!settingsView) return;
  const v = settingsView;
  settingsView = null;
  if (win && !win.isDestroyed()) win.contentView.removeChildView(v);
  try { v.webContents.close(); } catch {}
  if (view) {
    wc().send("desktop:overlay", false);
    wc().focus();
    // A language picked on the Account page shows up in the app right away.
    wc().executeJavaScript("window.$nuxt && localStorage.getItem('lang') && $nuxt.$setLanguageCode(localStorage.getItem('lang'))")
      .catch(() => {}).finally(() => setTimeout(() => readWebLang(wc()), 500));
  }
}

// ---- menu (opened from the title bar) --------------------------------------
const REPO_URL = "https://github.com/Farathim89/abs-da";

// ---- troubleshooting: auto-repair, clear cache, copy diagnostics -------------
// Auto-repair: if the web app's styles didn't take effect after loading (e.g. a
// damaged copy in the cache shows the style sheet as text), empty the cache and
// reload — once per start. Test: the web app's "hidden" class must hide things.
let autoRepaired = false;
const STYLES_OK_JS = `(() => { const t = document.createElement("div"); t.className = "hidden";
  document.body.appendChild(t); const ok = getComputedStyle(t).display === "none"; t.remove(); return ok; })()`;
async function clearWebCache() {
  const ses = session.defaultSession;
  try { await ses.clearCache(); } catch {}
  try { await ses.clearCodeCaches({}); } catch {}
  try { await ses.clearStorageData({ storages: ["serviceworkers", "cachestorage", "shadercache"] }); } catch {}
}
function checkPageStyles(contents) {
  const looksBroken = async () => {
    if (contents.isDestroyed() || !isServerUrl(contents.getURL())) return false;
    try { return !(await contents.executeJavaScript(STYLES_OK_JS)); } catch { return false; }
  };
  setTimeout(async () => {
    // Ask twice, a moment apart, so a slow page isn't mistaken for a broken one.
    if (autoRepaired || !(await looksBroken())) return;
    await new Promise((r) => setTimeout(r, 2500));
    if (autoRepaired || !(await looksBroken())) return;
    autoRepaired = true;
    console.warn("Page styles missing — clearing the cache and reloading once.");
    await clearWebCache();
    if (!contents.isDestroyed()) contents.reloadIgnoringCache();
  }, 1500);
}

// App → Clear Cache and Restart…: empties the stored web files (cache, service
// workers, code cache) but keeps your server, saved login, sign-in and settings.
async function clearCacheAndRestart() {
  const { response } = await showDialog({
    type: "question",
    title: tr("app.clearCacheTitle"),
    message: tr("app.clearCacheTitle"),
    detail: tr("app.clearCacheMsg"),
    buttons: [tr("app.clearCacheOk"), tr("connect.cancel")],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return;
  await clearWebCache();
  restartApp();
}

// Restart the app. Portable: restart the .exe you started (not the unpacked copy in Temp).
function restartApp() {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE;
  app.relaunch(exe ? { execPath: exe, args: [] } : undefined);
  isQuitting = true;
  app.exit(0);
}

// App → Use hardware acceleration: saved, then applied on the next start.
async function setHardwareAcceleration(on) {
  config = { ...config, hardwareAcceleration: on };
  writeJson(dataFile("config.json"), config);
  const { response } = await showDialog({
    type: "question",
    title: tr("app.restartTitle"),
    message: tr("app.restartTitle"),
    detail: tr("app.restartMsg"),
    buttons: [tr("app.restartNow"), tr("update.later")],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) restartApp();
}

// Graphics card(s) for diagnostics, e.g. "NVIDIA 0x2484 (active)".
async function gpuSummary() {
  const vendors = { 0x8086: "Intel", 0x10de: "NVIDIA", 0x1002: "AMD", 0x1414: "Microsoft (software)", 0x5143: "Qualcomm" };
  try {
    const info = await app.getGPUInfo("basic");
    const list = (info.gpuDevice || []).map((d) =>
      `${vendors[d.vendorId] || "0x" + Number(d.vendorId).toString(16)} 0x${Number(d.deviceId).toString(16)}${d.active ? " (active)" : ""}`);
    return list.join(", ") || "unknown";
  } catch { return "unknown"; }
}

// Help → Copy Diagnostics: technical details for a bug report — no passwords,
// usernames or server address (paths are shortened to %USERPROFILE%).
async function copyDiagnostics() {
  const home = os.homedir();
  const short = (p) => (p ? String(p).split(home).join("%USERPROFILE%") : "");
  const kind = process.env.PORTABLE_EXECUTABLE_FILE ? "Portable" : app.isPackaged ? "Installed" : "Development";
  const lines = [
    `ABS-DA ${app.getVersion()} (${kind})`,
    `Electron ${process.versions.electron} / Chromium ${process.versions.chrome}`,
    `Windows ${process.getSystemVersion()} (${os.arch()}), display scale ${Math.round(screen.getPrimaryDisplay().scaleFactor * 100)}%`,
    `App: ${short(process.env.PORTABLE_EXECUTABLE_FILE || app.getPath("exe"))}`,
    `Data folder: ${short(app.getPath("userData"))}`,
    `Language: ${uiLang()} (choice: ${config.langChoice || "auto"}, Audiobookshelf: ${config.webLang || "?"}, Windows: ${app.getLocale()})`,
    `Theme: ${themeId()}, bookshelf: ${shelfArtId()}, text size: ${Math.round(textSize() * 100)}%`,
    `Graphics: ${await gpuSummary()}, hardware acceleration ${app.isHardwareAccelerationEnabled() ? "on" : "off"}`,
  ];
  if (config.webUrl) {
    try {
      const u = new URL(config.webUrl);
      lines.push(`Server: ${u.protocol.replace(":", "")}, port ${u.port || (u.protocol === "https:" ? 443 : 80)}, web app at ${u.pathname}`);
      const res = await net.fetch(`${String(config.server || u.origin).replace(/\/+$/, "")}/status`);
      const st = await res.json();
      lines.push(`Audiobookshelf ${st.serverVersion || "?"}, sign-in: ${(st.authMethods || []).join(", ") || "?"}, language: ${st.language || "?"}`);
    } catch (err) {
      lines.push(`Server status: couldn't read (${err.message})`);
    }
  } else {
    lines.push("Server: not set up yet");
  }
  if (view) lines.push(`Current page: ${appPath(wc().getURL())}`);
  lines.push(`Auto-repair this start: ${autoRepaired ? "yes (cache was cleared)" : "not needed"}`);
  const text = lines.join("\n");
  clipboard.writeText(text);
  const { response } = await showDialog({
    type: "info",
    title: tr("help.diagCopied"),
    message: tr("help.diagCopied"),
    detail: `${tr("help.diagCopiedMsg")}\n\n${text}`,
    buttons: [tr("about.ok"), tr("help.openReport")],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 1) openExternal(`${REPO_URL}/issues/new?template=bug_report.yml`);
}

// ---- updates ----------------------------------------------------------------
// Asks GitHub for the newest ABS-DA release (nothing personal is sent). If it's
// newer: an "Update x.y.z" pill in the title bar and a one-time Windows
// notification. Clicking either offers one-click install:
//  - installed app: downloads the new Setup and runs it silently, then restarts;
//  - portable: downloads the new portable .exe into the same folder, swaps it for
//    the old one once the app has closed, and starts it (abs-da-data is kept).
// Every download is checked against the SHA-256 fingerprint GitHub publishes for
// the file; on a mismatch it's deleted and nothing changes. Nothing installs
// without a click. Automatic checks can be turned off (App → Check for updates
// automatically); Help → Check for Updates… always works.
const RELEASES_API = "https://api.github.com/repos/Farathim89/abs-da/releases/latest";
let latestRelease = null;   // { version, url, asset } when GitHub has a newer version
let updateBusy = false;     // downloading / installing right now
const autoUpdateCheck = () => config.updateCheck !== false;
const appKind = () => (process.env.PORTABLE_EXECUTABLE_FILE ? "portable" : app.isPackaged ? "installed" : "dev");

// "2.10.0" vs "2.9.1" → true when a is newer than b.
function isNewer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// The release file this copy of the app can update itself with (null = can't).
function pickAsset(assets) {
  const want = appKind() === "portable" ? /^ABS-DA-Portable-[\d.]+\.exe$/i
    : appKind() === "installed" ? /^ABS-DA-Setup-[\d.]+\.exe$/i : null;
  const a = want && (assets || []).find((x) => want.test(x.name));
  if (!a) return null;
  return {
    name: a.name,
    url: a.browser_download_url,
    size: a.size,
    sha256: String(a.digest || "").replace(/^sha256:/i, "").toLowerCase() || null,
  };
}

// Title bar pill: "Update 2.3.0", or the download progress while installing.
function sendUpdateToTitleBar(progressText) {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("titlebar:update", latestRelease
    ? { label: progressText || tr("update.pill", { version: latestRelease.version }),
        tip: tr("update.newMsg", { version: latestRelease.version, current: app.getVersion() }) }
    : null);
}

function openUpdatePage() {
  openExternal(latestRelease ? latestRelease.url : `${REPO_URL}/releases/latest`);
}

// "Update available" — with Install now when this copy can update itself.
async function showUpdateDialog() {
  if (!latestRelease || updateBusy) return;
  showWindow();
  const canInstall = !!latestRelease.asset;
  const buttons = canInstall
    ? [tr("update.installNow"), tr("update.notes"), tr("update.later")]
    : [tr("update.download"), tr("update.later")];
  const { response } = await showDialog({
    type: "info",
    title: tr("update.newTitle"),
    message: tr("update.newTitle"),
    detail: tr("update.newMsg", { version: latestRelease.version, current: app.getVersion() }) +
      (canInstall ? "\n\n" + tr("update.installMsg") : ""),
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  });
  if (canInstall && response === 0) installUpdate();
  else if ((canInstall && response === 1) || (!canInstall && response === 0)) openUpdatePage();
}

// Download to `dest` with progress in the title bar; returns the file's SHA-256.
async function downloadFile(url, dest, size) {
  const res = await net.fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || size || 0;
  const hash = require("crypto").createHash("sha256");
  const out = fs.createWriteStream(dest);
  const reader = res.body.getReader();
  let got = 0;
  let lastPct = -1;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
      got += chunk.length;
      const pct = total ? Math.floor((got / total) * 100) : 0;
      if (pct !== lastPct) { lastPct = pct; sendUpdateToTitleBar(tr("update.downloading", { percent: pct })); }
    }
  } finally {
    await new Promise((r) => out.end(r));
  }
  if (size && got !== size) throw new Error(`size ${got} ≠ ${size}`);
  return hash.digest("hex");
}

// ---- desktop shortcut (portable) ----------------------------------------------
// App → Create Desktop Shortcut. The app keeps "its" shortcut pointing at the right
// .exe, also when an update renames the file once.
const desktopShortcutPath = () => path.join(app.getPath("desktop"), "ABS Desktop App.lnk");
function createDesktopShortcut() {
  const exe = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!exe) return;
  const ok = shell.writeShortcutLink(desktopShortcutPath(), "replace", {
    target: exe, cwd: path.dirname(exe), icon: exe, iconIndex: 0,
    description: "ABS Desktop App", appUserModelId: APP_ID,
  });
  showDialog({
    type: ok ? "info" : "warning", title: tr("app.desktopShortcut"), message: tr("app.desktopShortcut"),
    detail: ok ? tr("app.shortcutDone") : tr("app.shortcutFailed"), buttons: [tr("about.ok")],
  });
}
function repointDesktopShortcut(oldExe, newExe) {
  if (oldExe === newExe) return;
  try {
    const lnk = desktopShortcutPath();
    if (!fs.existsSync(lnk)) return;
    const cur = shell.readShortcutLink(lnk);
    if (String(cur.target).toLowerCase() !== String(oldExe).toLowerCase()) return;   // not ours / points elsewhere
    shell.writeShortcutLink(lnk, "update", { target: newExe, icon: newExe, iconIndex: 0, cwd: path.dirname(newExe) });
  } catch {}
}

// Start a program that outlives this app. The portable's launcher closes everything
// the app started when it quits, so Windows (WMI) is asked to start it independently.
const psQuote = (str) => "'" + String(str).replace(/'/g, "''") + "'";
const psEncoded = (script) => Buffer.from(script, "utf16le").toString("base64");
function launchIndependent(commandLine) {
  const inner = "$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create" +
    " -Arguments @{ CommandLine = " + psQuote(commandLine) + " }; exit [int]$r.ReturnValue";
  // If WMI can't start it, start it directly (fine for the installed app).
  const direct = () => require("child_process").spawn(commandLine, [],
    { shell: true, detached: true, stdio: "ignore", windowsHide: true }).unref();
  return new Promise((resolve) => {
    const p = require("child_process").spawn("powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", psEncoded(inner)],
      { windowsHide: true, stdio: "ignore" });
    const t = setTimeout(() => { direct(); resolve(); }, 15000);
    p.on("exit", (code) => { clearTimeout(t); if (code !== 0) direct(); resolve(); });
    p.on("error", () => { clearTimeout(t); direct(); resolve(); });
  });
}

async function installUpdate() {
  if (!latestRelease || !latestRelease.asset || updateBusy) return;
  updateBusy = true;
  const { asset, version } = latestRelease;
  const portable = appKind() === "portable";
  const dir = portable ? process.env.PORTABLE_EXECUTABLE_DIR : path.join(os.tmpdir(), "abs-da-update");
  // Portable: download beside the app under a hidden name, then put it in place of the
  // old .exe (see below). Installer: keep the release's own file name in Temp.
  const target = portable ? path.join(dir, ".abs-da-update.exe") : path.join(dir, asset.name);
  const part = target + ".download";
  try {
    fs.mkdirSync(dir, { recursive: true });
    const sha = await downloadFile(asset.url, part, asset.size);
    if (asset.sha256 && sha !== asset.sha256) {
      try { fs.unlinkSync(part); } catch {}
      throw Object.assign(new Error("checksum mismatch"), { verify: true });
    }
    try { fs.unlinkSync(target); } catch {}
    fs.renameSync(part, target);
    sendUpdateToTitleBar(tr("update.installing"));
    config = { ...config, updatedFrom: app.getVersion() };
    writeJson(dataFile("config.json"), config);

    if (portable) {
      // The new version takes the old file's place, so shortcuts, taskbar pins and
      // "Start with Windows" keep working. Only the default versioned name
      // ("ABS-DA-Portable-2.3.2.exe") becomes the plain "ABS-DA-Portable.exe" (once);
      // a name you chose yourself is kept.
      const old = process.env.PORTABLE_EXECUTABLE_FILE;
      const final = /^ABS-DA-Portable-[\d.]+\.exe$/i.test(path.basename(old)) ? path.join(dir, "ABS-DA-Portable.exe") : old;
      repointDesktopShortcut(old, final);
      // A small hidden PowerShell waits for this app to close (Windows lets go of the
      // old .exe), moves the new one into place and starts it.
      const script =
        `$old = ${psQuote(old)}; $new = ${psQuote(target)}; $final = ${psQuote(final)};` +
        "for ($i = 0; $i -lt 120; $i++) { try {" +
        " if (($old -ine $final) -and (Test-Path -LiteralPath $old)) { Remove-Item -LiteralPath $old -Force -ErrorAction Stop };" +
        " Move-Item -LiteralPath $new -Destination $final -Force -ErrorAction Stop; break" +
        " } catch { Start-Sleep -Milliseconds 500 } };" +
        "Start-Process -FilePath $final";
      await launchIndependent(
        "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand " + psEncoded(script));
    } else {
      // Silent install of the new Setup; it starts the app again when done.
      await launchIndependent(`"${target}" /S --updated --force-run`);
    }
    isQuitting = true;
    setTimeout(() => app.quit(), 300);
  } catch (err) {
    updateBusy = false;
    try { fs.unlinkSync(part); } catch {}
    sendUpdateToTitleBar();
    const verify = err && err.verify;
    const { response } = await showDialog({
      type: "warning",
      title: tr("update.installFailed"),
      message: tr("update.installFailed"),
      detail: verify ? tr("update.verifyFailed") : tr("update.installFailedMsg"),
      buttons: [tr("update.notes"), tr("about.ok")],
      defaultId: 1,
      cancelId: 1,
    });
    if (response === 0) openUpdatePage();
  }
}

// manual = from Help → Check for Updates… (then always say what was found).
async function checkForUpdates(manual) {
  if (updateBusy) return;
  try {
    const res = await net.fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rel = await res.json();
    const version = String(rel.tag_name || "").replace(/^v/i, "");
    if (version && isNewer(version, app.getVersion())) {
      latestRelease = { version, url: rel.html_url || `${REPO_URL}/releases/latest`, asset: pickAsset(rel.assets) };
      sendUpdateToTitleBar();
      if (manual) {
        showUpdateDialog();
      } else if (config.updateNotified !== version && Notification.isSupported()) {
        // Tell once per new version.
        config = { ...config, updateNotified: version };
        writeJson(dataFile("config.json"), config);
        const n = new Notification({
          title: tr("update.newTitle"),
          body: tr("update.newMsg", { version, current: app.getVersion() }),
          icon: ICON,
        });
        n.on("click", showUpdateDialog);
        n.show();
      }
    } else {
      latestRelease = null;
      sendUpdateToTitleBar();
      if (manual) {
        showDialog({
          type: "info", title: tr("update.upToDate"), message: tr("update.upToDate"),
          detail: tr("update.upToDateMsg", { version: app.getVersion() }), buttons: [tr("about.ok")],
        });
      }
    }
  } catch {
    if (manual) {
      showDialog({
        type: "warning", title: tr("update.failed"), message: tr("update.failed"),
        detail: tr("update.failedMsg"), buttons: [tr("about.ok")],
      });
    }
  }
}

// Automatic checks: shortly after start, then twice a day. Also: after an update,
// say so once, and tidy up a downloaded installer.
function startUpdateChecks() {
  if (config.updatedFrom && config.updatedFrom !== app.getVersion()) {
    const from = config.updatedFrom;
    config = { ...config, updatedFrom: null };
    writeJson(dataFile("config.json"), config);
    if (Notification.isSupported()) {
      new Notification({ title: "ABS Desktop App", body: tr("update.done", { version: app.getVersion(), from }), icon: ICON }).show();
    }
    if (appKind() === "installed") {
      try { fs.rmSync(path.join(os.tmpdir(), "abs-da-update"), { recursive: true, force: true }); } catch {}
    }
  }
  setTimeout(() => { if (autoUpdateCheck()) checkForUpdates(false); }, 10000);
  setInterval(() => { if (autoUpdateCheck()) checkForUpdates(false); }, 12 * 60 * 60 * 1000);
}

async function showAbout() {
  const { response } = await showDialog({
    type: "info",
    title: tr("about.title"),
    message: `ABS Desktop App (ABS-DA) ${app.getVersion()}`,
    detail:
      `${tr("about.tagline")}\n${tr("about.license")}\n${tr("about.credit")}\n\n` +
      `${tr("about.server", { server: config.server || tr("about.notSet") })}\nElectron ${process.versions.electron}`,
    buttons: [tr("about.ok"), tr("about.github")],
    defaultId: 0,
    cancelId: 0,
  });
  if (response === 1) openExternal(REPO_URL);
}

// Shortcuts are shown in the menu but handled by onShortcut, so they never fire twice.
const shortcut = (accelerator) => ({ accelerator, registerAccelerator: false });

// View → Theme: one tick-item per theme, "Windows contrast colours" set apart at the end.
// (Ticks, not radio buttons: Windows treats each separated group as its own radio
// group and would tick the first item of every group.)
function themeMenuItems() {
  const items = [];
  for (const [id, t] of Object.entries(THEMES)) {
    if (t.contrast) items.push({ type: "separator" });
    items.push({ label: tr("theme." + id), type: "checkbox", checked: themeId() === id, click: () => setTheme(id) });
  }
  return items;
}

// View → Bookshelf: one tick-item per shelf art, with a separator between groups
// (wood · stone · materials · scenes · none).
function shelfMenuItems() {
  const items = [];
  let lastGroup = null;
  for (const [id, a] of Object.entries(SHELF_ARTS)) {
    if (lastGroup && a.group !== lastGroup) items.push({ type: "separator" });
    lastGroup = a.group;
    items.push({ label: tr("shelf." + id), type: "checkbox", checked: shelfArtId() === id, click: () => setShelfArt(id) });
  }
  return items;
}

// View → Language: follow Audiobookshelf, or pick one.
function languageMenuItems() {
  const choice = config.langChoice || "auto";
  return [
    { label: tr("view.langAuto"), type: "checkbox", checked: choice === "auto", click: () => setLangChoice("auto") },
    { type: "separator" },
    ...LANGUAGES.map((code) => ({
      label: translator(code)("lang.name"), type: "checkbox", checked: choice === code, click: () => setLangChoice(code),
    })),
  ];
}

// Built fresh each time it opens, so the ticks (and the language) are always current.
// The order of the top-level menus must match the buttons in titlebar.html.
// (Drawn by ui.html, not Windows; same item format as Electron menu templates.)
function menuTemplate() {
  return ([
    {
      label: tr("menu.app"),
      submenu: [
        { label: tr("app.home"), ...shortcut("Alt+Home"), click: goHome },
        { label: tr("app.changeServer"), click: () => showConnectPage("change") },
        ...(appKind() === "portable" ? [{ label: tr("app.desktopShortcut"), click: createDesktopShortcut }] : []),
        {
          label: tr("app.forgetLogin"),
          click: () => {
            forgetLogin();
            showDialog({ type: "info", title: tr("app.forgotTitle"), message: tr("app.forgotMsg"), buttons: [tr("about.ok")] });
          },
        },
        {
          label: tr("app.keepInTray"),
          type: "checkbox",
          checked: closeToTray(),
          click: (item) => {
            config = { ...config, closeToTray: item.checked };
            writeJson(dataFile("config.json"), config);
          },
        },
        {
          label: app.isPackaged ? tr("app.startWithWindows") : tr("app.startWithWindowsDev"),
          type: "checkbox",
          enabled: app.isPackaged,
          checked: startsWithWindows(),
          click: (item) => setStartWithWindows(item.checked),
        },
        {
          label: tr("update.auto"),
          type: "checkbox",
          checked: autoUpdateCheck(),
          click: (item) => {
            config = { ...config, updateCheck: item.checked };
            writeJson(dataFile("config.json"), config);
            if (item.checked) checkForUpdates(false);
          },
        },
        { type: "separator" },
        { label: tr("app.reload"), ...shortcut("F5"), click: () => wc().reload() },
        { label: tr("app.clearCache"), click: clearCacheAndRestart },
        {
          label: tr("app.hwAccel"),
          type: "checkbox",
          checked: config.hardwareAcceleration !== false,
          click: (item) => setHardwareAcceleration(item.checked),
        },
        { type: "separator" },
        { label: tr("app.exit"), click: () => app.quit() },
      ],
    },
    {
      label: tr("menu.edit"),
      submenu: [
        { label: tr("edit.undo"), ...shortcut("Ctrl+Z"), click: () => wc().undo() },
        { label: tr("edit.redo"), ...shortcut("Ctrl+Y"), click: () => wc().redo() },
        { type: "separator" },
        { label: tr("edit.cut"), ...shortcut("Ctrl+X"), click: () => wc().cut() },
        { label: tr("edit.copy"), ...shortcut("Ctrl+C"), click: () => wc().copy() },
        { label: tr("edit.paste"), ...shortcut("Ctrl+V"), click: () => wc().paste() },
        { label: tr("edit.selectAll"), ...shortcut("Ctrl+A"), click: () => wc().selectAll() },
      ],
    },
    {
      label: tr("menu.view"),
      submenu: [
        { label: tr("view.bigger"), ...shortcut("Ctrl+="), click: () => zoom(1) },
        { label: tr("view.smaller"), ...shortcut("Ctrl+-"), click: () => zoom(-1) },
        { label: tr("view.normalSize"), ...shortcut("Ctrl+0"), click: () => zoom(0) },
        { type: "separator" },
        {
          label: tr("view.textSize"),
          submenu: TEXT_SIZES.map(([name, f]) => ({
            label: `${tr("size." + name)} (${Math.round(f * 100)}%)`, type: "checkbox",
            checked: Math.abs(textSize() - f) < 0.001, click: () => setTextSize(f),
          })),
        },
        { label: tr("view.theme"), submenu: themeMenuItems() },
        { label: tr("view.bookshelf"), submenu: shelfMenuItems() },
        { label: tr("view.notifications"), submenu: notificationMenuItems() },
        { label: tr("view.scanButton"), type: "checkbox", checked: config.scanButton !== false,
          click: (item) => setScanButton(item.checked) },
        { label: tr("view.language"), submenu: languageMenuItems() },
        { type: "separator" },
        { label: tr("view.fullScreen"), ...shortcut("F11"), click: toggleFullScreen },
      ],
    },
    {
      label: tr("menu.navigate"),
      submenu: [
        { label: tr("nav.back"), ...shortcut("Alt+Left"), click: () => navigate(-1) },
        { label: tr("nav.forward"), ...shortcut("Alt+Right"), click: () => navigate(1) },
      ],
    },
    {
      label: tr("menu.help"),
      submenu: [
        { label: tr("help.openInBrowser"), click: () => openExternal(wc().getURL()) },
        { label: tr("help.docs"), click: () => openExternal("https://www.audiobookshelf.org/docs") },
        { type: "separator" },
        { label: tr("help.report"), click: () => openExternal(`${REPO_URL}/issues/new/choose`) },
        { label: tr("help.github"), click: () => openExternal(REPO_URL) },
        { label: tr("update.check"), click: () => checkForUpdates(true) },
        { label: tr("help.diagnostics"), click: copyDiagnostics },
        { type: "separator" },
        { label: tr("help.devTools"), ...shortcut("Ctrl+Shift+I"), click: toggleDevTools },
        { type: "separator" },
        { label: tr("help.about"), click: showAbout },
      ],
    },
  ]);
}

// Only grant the browser permissions the web app actually needs.
function hardenSession() {
  const allowed = new Set(["fullscreen", "clipboard-sanitized-write", "clipboard-read", "notifications"]);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
}

// ---- messages from the app's local pages (title bar, connect/error screen) -
// The bridge is only exposed to the app's own local pages, and we double-check
// the sender here so the remote web app can never use it.
const fromLocalPage = (e) => {
  try { return e.senderFrame.url.startsWith("file:"); } catch { return false; }
};

ipcMain.handle("desktop:get-config", (e) =>
  fromLocalPage(e) ? { server: config.server || "", hasServer: !!config.webUrl } : null
);

ipcMain.handle("desktop:connect", async (e, input) => {
  if (!fromLocalPage(e)) return { ok: false, error: tr("connect.err.notAllowed") };
  const base = normalizeServer(input);
  if (!base) return { ok: false, error: tr("connect.err.badAddress") };
  const res = await probeServer(base);
  if (!res.ok) return { ok: false, error: tr("connect.err." + res.code) };
  config = { ...config, server: base, webUrl: res.webUrl };   // keep other settings (theme)
  writeJson(dataFile("config.json"), config);
  setImmediate(loadServer);   // reply first, then leave the connect page
  return { ok: true };
});

ipcMain.handle("desktop:retry", (e) => {
  if (fromLocalPage(e) && config.webUrl) setImmediate(loadServer);
});

// Title bar: current page title, and opening one of the menus under its button.
ipcMain.handle("titlebar:get-title", (e) => (fromLocalPage(e) && view ? wc().getTitle() : ""));

ipcMain.handle("titlebar:menu", (e, { index, rects } = {}) => {
  if (!win || e.sender !== win.webContents || !Array.isArray(rects)) return;
  return showMenus(Number(index) || 0, rects);
});

// ---- themed menus and message boxes ------------------------------------------
// Windows' own menus and message boxes can't take the theme's colours, so ui.html
// draws them in a see-through layer over the whole window (shown only while one is
// open). Message boxes take the same options as dialog.showMessageBox and wait their
// turn; if the layer can't load, Windows' own message box is used.
let uiView = null;
let uiLoaded = null;      // Promise<boolean>: ui.html is ready
let uiOpen = null;        // { kind: "menu", resolve, items } | { kind: "dialog", resolve, cancelId }
const dialogQueue = [];

function ensureUi() {
  if (uiView) return uiLoaded;
  uiView = new WebContentsView({ webPreferences: { preload: PRELOAD, contextIsolation: true, nodeIntegration: false, sandbox: true } });
  uiView.setBackgroundColor("#00000000");
  uiView.setVisible(false);
  win.contentView.addChildView(uiView);
  uiView.webContents.on("will-navigate", (ev) => ev.preventDefault());
  uiLoaded = uiView.webContents.loadFile(path.join(__dirname, "ui.html")).then(() => true, () => false);
  return uiLoaded;
}
function showUiLayer() {
  const { width, height } = win.getContentBounds();
  uiView.setBounds({ x: 0, y: 0, width, height });
  win.contentView.addChildView(uiView);   // (again) on top of everything
  uiView.setVisible(true);
  uiView.webContents.focus();
}
function closeUi(result) {
  const open = uiOpen;
  if (!open) return;
  uiOpen = null;
  if (uiView) { uiView.webContents.send("ui:clear"); uiView.setVisible(false); }
  if (win && !win.isDestroyed()) {
    win.webContents.send("titlebar:menu-open", -1);
    (settingsView ? settingsView.webContents : view ? wc() : win.webContents).focus();
  }
  open.resolve(result);
  setImmediate(pumpDialogs);
}

// Title-bar menus: the template turned into plain data (+ the click handlers kept here).
function menuData(template, handlers) {
  const accel = (a) => (a ? String(a).replace(/\bLeft\b/, "←").replace(/\bRight\b/, "→") : "");
  const walk = (items) => items.filter((it) => it && it.visible !== false).map((it) => {
    if (it.type === "separator") return { type: "separator" };
    const id = handlers.push(it) - 1;
    return {
      id, label: String(it.label || ""), enabled: it.enabled !== false, checked: !!it.checked, accel: accel(it.accelerator),
      type: it.submenu ? "submenu" : it.type === "checkbox" ? "checkbox" : "normal",
      submenu: it.submenu ? walk(it.submenu) : undefined,
    };
  });
  return template.map((top) => ({ label: top.label, items: walk(top.submenu || []) }));
}
async function showMenus(index, rects) {
  if (uiOpen || !(await ensureUi()) || uiOpen) return;
  const handlers = [];
  const menus = menuData(menuTemplate(), handlers);
  return new Promise((resolve) => {
    uiOpen = { kind: "menu", resolve, handlers };
    showUiLayer();
    uiView.webContents.send("ui:menu", { menus, index, rects });
  });
}
const fromUi = (e) => uiView && e.sender === uiView.webContents;
ipcMain.on("ui:menu-switch", (e, index) => {
  if (fromUi(e) && uiOpen && uiOpen.kind === "menu") win.webContents.send("titlebar:menu-open", index);
});
ipcMain.on("ui:menu-click", (e, id) => {
  if (!fromUi(e) || !uiOpen || uiOpen.kind !== "menu") return;
  const item = uiOpen.handlers[id];
  closeUi();
  // Like an Electron menu item: a checkbox flips before its click handler runs.
  if (item && item.enabled !== false && typeof item.click === "function") {
    setImmediate(() => item.click({ checked: item.type === "checkbox" ? !item.checked : !!item.checked }));
  }
});
ipcMain.on("ui:close", (e) => { if (fromUi(e) && uiOpen && uiOpen.kind === "menu") closeUi(); });

// Message boxes: showDialog({ type, title, message, detail, buttons, defaultId, cancelId })
// → Promise<{ response }>, like dialog.showMessageBox(win, …).
function showDialog(opts) {
  return new Promise((resolve) => {
    dialogQueue.push({ opts, resolve });
    pumpDialogs();
  });
}
async function pumpDialogs() {
  if (uiOpen || !dialogQueue.length) return;
  if (!win || win.isDestroyed()) {
    while (dialogQueue.length) dialogQueue.shift().resolve({ response: 0 });
    return;
  }
  const ok = await ensureUi();
  if (uiOpen || !dialogQueue.length) return;
  const { opts, resolve } = dialogQueue.shift();
  if (!ok) { dialog.showMessageBox(win, opts).then(resolve, () => resolve({ response: 0 })); return; }
  const buttons = (opts.buttons && opts.buttons.length ? opts.buttons : [tr("about.ok")]).map(String);
  const clamp = (i, d) => (Number.isInteger(i) && i >= 0 && i < buttons.length ? i : d);
  const data = {
    type: opts.type || "info", message: String(opts.message || opts.title || ""), detail: String(opts.detail || ""),
    buttons, defaultId: clamp(opts.defaultId, 0), cancelId: clamp(opts.cancelId, 0),
  };
  uiOpen = { kind: "dialog", resolve: (response) => resolve({ response }), cancelId: data.cancelId };
  if (!win.isVisible() || win.isMinimized()) showWindow();
  showUiLayer();
  uiView.webContents.send("ui:dialog", data);
}
ipcMain.on("ui:dialog-result", (e, i) => {
  if (!fromUi(e) || !uiOpen || uiOpen.kind !== "dialog") return;
  closeUi(Number.isInteger(i) ? i : uiOpen.cancelId);
});

// Mouse back/forward buttons reported by the page (see preload.js).
// (In the settings overlay the side buttons move through the settings pages.)
ipcMain.on("desktop:nav", (e, direction) =>
  navigate(direction === -1 ? -1 : 1, settingsView && e.sender === settingsView.webContents ? e.sender : null));

// ---- "Remember me" on your server's login page (see preload.js) -----------
const fromServerPage = (e) => {
  try { return isServerUrl(e.senderFrame.url); } catch { return false; }
};

// Saved login for auto-fill. Auto sign-in only happens once per launch, and
// never after you've already been in the app (so logging out stays logged out).
ipcMain.handle("desktop:get-login", (e) => {
  if (!fromServerPage(e)) return null;
  const saved = loadSavedLogin();
  if (!saved) return null;
  const autoSubmit = !reachedAppThisLaunch && !autoLoginUsed;
  if (autoSubmit) autoLoginUsed = true;
  return { username: saved.username, password: saved.password, autoSubmit };
});

// "Change" link next to the server address on the login page.
ipcMain.on("desktop:change-server", (e) => {
  if (fromServerPage(e)) showConnectPage("change");
});

// The login form was submitted. Saved only once the sign-in succeeds.
ipcMain.on("desktop:login-submitted", (e, creds) => {
  if (!fromServerPage(e) || !creds) return;
  if (!creds.remember) { forgetLogin(); return; }
  if (creds.username) pendingLogin = { username: String(creds.username), password: String(creds.password || "") };
});

// The desktop texts in the current language (title bar, connect screen, the web app's extras).
ipcMain.handle("desktop:strings", (e) => (fromLocalPage(e) || fromServerPage(e) ? stringsFor(uiLang()) : null));

// Which window a server page is in: "main" (the app) or "settings".
ipcMain.handle("desktop:window-kind", (e) => {
  if (!fromServerPage(e)) return null;
  return view && e.sender === wc() ? "main" : "settings";
});

// ---- scan button (admins) — see preload.js ----------------------------------
const uiPrefs = () => ({ scanButton: config.scanButton !== false });
ipcMain.handle("desktop:ui-prefs", (e) => (fromServerPage(e) ? uiPrefs() : null));
function setScanButton(on) {
  config = { ...config, scanButton: on };
  writeJson(dataFile("config.json"), config);
  for (const c of webContents.getAllWebContents()) if (!c.isDestroyed()) c.send("desktop:ui-prefs", uiPrefs());
}
// Watches Audiobookshelf's live task list in the page. While any library scan runs,
// <html data-absda-scanning="<what is being scanned>"> makes the scan button spin and
// gives its tooltip (preload.js). When the scans started from the button are done: one
// notification with the result (or one for all of them). Returns window.__absdaScan.
function scanWatchJs() {
  const text = JSON.stringify({ done: tr("scan.done"), allDone: tr("scan.allDone"), failed: tr("scan.failed") });
  return `(() => {
    const s = window.$nuxt && $nuxt.$store; if (!s || !s.state.tasks) return null;
    const w = window.__absdaScan || (window.__absdaScan = { batches: [] });
    w.text = ${text};
    if (w.mark) return w;
    const fill = (t, v) => Object.entries(v).reduce((a, [k, x]) => a.split("{" + k + "}").join(x), t);
    const title = (t) => {
      try { if (t.titleKey && $nuxt.$getString) return $nuxt.$getString(t.titleKey, (t.titleSubs || []).map((x) => String(x).trim())); } catch (e) {}
      return t.title || "";
    };
    // A click counts as "scanning" for a few seconds, until the server's task shows up.
    w.mark = () => {
      const now = Date.now();
      w.batches = w.batches.filter((b) => b.ids.size && (now - b.started < 15000 ||
        [...b.ids].some((id) => s.getters["tasks/getRunningLibraryScanTask"](id))));
      const tasks = (s.state.tasks.tasks || []).filter((t) => t.action === "library-scan" && !t.isFinished);
      const html = document.documentElement;
      if (now < (w.minUntil || 0) || tasks.length || w.batches.some((b) => now - b.started < 15000)) {
        html.setAttribute("data-absda-scanning", tasks.map(title).join("\\n"));
      } else html.removeAttribute("data-absda-scanning");
    };
    s.subscribe((m) => {
      if (!/^tasks\\/(addUpdateTask|setTasks|removeTask)$/.test(m.type)) return;
      const t = m.type === "tasks/addUpdateTask" ? m.payload : null;
      const lib = (t && t.data) || {};
      const b = t && t.action === "library-scan" && t.isFinished && w.batches.find((x) => x.ids.has(lib.libraryId));
      if (b) {
        b.ids.delete(lib.libraryId);
        const name = String(lib.libraryName || "").trim();
        if (t.isFailed) b.failed.push(name);
        if (!b.ids.size) {
          for (const n of b.failed) $nuxt.$toast.error(fill(w.text.failed, { name: n }));
          const ok = b.total - b.failed.length;
          if (ok && b.total > 1) $nuxt.$toast.success(fill(w.text.allDone, { n: ok }));
          else if (ok) {
            const result = (lib.scanResults && lib.scanResults.text) || "";
            $nuxt.$toast.success(result ? fill(w.text.done, { name, result }) : fill(w.text.done, { name, result: "" }).replace(/[\\s:：]+$/, ""));
          }
        }
      }
      w.mark();
    });
    w.mark();
    return w;
  })()`;
}
// From page load on, so scans started elsewhere (Audiobookshelf's own button, a schedule)
// spin the button too. The web app may still be starting: try again a few times.
function installScanWatch(contents, attempt = 0) {
  if (!view || contents !== wc() || !isServerUrl(contents.getURL())) return;
  contents.executeJavaScript(`!!${scanWatchJs()}`)
    .then((ok) => { if (!ok && attempt < 10) setTimeout(() => installScanWatch(contents, attempt + 1), 1500); })
    .catch(() => {});
}
// Scan libraries, like Audiobookshelf's own "Scan Library" button (the server itself
// only allows this for admins). One library → the web app's own message; several →
// one "Scan started for N libraries".
function scanLibraries(ids) {
  if (!view || !ids.length) return;
  const many = ids.length > 1 ? JSON.stringify(tr("scan.allStarted", { n: ids.length })) : "null";
  wc().executeJavaScript(`(async () => {
    const s = window.$nuxt && $nuxt.$store; if (!s || !s.getters["user/getIsAdminOrUp"]) return;
    const str = $nuxt.$strings || {};
    const w = ${scanWatchJs()};
    const batch = { ids: new Set(${JSON.stringify(ids)}), total: ${ids.length}, failed: [], started: Date.now() };
    w.batches.push(batch);
    w.minUntil = Date.now() + 1100;   // at least one full turn, even for a quick scan
    w.mark();
    setTimeout(w.mark, 1150);
    setTimeout(w.mark, 15500);
    try {
      for (const id of ${JSON.stringify(ids)}) await s.dispatch("libraries/requestLibraryScan", { libraryId: id, force: false });
      $nuxt.$toast.success(${many} || str.ToastLibraryScanStarted || "Library scan started");
    } catch (err) {
      w.batches = w.batches.filter((x) => x !== batch);
      w.mark();
      $nuxt.$toast.error(str.ToastLibraryScanFailedToStart || "Failed to start scan");
    }
  })()`).catch(() => {});
}
// The scan button's menu (drawn by preload.js): this library, or all libraries.
ipcMain.on("desktop:scan", async (e, { all } = {}) => {
  if (!fromServerPage(e) || !view || e.sender !== wc()) return;
  const ids = await wc().executeJavaScript(`(() => {
    const s = window.$nuxt && $nuxt.$store;
    if (!s || !s.getters["user/getIsAdminOrUp"]) return [];
    return ${all ? "(s.state.libraries.libraries || []).map((l) => l.id)" : "[s.state.libraries.currentLibraryId].filter(Boolean)"};
  })()`).catch(() => []);
  scanLibraries(ids || []);
});

// ✕ / Esc in the settings overlay, or a click on the dimmed app behind it.
ipcMain.on("desktop:close-settings", (e) => { if (fromServerPage(e)) closeSettings(); });

// The "Update x.y.z" pill in the title bar.
ipcMain.on("desktop:open-update", (e) => { if (fromLocalPage(e)) showUpdateDialog(); });

// A settings link was clicked in the main window.
ipcMain.on("desktop:open-settings", (e, url) => {
  if (fromServerPage(e) && view && e.sender === wc() && isSettingsUrl(String(url))) openSettings(String(url));
});

// ---- the paintbrush "Looks" panel in the web app's top bar ------------------
// Everything it needs to draw small previews of each theme and bookshelf.
const ABS_PLANK = "linear-gradient(180deg, #95775a 0%, #674625 17%, #674625 88%, #473019 100%)";
function looksState() {
  const t = currentTheme();
  const themes = Object.entries(THEMES).map(([id, th]) => {
    const c = th.colors || {};
    return {
      id, label: tr("theme." + id), contrast: !!th.contrast,
      title: th.title.bg, page: c.primary || BG, panel: c.bg || "#373838",
      accent: th.title.logo, plank: th.shelf || ABS_PLANK,
    };
  });
  const shelves = Object.entries(SHELF_ARTS).map(([id, a]) => {
    let image = null;
    if (a.svg) image = artUrl(a);
    else if (id !== "none" && woodTexture) image = t.tint ? `linear-gradient(${t.tint}, ${t.tint}), ${woodTexture}` : woodTexture;
    return { id, label: tr("shelf." + id), group: tr("group." + a.group), image, plank: a.plank || t.shelf || ABS_PLANK };
  });
  const sizes = TEXT_SIZES.map(([name, f]) => ({ id: String(f), label: tr("size." + name), percent: Math.round(f * 100) }));
  return { theme: themeId(), shelf: shelfArtId(), textSize: String(textSize()), sizes, themes, shelves };
}
ipcMain.handle("desktop:get-looks", (e) => (fromServerPage(e) ? looksState() : null));
ipcMain.handle("desktop:set-look", (e, { kind, id } = {}) => {
  if (!fromServerPage(e)) return null;
  if (kind === "theme" && THEMES[id]) setTheme(id);
  if (kind === "shelf" && SHELF_ARTS[id]) setShelfArt(id);
  if (kind === "text" && TEXT_SIZES.some(([, f]) => String(f) === id)) setTextSize(Number(id));
  return looksState();
});

// ---- app lifecycle ---------------------------------------------------------
// Every page (title bar, web app, pop-ups, connect screen) gets our styles as soon as it's ready.
app.on("web-contents-created", (_e, contents) => {
  contents.on("dom-ready", () => { applyPageCss(contents, true); applyTextSize(contents); });
  contents.on("did-finish-load", () => { applyToastSettings(contents); applyWebAppFixes(contents); installScanWatch(contents); });
  contents.on("zoom-changed", (_ev, dir) => { if (isServerUrl(contents.getURL())) zoom(dir === "in" ? 1 : -1); });
  // If the wood image wasn't readable yet at dom-ready, try again once the page has loaded.
  contents.on("did-finish-load", async () => {
    if (woodTexture || !isServerUrl(contents.getURL())) return;
    await readWoodTexture(contents);
    if (woodTexture) applyPageCss(contents, false);
  });
});

// Launching the app again (e.g. from the Start Menu while it's in the tray) shows the window.
app.on("second-instance", showWindow);

// A real quit (App → Exit, tray → Quit, Windows shutting down) closes instead of hiding.
app.on("before-quit", () => { isQuitting = true; });

app.whenReady().then(() => {
  if (!gotLock) return;
  if (dataFolderProblem) {
    dialog.showMessageBoxSync({
      type: "error",
      title: tr("data.notWritableTitle"),
      message: tr("data.notWritableTitle"),
      detail: tr("data.notWritableMsg", { folder: dataFolderProblem }),
      buttons: [tr("about.ok")],
    });
    app.quit();
    return;
  }
  if (startedFromTemp) {
    dialog.showMessageBoxSync({
      type: "warning",
      title: tr("temp.title"),
      message: tr("temp.title"),
      detail: tr("temp.msg", { folder: exeDir }),
      buttons: [tr("about.ok")],
    });
    app.quit();
    return;
  }
  config = readJson(dataFile("config.json"), {});
  setTimeout(cleanOldUnpackFolders, 30000);
  refreshStartWithWindows();
  hardenSession();
  Menu.setApplicationMenu(null);   // no Windows menu bar — the menus live in our title bar
  createWindow();
  createTray();
  startUpdateChecks();
});

app.on("window-all-closed", () => app.quit());
