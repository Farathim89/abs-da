// SPDX-License-Identifier: GPL-3.0-or-later
// ---------------------------------------------------------------------------
// Mood themes: colour themes with their own scenery — a stone dungeon lit by
// torches, a fireside tavern, a starship, neon nights, the deep sea, a haunted
// manor. Each brings:
//  - colours (like the other themes in main.js),
//  - `page`: the background behind the library (texture + light),
//  - `scene`: its own bookshelf texture (used while View → Bookshelf is "Classic"),
//  - `fx(motion)`: a light layer over the app (torch glow, embers, bubbles, fog…).
//    It never takes clicks; `motion` false = the same picture standing still.
// All textures are drawn in code (SVG), like shelf-art.js: no image files.
// ---------------------------------------------------------------------------

const { tex } = require("./shelf-art");
const { rng, svg, noiseFilter, layer, wood, plank, stars, ocean } = tex;

const url = (s) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;

// ---- textures ----------------------------------------------------------------

// Rough stone blocks in uneven courses, with dark mortar, grit and a little damp moss.
function stoneWall() {
  const rand = rng(313);
  const S = 480;
  const rows = [];
  for (let y = 0; y < S;) {
    let h = 52 + Math.round(rand() * 26);
    if (S - y - h < 44) h = S - y;
    rows.push([y, h]);
    y += h;
  }
  let blocks = "";
  for (const [y, h] of rows) {
    const widths = [];
    for (let x = 0; x < S;) {
      let w = 70 + Math.round(rand() * 80);
      if (S - x - w < 50) w = S - x;
      widths.push(w);
      x += w;
    }
    const shift = Math.round(rand() * S);
    let x = 0;
    for (const w of widths) {
      const v = Math.round(rand() * 22 - 11);
      const fill = `rgb(${74 + v},${68 + v},${60 + v})`;
      // Drawn twice where a block runs over the right edge, so the tile repeats seamlessly.
      for (const bx of [(x + shift) % S, ((x + shift) % S) - S]) {
        if (bx + w <= 0 || bx >= S) continue;
        blocks += `<rect x='${bx + 3}' y='${y + 3}' width='${w - 6}' height='${h - 6}' rx='6' fill='${fill}'/>` +
          `<rect x='${bx + 6}' y='${y + 4}' width='${w - 12}' height='2' rx='1' fill='rgba(255,235,200,0.10)'/>` +
          `<rect x='${bx + 5}' y='${y + h - 7}' width='${w - 10}' height='3' rx='1' fill='rgba(0,0,0,0.35)'/>`;
      }
      x += w;
    }
  }
  return svg(S, S,
    noiseFilter("g", { freq: "0.9", octaves: 2, seed: 5, color: "#000000", gain: 1.6, cut: 0.58 }) +
    noiseFilter("m", { freq: "0.025", octaves: 4, seed: 6, color: "#b8a888", gain: 1.4, cut: 0.66 }) +
    noiseFilter("d", { freq: "0.012", octaves: 3, seed: 7, color: "#2f4a2a", gain: 1.5, cut: 0.7 }) +
    `<rect width='100%' height='100%' fill='#1c1814'/>` + blocks + layer("m", 0.5) + layer("d", 0.6) + layer("g", 0.55));
}

