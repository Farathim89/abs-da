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
//  - `chrome`: the title bar, top bar and side menu dressed to match (stone, wood, hull…),
//  - `font`: a heading font that fits (fonts that come with Windows; nothing is downloaded).
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

// A wall of old books: rows of spines in faded leather colours with gilt bands.
function bookSpines() {
  const rand = rng(404);
  const S = 480, rowH = 120;
  const leather = ["#4a1f1f", "#2f3a24", "#23304a", "#4a3a1c", "#3a2440", "#1f3a3a", "#5a2e14", "#2a2a2a"];
  let books = "";
  for (let y = 0; y < S; y += rowH) {
    let x = 0;
    while (x < S) {
      let w = 14 + Math.round(rand() * 22);
      if (S - x - w < 12) w = S - x;
      const h = rowH - 14 - Math.round(rand() * 26);
      const top = y + rowH - 8 - h;
      const c = leather[Math.floor(rand() * leather.length)];
      books += `<rect x='${x + 1}' y='${top}' width='${w - 2}' height='${h}' fill='${c}'/>` +
        `<rect x='${x + 1}' y='${top + 10}' width='${w - 2}' height='2' fill='#b8954a' opacity='.55'/>` +
        `<rect x='${x + 1}' y='${top + h - 14}' width='${w - 2}' height='2' fill='#b8954a' opacity='.45'/>` +
        `<rect x='${x + 1}' y='${top}' width='3' height='${h}' fill='rgba(255,255,255,.08)'/>`;
      x += w;
    }
    books += `<rect x='0' y='${y + rowH - 8}' width='${S}' height='8' fill='#2a1a10'/><rect x='0' y='${y + rowH - 8}' width='${S}' height='1.5' fill='rgba(255,220,160,.18)'/>`;
  }
  return svg(S, S,
    noiseFilter("g", { freq: "0.8", octaves: 2, seed: 41, color: "#000000", gain: 1.5, cut: 0.6 }) +
    `<rect width='100%' height='100%' fill='#120c08'/>` + books + layer("g", 0.45));
}

// Rain on a window at dusk: blurred lights behind the glass, drops running down.
function wetGlass() {
  const rand = rng(515);
  let lights = "";
  for (let i = 0; i < 18; i++) {
    const c = rand() < 0.55 ? "#f2c46d" : "#6fa8d8";
    lights += `<circle cx='${(rand() * 480).toFixed(0)}' cy='${(rand() * 480).toFixed(0)}' r='${(8 + rand() * 22).toFixed(0)}' fill='${c}' opacity='${(0.10 + rand() * 0.16).toFixed(2)}' filter='url(#b)'/>`;
  }
  return svg(480, 480,
    `<filter id='b' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='6'/></filter>` +
    noiseFilter("r", { freq: "0.02 0.002", octaves: 2, seed: 52, color: "#a8c4dc", gain: 1.6, cut: 0.72 }) +
    `<rect width='100%' height='100%' fill='#151d25'/>` + lights + layer("r", 0.5));
}

// A snowy night: dark sky, a few stars, soft white hills at the bottom.
function snowNight() {
  const rand = rng(616);
  let stars = "";
  for (let i = 0; i < 50; i++) {
    stars += `<circle cx='${(rand() * 960).toFixed(0)}' cy='${(rand() * 380).toFixed(0)}' r='${(0.4 + rand() * 1.1).toFixed(2)}' fill='#fff' opacity='${(0.3 + rand() * 0.6).toFixed(2)}'/>`;
  }
  return svg(960, 640,
    `<linearGradient id='sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#070d1c'/><stop offset='1' stop-color='#1a2a44'/></linearGradient>` +
    `<rect width='100%' height='100%' fill='url(#sky)'/>` + stars +
    `<path d='M0 520 Q 160 450 320 500 T 640 490 T 960 510 V 640 H 0 Z' fill='#9fb4cc' opacity='.35'/>` +
    `<path d='M0 560 Q 200 500 420 550 T 960 545 V 640 H 0 Z' fill='#d8e4f2' opacity='.45'/>`);
}