// Starship hull: steel plates with rivets and faint glowing seams.
function hullPanels() {
  const rand = rng(77);
  const W = 160, H = 120, S = 480;
  let plates = "";
  for (let y = 0; y < S; y += H) {
    for (let x = 0; x < S; x += W) {
      const v = Math.round(rand() * 10 - 5);
      plates += `<rect x='${x + 1}' y='${y + 1}' width='${W - 2}' height='${H - 2}' fill='rgb(${30 + v},${38 + v},${50 + v})'/>` +
        `<rect x='${x + 1}' y='${y + 1}' width='${W - 2}' height='${H - 2}' fill='url(#sheen)'/>`;
      for (const [rx, ry] of [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8]]) {
        plates += `<circle cx='${x + rx}' cy='${y + ry}' r='2.2' fill='#56647a'/><circle cx='${x + rx - 0.6}' cy='${y + ry - 0.6}' r='0.9' fill='#9fb0c6'/>`;
      }
    }
  }
  return svg(S, S,
    `<linearGradient id='sheen' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='0.06'/>` +
    `<stop offset='0.5' stop-color='#fff' stop-opacity='0'/><stop offset='1' stop-color='#000' stop-opacity='0.25'/></linearGradient>` +
    noiseFilter("s", { freq: "0.004 0.6", octaves: 2, seed: 8, color: "#c8d6e8", gain: 1.4, cut: 0.66 }) +
    `<rect width='100%' height='100%' fill='#4fd8ff' opacity='0.35'/>` + plates + layer("s", 0.35));
}

// Neon grid: glowing magenta and cyan lines on deep violet.
function neonGrid() {
  const S = 240;
  let lines = "";
  for (let i = 0; i <= S; i += 40) {
    lines += `<rect x='${i - 1}' y='0' width='2' height='${S}' fill='#ff4fd8'/><rect x='0' y='${i - 1}' width='${S}' height='2' fill='#4fd8ff'/>`;
  }
  return svg(S, S,
    `<filter id='glow' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='3'/></filter>` +
    `<rect width='100%' height='100%' fill='#150828'/>` +
    `<g opacity='0.55' filter='url(#glow)'>${lines}</g><g opacity='0.5'>${lines}</g>`);
}

// Victorian damask wallpaper, aged and dark.
function damask() {
  const W = 120, H = 160;
  const motif = (cx, cy) =>
    `<g transform='translate(${cx} ${cy})' fill='#3a2d47'>` +
    `<ellipse rx='9' ry='26'/><ellipse cx='-17' cy='6' rx='7' ry='15' transform='rotate(-28 -17 6)'/>` +
    `<ellipse cx='17' cy='6' rx='7' ry='15' transform='rotate(28 17 6)'/>` +
    `<circle cy='-34' r='5'/><circle cy='33' r='4'/><circle cx='-22' cy='-16' r='3'/><circle cx='22' cy='-16' r='3'/></g>`;
  return svg(W * 2, H * 2,
    noiseFilter("a", { freq: "0.01", octaves: 4, seed: 13, color: "#000000", gain: 1.3, cut: 0.45 }) +
    noiseFilter("f", { freq: "0.7", octaves: 2, seed: 14, color: "#5a4a66", gain: 1.3, cut: 0.7 }) +
    `<rect width='100%' height='100%' fill='#1b1522'/>` +
    [0, W * 2].map((x) => [0, H * 2].map((y) => motif(x, y)).join("")).join("") + motif(W, H) +
    `<path d='M0 ${H} Q ${W / 2} ${H / 2} ${W} 0 Q ${W * 1.5} ${H / 2} ${W * 2} ${H} Q ${W * 1.5} ${H * 1.5} ${W} ${H * 2} Q ${W / 2} ${H * 1.5} 0 ${H} Z' ` +
    `fill='none' stroke='#33283f' stroke-width='3'/>` + layer("f", 0.5) + layer("a", 0.65));
}

const STONE = url(stoneWall());
const TAVERN = url(wood({ base: "#3b2414", dark: "#1a0e05", light: "#6e4826", seed: 21, plankW: 96, size: 480 }));
const HULL = url(hullPanels());
const STARS = url(stars());
const GRID = url(neonGrid());
const OCEAN = url(ocean());
const DAMASK = url(damask());

// ---- light layers (fx) ---------------------------------------------------------
// Only the web app's own page (not the title bar, the menus/dialogs layer or our pages).
const HOST = "body:has(#__nuxt)";
const layerCss = (which, css) => `${HOST}::${which} { content: ""; position: fixed; pointer-events: none; ${css} }`;
// Paused while the app isn't the window you're using (preload.js sets html.absda-idle), and off
// for "reduce motion" in Windows.
const still = `@media (prefers-reduced-motion: reduce) { ${HOST}::before, ${HOST}::after { animation: none !important; } }
  html.absda-idle ${HOST}::before, html.absda-idle ${HOST}::after { animation-play-state: paused !important; }`;