// Falling snow: six-armed flakes (each arm with two little branches), different
// sizes, turns and brightness, and a few tiny far-away ones.
function snowflakes() {
  const rand = rng(727);
  const S = 440;
  const flake = (cx, cy, r, rot, op) => {
    let arms = "";
    for (let k = 0; k < 6; k++) {
      arms += `<g transform='rotate(${k * 60})'><line x1='0' y1='0' x2='0' y2='${-r}'/>` +
        `<line x1='0' y1='${(-r * 0.55).toFixed(2)}' x2='${(r * 0.26).toFixed(2)}' y2='${(-r * 0.78).toFixed(2)}'/>` +
        `<line x1='0' y1='${(-r * 0.55).toFixed(2)}' x2='${(-r * 0.26).toFixed(2)}' y2='${(-r * 0.78).toFixed(2)}'/></g>`;
    }
    return `<g transform='translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(0)})' opacity='${op.toFixed(2)}' ` +
      `stroke-width='${(r > 6 ? 1.3 : 1).toFixed(1)}'>${arms}<circle r='${(r * 0.14).toFixed(2)}' fill='#fff'/></g>`;
  };
  let flakes = "";
  for (let i = 0; i < 16; i++) flakes += flake(12 + rand() * (S - 24), 12 + rand() * (S - 24), 3 + rand() * 6, rand() * 60, 0.45 + rand() * 0.45);
  for (let i = 0; i < 18; i++) flakes += `<circle cx='${(rand() * S).toFixed(1)}' cy='${(rand() * S).toFixed(1)}' r='${(0.6 + rand() * 0.9).toFixed(2)}' fill='#fff' opacity='${(0.3 + rand() * 0.35).toFixed(2)}'/>`;
  return svg(S, S, `<g stroke='#ffffff' stroke-linecap='round' fill='none'>${flakes}</g>`);
}

// A summer canopy: layers of leaves in many greens, a little sunlight between them.
function canopy() {
  const rand = rng(808);
  const S = 480;
  const greens = ["#24481f", "#2f6b2a", "#3f8a34", "#4f9a3c", "#62ad47", "#7cc257", "#2a5426"];
  let leaves = "";
  for (let i = 0; i < 170; i++) {
    const x = Math.round(10 + rand() * (S - 20)), y = Math.round(10 + rand() * (S - 20));
    const rx = Math.round(6 + rand() * 10), ry = Math.round(rx * (0.45 + rand() * 0.2));
    const c = greens[Math.floor(rand() * greens.length)];
    leaves += `<ellipse cx='${x}' cy='${y}' rx='${rx}' ry='${ry}' fill='${c}' ` +
      `opacity='${(0.65 + rand() * 0.3).toFixed(1)}' transform='rotate(${(rand() * 180).toFixed(0)} ${x} ${y})'/>`;
  }
  let light = "";
  for (let i = 0; i < 14; i++) {
    light += `<circle cx='${(20 + rand() * (S - 40)).toFixed(0)}' cy='${(20 + rand() * (S - 40)).toFixed(0)}' r='${(2 + rand() * 4).toFixed(1)}' fill='#fff2b0' opacity='${(0.25 + rand() * 0.35).toFixed(2)}'/>`;
  }
  return svg(S, S,
    noiseFilter("n", { freq: "0.03", octaves: 3, seed: 81, color: "#0b1a09", gain: 1.4, cut: 0.5 }) +
    `<rect width='100%' height='100%' fill='#1c3a1c'/>` + layer("n", 0.6) + leaves + light);
}

const STONE = url(stoneWall());
const TAVERN = url(wood({ base: "#3b2414", dark: "#1a0e05", light: "#6e4826", seed: 21, plankW: 96, size: 480 }));
const HULL = url(hullPanels());
const STARS = url(stars());
const GRID = url(neonGrid());
const OCEAN = url(ocean());
const DAMASK = url(damask());
const SPINES = url(bookSpines());
const GLASS = url(wetGlass());
const SNOWSKY = url(snowNight());
const FLAKES = url(snowflakes());
// A cap of snow for the top of each book (stretched to the card's width): lumpy top,
// soft rounded underside with a few drips, a cool shadow under it.
const SNOWCAP = url(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 16' preserveAspectRatio='none'>` +
  `<path d='M0 8 Q 1 4 5 5 Q 9 1 15 3 Q 22 0 28 3 Q 35 1 41 3 Q 48 0 55 3 Q 62 1 68 3 Q 75 0 82 3 Q 89 1 94 4 Q 99 3 100 7 L 100 11 Q 96 13 92 11 Q 87 15 82 11 Q 74 13 68 11 Q 64 16 60 11 Q 52 13 46 11 Q 40 14 34 11 Q 26 13 20 11 Q 14 15 9 11 Q 4 13 0 12 Z' fill='#b9cfe6'/>` +
  `<path d='M0 7 Q 1 3 5 4 Q 9 0 15 2 Q 22 -1 28 2 Q 35 0 41 2 Q 48 -1 55 2 Q 62 0 68 2 Q 75 -1 82 2 Q 89 0 94 3 Q 99 2 100 6 L 100 10 Q 96 12 92 10 Q 87 14 82 10 Q 74 12 68 10 Q 64 15 60 10 Q 52 12 46 10 Q 40 13 34 10 Q 26 12 20 10 Q 14 14 9 10 Q 4 12 0 11 Z' fill='#f7fbff'/>` +
  `</svg>`);
const ARCANE_WOOD = url(wood({ base: "#2a1a2e", dark: "#120814", light: "#4a3150", seed: 71, plankW: 110, size: 440 }));
const AUTUMN_WOOD = url(wood({ base: "#5a3418", dark: "#2a1608", light: "#8a5a2e", seed: 33, plankW: 120, size: 480 }));
const CANOPY = url(canopy());
const BIRCH = url(wood({ base: "#c9b48a", dark: "#8a7550", light: "#efe2c0", seed: 61, plankW: 110, size: 440 }));
const FROST_WOOD = url(wood({ base: "#3a3a40", dark: "#1c1c22", light: "#6a6e78", seed: 88, plankW: 120, size: 480 }));

// ---- light layers (fx) ---------------------------------------------------------
// The web app's page and our offline / can't-reach pages (body.absda-mood-page) — not the
// title bar or the menus/dialogs layer.
const HOST = "body:is(:has(#__nuxt), .absda-mood-page)";
const layerCss = (which, css) => `${HOST}::${which} { content: ""; position: fixed; pointer-events: none; ${css} }`;
// Paused while the app isn't the window you're using (preload.js sets html.absda-idle), and off
// for "reduce motion" in Windows.
const still = `@media (prefers-reduced-motion: reduce) { ${HOST}::before, ${HOST}::after { animation: none !important; } }
  html.absda-idle ${HOST}::before, html.absda-idle ${HOST}::after { animation-play-state: paused !important; }`;