// Animations step at ~8 frames a second: slow drifting light doesn't need 60, and every frame
// redraws the whole window (60 fps ≈ a third of a CPU core, 8 fps ≈ a twentieth).
const FPS = 8;
const anim = (name, seconds, extra = "") => `animation: ${name} ${seconds}s steps(${Math.round(seconds * FPS)}) infinite ${extra};`;
// Dots (embers, bubbles, stars) in a square tile; `rise` moves them up one tile per loop.
const dots = (list) => list.map(([x, y, r, c]) => `radial-gradient(circle at ${x}% ${y}%, ${c} 0 ${r}px, transparent ${r + 1.2}px)`).join(", ");
const ringDots = (list) => list.map(([x, y, r, c]) => `radial-gradient(circle at ${x}% ${y}%, transparent 0 ${r - 1}px, ${c} ${r - 0.5}px ${r}px, transparent ${r + 0.8}px)`).join(", ");
function movingDots(which, bg, size, seconds, dir, motion, extra = "") {
  const sign = dir === "up" ? -1 : 1;
  return layerCss(which, `left: 0; right: 0; top: ${dir === "up" ? 0 : -size}px; height: calc(100% + ${size}px); z-index: 2147482001;
      background: ${bg}; background-size: ${size}px ${size}px; ${extra}
      ${motion ? anim(`absda-${which}-move`, seconds) + " will-change: transform;" : ""}`) +
    `@keyframes absda-${which}-move { from { transform: translateY(0); } to { transform: translateY(${sign * size}px); } }`;
}
const FLICKER = `@keyframes absda-flicker { 0% { opacity: .82; } 6% { opacity: 1; } 11% { opacity: .74; } 19% { opacity: .96; } 27% { opacity: .85; }
  38% { opacity: 1; } 47% { opacity: .78; } 55% { opacity: .93; } 63% { opacity: .7; } 72% { opacity: .98; } 84% { opacity: .8; } 92% { opacity: .95; } 100% { opacity: .82; } }`;