// Animations step at 30 frames a second. Smooth for slow drifting light, and measured
// at about the same cost as 8 (5–10 % of one core); the full 60 redraws the whole window
// every frame (≈ 30 %).
const FPS = 30;
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
  wizard: {
    label: "Wizard's Library",
    group: "mood",
    title: { bg: "#0b0915", fg: "#ece4d0", hover: "#2a2140", logo: "#e8c66a" },
    tint: "rgba(30, 12, 50, 0.55)",
    shelf: plank("#7a5a3a", "#4a3020", "#22140c"),
    scroll: "#4a3a6a",
    page: `radial-gradient(ellipse 70% 50% at 50% 10%, rgba(150, 110, 255, .12), transparent 70%), linear-gradient(rgba(10, 6, 20, .62), rgba(10, 6, 20, .80)), ${SPINES}`,
    scene: `linear-gradient(rgba(16, 8, 24, .25), rgba(16, 8, 24, .25)), ${SPINES}`,
    colors: {
      primary: "#0f0c1d", bg: "#1a1530", accent: "#e8c66a", success: "#6a4bc4",
      "black-50": "#d2c9e2", "black-100": "#7f7699", "black-200": "#655d7e", "black-300": "#4a4360",
      "black-400": "#352f48", "black-500": "#221e31", "black-600": "#151221", "black-700": "#0d0b16",
    },
    // Golden motes drifting up, a soft arcane glow.
    fx: (motion) =>
      layerCss("before", `inset: 0; z-index: 2147482000;
        background: radial-gradient(ellipse 45% 35% at 85% 15%, rgba(150, 110, 255, .14), transparent 70%),
          radial-gradient(ellipse 40% 30% at 10% 85%, rgba(232, 198, 106, .08), transparent 70%);`) +
      movingDots("after", dots([[9, 70, 1.4, "rgba(255,225,140,.7)"], [24, 30, 1.0, "rgba(255,225,140,.55)"], [41, 88, 1.6, "rgba(200,170,255,.55)"],
        [57, 52, 1.1, "rgba(255,225,140,.6)"], [73, 12, 1.3, "rgba(200,170,255,.5)"], [88, 64, 1.0, "rgba(255,225,140,.5)"], [64, 95, 0.9, "rgba(255,225,140,.45)"]]),
        480, 30, "up", motion) + still,
  },
  rain: {
    label: "Rainy Day",
    group: "mood",
    title: { bg: "#0b1014", fg: "#e2e9ef", hover: "#22303a", logo: "#f2c46d" },
    tint: "rgba(10, 20, 30, 0.55)",
    shelf: plank("#6a7884", "#3e4a54", "#1c242b"),
    scroll: "#3e5566",
    page: `radial-gradient(ellipse 40% 45% at 100% 100%, rgba(242, 196, 109, .12), transparent 70%), linear-gradient(rgba(8, 12, 16, .45), rgba(8, 12, 16, .68)), ${GLASS}`,
    scene: GLASS,
    colors: {
      primary: "#0f1418", bg: "#182027", accent: "#f2c46d", success: "#3f6f8f",
      "black-50": "#c4ced6", "black-100": "#73818c", "black-200": "#5b6873", "black-300": "#434f59",
      "black-400": "#303a42", "black-500": "#1f272e", "black-600": "#131a1f", "black-700": "#0c1115",
    },
    // A warm reading lamp in the corner; rain running down the glass.
    fx: (motion) =>
      layerCss("before", `inset: 0; z-index: 2147482000;
        background: radial-gradient(ellipse 38% 42% at 100% 100%, rgba(242, 180, 90, .14), transparent 72%),
          radial-gradient(ellipse 125% 95% at 50% 45%, transparent 62%, rgba(4, 8, 12, .32) 100%);`) +
      layerCss("after", `left: -10%; right: -10%; top: -120px; height: calc(100% + 240px); z-index: 2147482001;
        background: repeating-linear-gradient(90deg, transparent 0 37px, rgba(190, 210, 230, .16) 37px 38px, transparent 38px 61px, rgba(190, 210, 230, .10) 61px 62px, transparent 62px 97px);
        -webkit-mask-image: repeating-linear-gradient(180deg, black 0 26px, transparent 26px 120px); mask-image: repeating-linear-gradient(180deg, black 0 26px, transparent 26px 120px);
        transform: rotate(7deg);
        ${motion ? anim("absda-rain", 0.75) + " will-change: transform;" : ""}`) +
      `@keyframes absda-rain { from { transform: rotate(7deg) translateY(0); } to { transform: rotate(7deg) translateY(120px); } }` + still,
  },
  summer: {
    label: "Summer Woods",
    group: "mood",
    title: { bg: "#0c160d", fg: "#eef6e6", hover: "#23361f", logo: "#f5d76e" },
    tint: "rgba(30, 60, 20, 0.4)",
    shelf: plank("#e6d6ad", "#b29c72", "#6b5a3e"),
    scroll: "#4f7a3f",
    page: `radial-gradient(ellipse 60% 50% at 25% 0%, rgba(255, 230, 140, .18), transparent 70%), linear-gradient(rgba(8, 20, 8, .45), rgba(8, 20, 8, .65)), ${CANOPY}`,
    scene: `linear-gradient(rgba(20, 30, 10, .30), rgba(20, 30, 10, .30)), ${BIRCH}`,
    colors: {
      primary: "#0f1a10", bg: "#18281a", accent: "#f5d76e", success: "#3d8b3d",
      "black-50": "#cdd9c6", "black-100": "#7b8d74", "black-200": "#62735c", "black-300": "#4a5945",
      "black-400": "#354232", "black-500": "#222c20", "black-600": "#151c14", "black-700": "#0d120c",
    },
    // Sunlight falling through the leaves, swaying; pollen drifting up in it.
    fx: (motion) =>
      layerCss("before", `left: -10%; right: -10%; top: 0; height: 80%; z-index: 2147482000; transform-origin: 30% 0;
        background: repeating-linear-gradient(115deg, rgba(255, 230, 150, .07) 0 60px, transparent 60px 170px, rgba(255, 230, 150, .04) 170px 200px, transparent 200px 300px);
        -webkit-mask-image: linear-gradient(to bottom, black, transparent); mask-image: linear-gradient(to bottom, black, transparent);
        ${motion ? anim("absda-sway", 11, "alternate") + " will-change: transform;" : ""}`) +
      `@keyframes absda-sway { from { transform: skewX(-3deg) translateX(-1.5%); } to { transform: skewX(3deg) translateX(1.5%); } }` +
      movingDots("after", dots([[10, 75, 1.3, "rgba(255,236,150,.6)"], [27, 30, 1.0, "rgba(255,255,220,.5)"], [43, 88, 1.5, "rgba(255,236,150,.55)"],
        [58, 46, 1.1, "rgba(255,255,220,.45)"], [74, 15, 1.2, "rgba(255,236,150,.5)"], [90, 62, 1.0, "rgba(255,255,220,.45)"], [65, 95, 0.9, "rgba(255,236,150,.4)"]]),
        460, 34, "up", motion) + still,
  },
  autumn: {
    label: "Autumn Woods",
    group: "mood",
    title: { bg: "#120a06", fg: "#f2e2cc", hover: "#33200f", logo: "#ff8c42" },
    tint: "rgba(60, 24, 6, 0.45)",
    shelf: plank("#a0663a", "#6b3f1e", "#33190a"),
    scroll: "#7a4a24",
    page: `radial-gradient(ellipse 70% 45% at 50% 0%, rgba(255, 150, 60, .12), transparent 70%), linear-gradient(rgba(18, 10, 4, .55), rgba(18, 10, 4, .78)), ${AUTUMN_WOOD}`,
    scene: AUTUMN_WOOD,
    colors: {
      primary: "#170e08", bg: "#24160c", accent: "#ff8c42", success: "#a8481c",
      "black-50": "#e2cdb5", "black-100": "#917760", "black-200": "#755f4a", "black-300": "#594535",
      "black-400": "#402f23", "black-500": "#2b1f16", "black-600": "#1b130c", "black-700": "#120c07",
    },
    // Leaves drifting down.
    fx: (motion) =>
      layerCss("before", `inset: 0; z-index: 2147482000;
        background: radial-gradient(ellipse 125% 95% at 50% 45%, transparent 60%, rgba(14, 6, 0, .34) 100%);`) +
      movingDots("after", [[12, 18, "#d9622b"], [33, 64, "#e8a33a"], [52, 32, "#b8401c"], [71, 80, "#e07a2e"], [88, 44, "#c9952e"], [45, 92, "#a8481c"], [6, 58, "#e8a33a"]]
        .map(([x, y, c]) => `radial-gradient(7px 4px at ${x}% ${y}%, ${c} 0 90%, transparent 100%)`).join(", "), 520, 26, "down", motion,
        "opacity: .85;") + still,
  },
  snow: {
    label: "Snowy Night",
    group: "mood",
    title: { bg: "#060a14", fg: "#e8f0fa", hover: "#1c2840", logo: "#9fd8ff" },
    tint: "rgba(10, 20, 40, 0.55)",
    // Shelves with a layer of snow on top.
    shelf: "linear-gradient(180deg, #f4f8ff 0%, #dfe8f4 22%, #6a5a4a 30%, #4a3c30 85%, #241c14 100%)",
    scroll: "#3c5a80",
    page: SNOWSKY,
    css: `html body :is([id^="book-card-"], [id^="series-card-"], [id^="collection-card-"], [id^="playlist-card-"]) { overflow: visible !important; }
      html body #absda-home .h-card { position: relative; }
      html body :is([id^="book-card-"], [id^="series-card-"], [id^="collection-card-"], [id^="playlist-card-"], #absda-home .h-card)::before {
        content: ""; position: absolute; left: -3px; right: -3px; top: -8px; height: 16px; z-index: 45; pointer-events: none;
        background: ${SNOWCAP} top left / 100% 100% no-repeat; filter: drop-shadow(0 1px 1px rgba(0, 0, 0, .35)); }`,
    scene: `linear-gradient(rgba(10, 18, 34, .35), rgba(10, 18, 34, .35)), ${FROST_WOOD}`,
    colors: {
      primary: "#0a1020", bg: "#141c30", accent: "#9fd8ff", success: "#3c78b8",
      "black-50": "#c8d4e6", "black-100": "#76839c", "black-200": "#5d6a82", "black-300": "#445068",
      "black-400": "#303a4e", "black-500": "#1e2638", "black-600": "#121828", "black-700": "#0b101c",
    },
    // Snow falling (View → Theme → Show snowflakes can turn the flakes off).
    fx: (motion, o = {}) =>
      layerCss("before", `inset: 0; z-index: 2147482000;
        background: radial-gradient(ellipse 70% 40% at 50% 0%, rgba(160, 200, 255, .08), transparent 70%);`) +
      (o.snowFlakes === false ? "" : movingDots("after", FLAKES, 440, 22, "down", motion)) + still,
  },
};

// ---- title bar, top bar and side menu; heading fonts ------------------------------
// Dark versions of each theme's scenery for the bars, and the fonts (all come with Windows).
const CHROME = {
  dungeon: { tex: STONE, bar: "rgba(8, 6, 4, .74)", rail: "rgba(8, 6, 4, .80)", line: "#6a5240", glow: "rgba(255, 128, 36, .18)" },
  tavern: { tex: TAVERN, bar: "rgba(16, 9, 4, .58)", rail: "rgba(16, 9, 4, .66)", line: "#8a5a32", glow: "rgba(255, 150, 60, .16)" },
  starship: { tex: HULL, bar: "rgba(4, 8, 16, .70)", rail: "rgba(4, 8, 16, .78)", line: "#4fd8ff", glow: "rgba(79, 216, 255, .25)" },
  neon: { bar: "linear-gradient(180deg, #14072a, #0a0414)", rail: "linear-gradient(90deg, #0a0414, #14072a)", line: "#ff4fd8", glow: "rgba(255, 79, 216, .35)" },
  deepsea: { tex: OCEAN, bar: "rgba(2, 14, 18, .72)", rail: "rgba(2, 14, 18, .80)", line: "#2a8f88", glow: "rgba(63, 224, 197, .18)" },
  haunted: { tex: DAMASK, bar: "rgba(8, 6, 12, .62)", rail: "rgba(8, 6, 12, .72)", line: "#4a3d5a", glow: "rgba(159, 232, 112, .12)" },
  wizard: { tex: SPINES, bar: "rgba(10, 6, 20, .72)", rail: "rgba(10, 6, 20, .80)", line: "#b8954a", glow: "rgba(150, 110, 255, .2)" },
  rain: { tex: GLASS, bar: "rgba(8, 12, 16, .55)", rail: "rgba(8, 12, 16, .65)", line: "#3e5566", glow: "rgba(242, 196, 109, .10)" },
  summer: { tex: CANOPY, bar: "rgba(8, 18, 8, .70)", rail: "rgba(8, 18, 8, .78)", line: "#8fbf5a", glow: "rgba(245, 215, 110, .16)" },
  autumn: { tex: AUTUMN_WOOD, bar: "rgba(18, 10, 4, .62)", rail: "rgba(18, 10, 4, .70)", line: "#a0663a", glow: "rgba(255, 140, 66, .16)" },
  snow: { bar: "linear-gradient(180deg, #0a1328, #070d1c)", rail: "linear-gradient(90deg, #070d1c, #0e1830)", line: "#9fb4cc", glow: "rgba(159, 216, 255, .18)" },
};
const SERIF = `"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif`;
const FONTS = {
  dungeon: { family: SERIF, extra: "font-variant: small-caps; letter-spacing: .04em;" },
  tavern: { family: `Constantia, Georgia, serif` },
  starship: { family: `Bahnschrift, "Segoe UI", sans-serif`, extra: "letter-spacing: .05em;" },
  neon: { family: `Bahnschrift, "Segoe UI", sans-serif`, extra: "text-shadow: 0 0 6px rgba(255, 79, 216, .7), 0 0 14px rgba(255, 79, 216, .3);" },
  deepsea: { family: `Candara, "Segoe UI", sans-serif` },
  haunted: { family: SERIF, extra: "font-style: italic; text-shadow: 0 0 8px rgba(159, 232, 112, .3);" },
  wizard: { family: SERIF, extra: "font-variant: small-caps; letter-spacing: .05em; text-shadow: 0 0 8px rgba(232, 198, 106, .3);" },
  rain: { family: `Candara, "Segoe UI", sans-serif` },
  summer: { family: `Constantia, Georgia, serif` },
  autumn: { family: `Constantia, Georgia, serif` },
  snow: { family: `Candara, "Segoe UI", sans-serif`, extra: "text-shadow: 0 0 6px rgba(200, 230, 255, .3);" },
};
// Headings and labels only (titles, shelf names, side menu) — never the reading text.
const FONT_TARGETS = ["#appbar h1", "#toolbar p", ".shinyBlack", "#page-wrapper h1", "#page-wrapper h2",
  "#page-wrapper h3", "#absda-home h2", ".bar .title", "#mediaPlayerContainer a.truncate",
  ".absda-mood-page h1", ".absda-mood-page h2", ".absda-mood-page .ptitle"];