const MOOD_THEMES = {
  dungeon: {
    label: "Dungeon",
    group: "mood",
    title: { bg: "#0b0907", fg: "#eadcc6", hover: "#2c241c", logo: "#ff9a3c" },
    tint: "rgba(30, 16, 6, 0.55)",
    // Old dark wood with iron bands.
    shelf: `repeating-linear-gradient(90deg, transparent 0 236px, #2a2a2e 236px 250px, #4a4a50 250px 252px, transparent 252px 260px), ${plank("#6a5240", "#43301f", "#1d130b")}`,
    scroll: "#5a4632",
    page: `radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255, 140, 50, .10), transparent 70%), linear-gradient(rgba(10, 8, 6, .70), rgba(10, 8, 6, .84)), ${STONE}`,
    scene: `linear-gradient(rgba(24, 16, 8, .30), rgba(24, 16, 8, .30)), ${STONE}`,
    colors: {
      primary: "#100d0b", bg: "#1b1612", accent: "#ff9a3c", success: "#b0561e",
      "black-50": "#cfc3b2", "black-100": "#847868", "black-200": "#6a5f52", "black-300": "#4f463d",
      "black-400": "#39322b", "black-500": "#241f1a", "black-600": "#161210", "black-700": "#0e0b09",
    },
    // Two torches on the walls, flickering; dark corners.
    fx: (motion) =>
      layerCss("before", `inset: 0; z-index: 2147482000;
        background: radial-gradient(ellipse 32% 46% at 0% 22%, rgba(255, 128, 36, .32), transparent 70%),
          radial-gradient(ellipse 32% 46% at 100% 22%, rgba(255, 128, 36, .28), transparent 70%);
        ${motion ? anim("absda-flicker", 3.4) : ""}`) +
      layerCss("after", `inset: 0; z-index: 2147482001;
        background: radial-gradient(ellipse 125% 95% at 50% 45%, transparent 58%, rgba(0, 0, 0, .40) 100%);`) +
      FLICKER + still,
  },
  tavern: {
    label: "Fireside Tavern",
    group: "mood",
    title: { bg: "#140d08", fg: "#f3e3cc", hover: "#3a2817", logo: "#ffb347" },
    tint: "rgba(48, 22, 6, 0.45)",
    shelf: plank("#8a5a32", "#5c3a1e", "#2e1c0d"),
    scroll: "#6b4526",
    page: `linear-gradient(rgba(20, 12, 6, .62), rgba(20, 12, 6, .80)), ${TAVERN}`,
    scene: TAVERN,
    colors: {
      primary: "#1a110a", bg: "#28190f", accent: "#ffb347", success: "#b5651d",
      "black-50": "#e0cdb5", "black-100": "#8f7860", "black-200": "#735f4b", "black-300": "#574536",
      "black-400": "#3f3025", "black-500": "#2a1f17", "black-600": "#1b130d", "black-700": "#120c08",
    },
    // The hearth glowing from below, sparks drifting up.
    fx: (motion) =>
      layerCss("before", `inset: 0; z-index: 2147482000;
        background: radial-gradient(ellipse 70% 38% at 50% 108%, rgba(255, 130, 40, .26), transparent 72%),
          radial-gradient(ellipse 125% 95% at 50% 45%, transparent 60%, rgba(10, 4, 0, .32) 100%);
        ${motion ? anim("absda-flicker", 4.2) : ""}`) +
      movingDots("after", dots([[12, 88, 1.6, "rgba(255,170,60,.75)"], [31, 62, 1.2, "rgba(255,120,40,.65)"], [47, 95, 1.8, "rgba(255,190,90,.7)"],
        [66, 74, 1.3, "rgba(255,140,50,.6)"], [83, 91, 1.5, "rgba(255,170,60,.7)"], [92, 40, 1.1, "rgba(255,120,40,.5)"], [22, 30, 1.0, "rgba(255,160,70,.45)"],
        [58, 18, 1.2, "rgba(255,140,50,.4)"]]), 420, 14, "up", motion,
        "-webkit-mask-image: linear-gradient(to top, black 0%, rgba(0,0,0,.6) 45%, transparent 80%); mask-image: linear-gradient(to top, black 0%, rgba(0,0,0,.6) 45%, transparent 80%);") +
      FLICKER + still,
  },
  starship: {
    label: "Starship",
    group: "mood",
    title: { bg: "#050810", fg: "#dbe8f7", hover: "#1c2a40", logo: "#4fd8ff" },
    tint: "rgba(6, 18, 40, 0.6)",
    shelf: `linear-gradient(180deg, transparent 46%, rgba(79, 216, 255, .55) 50%, transparent 54%), ${plank("#8fa3b8", "#4a5868", "#1e252e")}`,
    scroll: "#2f5a78",
    page: `radial-gradient(ellipse 80% 50% at 50% -10%, rgba(79, 216, 255, .14), transparent 70%), linear-gradient(rgba(3, 6, 14, .45), rgba(3, 6, 14, .65)), ${STARS}`,
    scene: HULL,
    colors: {
      primary: "#070b14", bg: "#0e1524", accent: "#4fd8ff", success: "#1f86b8",
      "black-50": "#b9c8dc", "black-100": "#687a94", "black-200": "#52637b", "black-300": "#3a4960",
      "black-400": "#283447", "black-500": "#172031", "black-600": "#0d1422", "black-700": "#080d17",
    },
    // Stars sliding past the windows, a faint console scanline.
    fx: (motion) =>
      layerCss("before", `inset: 0; z-index: 2147482000;
        background: repeating-linear-gradient(0deg, rgba(79, 216, 255, .022) 0 1px, transparent 1px 4px),
          radial-gradient(ellipse 125% 95% at 50% 45%, transparent 62%, rgba(0, 4, 12, .35) 100%);`) +
      movingDots("after", dots([[8, 14, 1.0, "rgba(255,255,255,.55)"], [27, 63, 0.8, "rgba(200,230,255,.5)"], [44, 31, 1.2, "rgba(255,255,255,.45)"],
        [61, 82, 0.9, "rgba(180,220,255,.5)"], [79, 47, 1.0, "rgba(255,255,255,.5)"], [93, 9, 0.8, "rgba(200,230,255,.45)"], [15, 92, 0.7, "rgba(255,255,255,.4)"],
        [52, 5, 0.7, "rgba(255,255,255,.35)"]]), 520, 50, "down", motion) + still,
  },
  neon: {
    label: "Neon Nights",
    group: "mood",
    title: { bg: "#0a0414", fg: "#f5e6ff", hover: "#2a1745", logo: "#ff4fd8" },
    tint: "rgba(40, 8, 60, 0.6)",
    shelf: "linear-gradient(180deg, #ff4fd8 0%, #8a2be2 22%, #3a1466 85%, #12051f 100%)",
    scroll: "#6a2a8a",
    page: "linear-gradient(180deg, #0d0618 0%, #160a2a 50%, #2c0d42 80%, #4a1450 100%)",
    scene: GRID,
    colors: {
      primary: "#0d0618", bg: "#170b28", accent: "#ff4fd8", success: "#8a3ff0",
      "black-50": "#d6c2ec", "black-100": "#85709f", "black-200": "#6a5784", "black-300": "#4e3e66",
      "black-400": "#382b4c", "black-500": "#231a33", "black-600": "#150f21", "black-700": "#0c0815",
    },
    css: `#appbar { box-shadow: 0 1px 0 rgba(255, 79, 216, .45), 0 0 18px rgba(255, 79, 216, .18) !important; }`,
    // A sunset glow on the horizon and a neon floor rolling towards you.
    fx: (motion) =>
      layerCss("before", `inset: 0; z-index: 2147482000;
        background: radial-gradient(ellipse 70% 30% at 50% 100%, rgba(255, 79, 216, .16), transparent 75%),
          radial-gradient(ellipse 90% 20% at 50% 100%, rgba(79, 216, 255, .08), transparent 75%);`) +
      layerCss("after", `left: -50%; right: -50%; bottom: -30px; height: 42%; z-index: 2147482001; transform-origin: 50% 100%;
        background: linear-gradient(90deg, rgba(255, 79, 216, .16) 0 1.5px, transparent 1.5px), linear-gradient(0deg, rgba(79, 216, 255, .14) 0 1.5px, transparent 1.5px);
        background-size: 60px 60px;
        -webkit-mask-image: linear-gradient(to top, black, transparent 85%); mask-image: linear-gradient(to top, black, transparent 85%);
        transform: perspective(380px) rotateX(64deg);
        ${motion ? anim("absda-floor", 3) + " will-change: transform;" : ""}`) +
      `@keyframes absda-floor { from { transform: perspective(380px) rotateX(64deg) translateY(0); } to { transform: perspective(380px) rotateX(64deg) translateY(60px); } }` +
      still,
  },
  deepsea: {
    label: "Deep Sea",
    group: "mood",
    title: { bg: "#020d10", fg: "#d8f3f0", hover: "#123236", logo: "#3fe0c5" },
    tint: "rgba(2, 30, 36, 0.6)",
    shelf: plank("#3f8f8a", "#1f5a5a", "#0b2e30"),
    scroll: "#1d5c5c",
    page: `linear-gradient(180deg, rgba(4, 30, 36, .55), rgba(2, 10, 14, .9)), ${OCEAN}`,
    scene: OCEAN,
    colors: {
      primary: "#031317", bg: "#072027", accent: "#3fe0c5", success: "#13887a",
      "black-50": "#b5d6d6", "black-100": "#5f8a8c", "black-200": "#4a7173", "black-300": "#355557",
      "black-400": "#243e40", "black-500": "#142a2d", "black-600": "#0a1b1e", "black-700": "#051114",
    },
    // Light shafts from the surface swaying, bubbles rising.
    fx: (motion) =>
      layerCss("before", `left: -10%; right: -10%; top: 0; height: 70%; z-index: 2147482000; transform-origin: 50% 0;
        background: repeating-linear-gradient(100deg, rgba(140, 255, 240, .05) 0 50px, transparent 50px 150px, rgba(140, 255, 240, .03) 150px 175px, transparent 175px 260px);
        -webkit-mask-image: linear-gradient(to bottom, black, transparent); mask-image: linear-gradient(to bottom, black, transparent);
        ${motion ? anim("absda-sway", 9, "alternate") + " will-change: transform;" : ""}`) +
      `@keyframes absda-sway { from { transform: skewX(-4deg) translateX(-2%); } to { transform: skewX(4deg) translateX(2%); } }` +
      movingDots("after", ringDots([[14, 80, 4, "rgba(190,255,245,.35)"], [37, 45, 3, "rgba(190,255,245,.3)"], [52, 92, 5, "rgba(190,255,245,.3)"],
        [71, 60, 3, "rgba(190,255,245,.35)"], [88, 20, 4, "rgba(190,255,245,.28)"], [25, 12, 3, "rgba(190,255,245,.25)"]]), 460, 16, "up", motion) +
      still,
  },
  haunted: {
    label: "Haunted Manor",
    group: "mood",
    title: { bg: "#09070c", fg: "#e6def0", hover: "#2a2233", logo: "#9fe870" },
    tint: "rgba(20, 10, 30, 0.6)",
    shelf: plank("#5a4a5e", "#352a3a", "#17111a"),
    scroll: "#4a3d5a",
    page: `linear-gradient(rgba(10, 8, 14, .55), rgba(10, 8, 14, .78)), ${DAMASK}`,
    scene: DAMASK,
    colors: {
      primary: "#0e0b12", bg: "#18131e", accent: "#9fe870", success: "#5c3d8a",
      "black-50": "#cbc3d6", "black-100": "#7b7189", "black-200": "#625a70", "black-300": "#4a4355",
      "black-400": "#352f3e", "black-500": "#221d29", "black-600": "#15111a", "black-700": "#0c0a10",
    },
    // Fog creeping along the floor, and now and then a flash of lightning.
    fx: (motion) =>
      layerCss("before", `left: 0; top: 0; bottom: 0; width: calc(100% + 1200px); z-index: 2147482000;
        background: radial-gradient(ellipse 22% 26% at 15% 92%, rgba(180, 170, 210, .11), transparent 70%),
          radial-gradient(ellipse 28% 20% at 55% 98%, rgba(180, 170, 210, .09), transparent 70%),
          radial-gradient(ellipse 20% 30% at 85% 88%, rgba(180, 170, 210, .10), transparent 70%);
        background-size: 1200px 100%; background-repeat: repeat-x;
        ${motion ? anim("absda-fog", 70) + " will-change: transform;" : ""}`) +
      `@keyframes absda-fog { from { transform: translateX(0); } to { transform: translateX(-1200px); } }` +
      (motion
        ? layerCss("after", `inset: 0; z-index: 2147482001; background: rgb(215, 220, 255); opacity: 0; ${anim("absda-lightning", 19)}`) +
          `@keyframes absda-lightning { 0%, 88% { opacity: 0; } 88.7% { opacity: .08; } 89.6% { opacity: 0; } 90.4% { opacity: .11; } 92% { opacity: 0; } 100% { opacity: 0; } }`
        : "") +
      still,
  },
};

module.exports = { MOOD_THEMES };