// The scenery texture is defined once (--absda-tex) and darkened per bar.
function chromeCss(c) {
  const bg = (v) => (c.tex ? `linear-gradient(${v}, ${v}), var(--absda-tex)` : v);
  return `html:root { ${c.tex ? `--absda-tex: ${c.tex};` : ""} --tb-image: ${bg(c.bar)}; --tb-line: ${c.line}; }
    html body div:has(> #appbar) { background: var(--tb-image) !important; box-shadow: inset 0 -2px 0 ${c.line}, 0 2px 14px ${c.glow} !important; }
    html body #mediaPlayerContainer { background: var(--tb-image) !important; box-shadow: inset 0 2px 0 ${c.line}, 0 -2px 14px ${c.glow} !important; }
    html body div:has(> #siderail-buttons-container) { background: ${bg(c.rail)} !important; box-shadow: inset -2px 0 0 ${c.line}, 2px 0 14px ${c.glow} !important; }`;
}
// The side menu is narrow: its labels get the font (and glow) but no small caps or extra spacing.
const fontCss = (ft) => `${FONT_TARGETS.map((x) => "html body " + x).join(", ")} { font-family: ${ft.family} !important; ${ft.extra || ""} }
  html body #siderail-buttons-container p { font-family: ${ft.family} !important; ${(ft.extra || "").replace(/(font-variant|letter-spacing):[^;]*;/g, "")} }`;
for (const [id, t] of Object.entries(MOOD_THEMES)) {
  const fx = t.fx;
  // Our own pages (offline library, can't-reach page) get the scenery behind their cards.
  const pageCss = `html body.absda-mood-page { background-image: ${t.page} !important; background-attachment: fixed !important; }`;
  t.fx = (motion, o) => fx(motion, o) + chromeCss(CHROME[id]) + fontCss(FONTS[id]) + pageCss;
}

module.exports = { MOOD_THEMES };
