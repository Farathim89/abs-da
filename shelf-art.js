// SPDX-License-Identifier: GPL-3.0-or-later
// ---------------------------------------------------------------------------
// Bookshelf art: procedural textures (SVG), so there are no image files or
// copyright concerns, they're tiny, sharp at any size and tile seamlessly.
// Each entry: label, svg (texture tile; none = flat/original), plank (shelf
// gradient). No Electron dependencies — can be previewed with plain Node.
// ---------------------------------------------------------------------------

// Small deterministic random generator, so the art is identical every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "#rrggbb" → "r g b" as 0–1 values for an SVG colour matrix.
function rgb01(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3));
}

// A filter that turns noise into one colour with alpha = noise*gain - cut.
function noiseFilter(id, { type = "fractalNoise", freq, octaves = 3, seed = 1, color, gain = 1.6, cut = 0.55 }) {
  const [r, g, b] = rgb01(color);
  return `<filter id='${id}' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='${type}' baseFrequency='${freq}' numOctaves='${octaves}' seed='${seed}' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${gain} 0 0 0 -${cut}'/></filter>`;
}

const svg = (w, h, body) => `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${body}</svg>`;
const layer = (filterId, opacity = 1) => `<rect width='100%' height='100%' filter='url(#${filterId})' opacity='${opacity}'/>`;

// Vertical wood planks with grain, per-plank shading and seams.
function wood({ base, dark, light, seed, plankW = 120, size = 480 }) {
  const rand = rng(seed);
  let planks = "";
  for (let x = 0; x < size; x += plankW) {
    const shade = (rand() * 0.22 - 0.11).toFixed(3);
    planks += shade > 0
      ? `<rect x='${x}' width='${plankW}' height='${size}' fill='rgba(0,0,0,${shade})'/>`
      : `<rect x='${x}' width='${plankW}' height='${size}' fill='rgba(255,255,255,${-shade * 0.5})'/>`;
    planks += `<rect x='${x}' width='2' height='${size}' fill='rgba(0,0,0,0.5)'/>` +
      `<rect x='${x + 2}' width='1' height='${size}' fill='rgba(255,255,255,0.07)'/>`;
  }
  return svg(size, size,
    noiseFilter("g", { freq: "0.05 0.003", octaves: 4, seed, color: dark, gain: 1.7, cut: 0.5 }) +
    noiseFilter("h", { freq: "0.12 0.006", octaves: 2, seed: seed + 9, color: light, gain: 1.4, cut: 0.6 }) +
    `<rect width='100%' height='100%' fill='${base}'/>` + layer("g") + layer("h", 0.7) + planks);
}

// Marble slab: straight vein lines warped by noise into flowing veins, with a
// thin joint line at the tile edge (reads as marble wall tiles).
function marble() {
  const S = 640;
  const rand = rng(11);
  let lines = "";
  for (let i = 0; i < 7; i++) {          // main light veins
    const x0 = -300 + i * 160 + rand() * 60;
    lines += `<line x1='${x0.toFixed(1)}' y1='-80' x2='${(x0 + 520).toFixed(1)}' y2='${S + 80}' stroke='#e6e7ea' ` +
      `stroke-width='${(0.8 + rand() * 2.2).toFixed(2)}' opacity='${(0.35 + rand() * 0.5).toFixed(2)}'/>`;
  }
  for (let i = 0; i < 6; i++) {          // fainter cross veins
    const y0 = -100 + i * 140 + rand() * 50;
    lines += `<line x1='-80' y1='${y0.toFixed(1)}' x2='${S + 80}' y2='${(y0 + 260).toFixed(1)}' stroke='#9da2aa' ` +
      `stroke-width='${(0.6 + rand()).toFixed(2)}' opacity='${(0.25 + rand() * 0.3).toFixed(2)}'/>`;
  }
  return svg(S, S,
    `<filter id='d' x='-20%' y='-20%' width='140%' height='140%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='0.006' numOctaves='4' seed='5' result='n'/>` +
    `<feDisplacementMap in='SourceGraphic' in2='n' scale='110' xChannelSelector='R' yChannelSelector='G'/></filter>` +
    noiseFilter("c", { freq: "0.008", octaves: 3, seed: 4, color: "#000000", gain: 1.2, cut: 0.45 }) +
    `<rect width='100%' height='100%' fill='#2b2d31'/>` + layer("c", 0.6) +
    `<g filter='url(#d)'>${lines}</g>` +
    `<rect width='${S}' height='${S}' fill='none' stroke='rgba(0,0,0,0.35)' stroke-width='2'/>`);
}

function slate() {
  return svg(400, 400,
    noiseFilter("b", { freq: "0.012", octaves: 4, seed: 21, color: "#000000", gain: 1.3, cut: 0.4 }) +
    noiseFilter("s", { freq: "0.7", octaves: 2, seed: 5, color: "#9aa3ad", gain: 1.4, cut: 0.7 }) +
    `<rect width='100%' height='100%' fill='#363a40'/>` + layer("b", 0.8) + layer("s", 0.5));
}

function leather() {
  return svg(400, 400,
    noiseFilter("p", { freq: "0.9", octaves: 2, seed: 8, color: "#1c0f07", gain: 1.6, cut: 0.6 }) +
    noiseFilter("m", { freq: "0.015", octaves: 3, seed: 13, color: "#b9875e", gain: 1.2, cut: 0.55 }) +
    `<rect width='100%' height='100%' fill='#563622'/>` + layer("m", 0.45) + layer("p", 0.8));
}

function linen() {
  return svg(256, 256,
    `<pattern id='w' width='4' height='4' patternUnits='userSpaceOnUse'>` +
    `<rect width='4' height='1' fill='rgba(255,255,255,0.06)'/><rect width='1' height='4' fill='rgba(0,0,0,0.18)'/></pattern>` +
    noiseFilter("n", { freq: "0.05 0.8", octaves: 2, seed: 3, color: "#000000", gain: 1.2, cut: 0.55 }) +
    `<rect width='100%' height='100%' fill='#45413a'/>` + layer("n", 0.6) +
    `<rect width='100%' height='100%' fill='url(#w)'/>`);
}

function metal() {
  return svg(512, 512,
    noiseFilter("l", { freq: "0.0015 0.45", octaves: 3, seed: 6, color: "#e8ecf2", gain: 1.5, cut: 0.62 }) +
    noiseFilter("d", { freq: "0.002 0.25", octaves: 2, seed: 17, color: "#1e2126", gain: 1.5, cut: 0.6 }) +
    `<rect width='100%' height='100%' fill='#4a4e54'/>` + layer("d", 0.8) + layer("l", 0.35));
}

function brick() {
  const rand = rng(29);
  const bw = 80, bh = 30, m = 4, cols = 4, rows = 4;
  let bricks = "";
  for (let r = 0; r < rows; r++) {
    const off = r % 2 ? -bw / 2 : 0;
    for (let c = 0; c <= cols; c++) {
      const v = Math.round(rand() * 26 - 13);
      const fill = `rgb(${120 + v},${52 + v / 2},${38 + v / 3})`;
      bricks += `<rect x='${off + c * bw + m / 2}' y='${r * bh + m / 2}' width='${bw - m}' height='${bh - m}' fill='${fill}'/>`;
    }
  }
  return svg(bw * cols, bh * rows,
    noiseFilter("t", { freq: "0.6", octaves: 2, seed: 2, color: "#000000", gain: 1.5, cut: 0.6 }) +
    `<rect width='100%' height='100%' fill='#2c2622'/>` + bricks + layer("t", 0.5));
}

function stars() {
  const rand = rng(42);
  let dots = "";
  for (let i = 0; i < 110; i++) {
    const r = (rand() ** 3) * 1.6 + 0.35;
    dots += `<circle cx='${(rand() * 480).toFixed(1)}' cy='${(rand() * 480).toFixed(1)}' r='${r.toFixed(2)}' fill='#ffffff' opacity='${(0.35 + rand() * 0.65).toFixed(2)}'/>`;
  }
  return svg(480, 480,
    noiseFilter("n", { freq: "0.006", octaves: 4, seed: 9, color: "#6a4fd8", gain: 1.3, cut: 0.62 }) +
    noiseFilter("k", { freq: "0.008", octaves: 3, seed: 31, color: "#1d6fd8", gain: 1.3, cut: 0.64 }) +
    `<rect width='100%' height='100%' fill='#0b1026'/>` + layer("n", 0.55) + layer("k", 0.45) + dots);
}

// Bamboo panel: vertical stalks with shading and growth rings ("nodes").
function bamboo() {
  const rand = rng(51);
  const W = 60, S = 360;
  let stalks = "";
  for (let x = 0; x < S; x += W) {
    const tone = Math.round(rand() * 24 - 12);
    stalks += `<rect x='${x}' width='${W}' height='${S}' fill='rgb(${196 + tone},${172 + tone},${104 + tone})'/>` +
      `<rect x='${x}' width='${W}' height='${S}' fill='url(#round)'/>` +
      `<rect x='${x}' width='1.5' height='${S}' fill='rgba(60,45,15,0.55)'/>`;
    for (let n = 0; n < 2; n++) {           // growth rings
      const y = Math.round(n * 180 + 40 + rand() * 90);
      stalks += `<rect x='${x}' y='${y}' width='${W}' height='4' fill='rgba(90,70,25,0.55)'/>` +
        `<rect x='${x}' y='${y + 4}' width='${W}' height='2' fill='rgba(255,245,200,0.35)'/>`;
    }
  }
  return svg(S, S,
    `<linearGradient id='round' x1='0' x2='1'><stop offset='0' stop-color='#000' stop-opacity='0.28'/>` +
    `<stop offset='0.35' stop-color='#fff' stop-opacity='0.12'/><stop offset='1' stop-color='#000' stop-opacity='0.32'/></linearGradient>` +
    noiseFilter("g", { freq: "0.6 0.012", octaves: 2, seed: 9, color: "#5a4818", gain: 1.4, cut: 0.6 }) +
    stalks + layer("g", 0.6));
}

function concrete() {
  const rand = rng(77);
  let pores = "";
  for (let i = 0; i < 70; i++) {
    pores += `<circle cx='${(rand() * 400).toFixed(1)}' cy='${(rand() * 400).toFixed(1)}' r='${(0.5 + rand() * 1.6).toFixed(2)}' fill='rgba(0,0,0,${(0.25 + rand() * 0.35).toFixed(2)})'/>`;
  }
  return svg(400, 400,
    noiseFilter("b", { freq: "0.01", octaves: 4, seed: 61, color: "#000000", gain: 1.2, cut: 0.42 }) +
    noiseFilter("f", { freq: "0.9", octaves: 2, seed: 62, color: "#b5b5b0", gain: 1.3, cut: 0.68 }) +
    `<rect width='100%' height='100%' fill='#5d5e5b'/>` + layer("b", 0.55) + layer("f", 0.45) + pores);
}

// Carbon fibre twill: 2×2 weave cells with opposite sheen.
function carbon() {
  return svg(256, 256,
    `<linearGradient id='a' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#3a3a3a'/><stop offset='1' stop-color='#141414'/></linearGradient>` +
    `<linearGradient id='b' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#2e2e2e'/><stop offset='1' stop-color='#0c0c0c'/></linearGradient>` +
    `<pattern id='w' width='16' height='16' patternUnits='userSpaceOnUse'>` +
    `<rect width='8' height='8' fill='url(#a)'/><rect x='8' width='8' height='8' fill='url(#b)'/>` +
    `<rect y='8' width='8' height='8' fill='url(#b)'/><rect x='8' y='8' width='8' height='8' fill='url(#a)'/></pattern>` +
    `<rect width='100%' height='100%' fill='url(#w)'/>`);
}

// Aged parchment: dark age stains, pale patches and paper fibres.
function parchment() {
  return svg(480, 480,
    noiseFilter("s", { freq: "0.007", octaves: 4, seed: 83, color: "#4a3518", gain: 1.6, cut: 0.45 }) +
    noiseFilter("p", { freq: "0.012", octaves: 3, seed: 85, color: "#ecdcb4", gain: 1.4, cut: 0.6 }) +
    noiseFilter("f", { freq: "0.9 0.05", octaves: 2, seed: 84, color: "#3d2b12", gain: 1.5, cut: 0.65 }) +
    `<rect width='100%' height='100%' fill='#a88c5f'/>` + layer("p", 0.5) + layer("s", 0.75) + layer("f", 0.4));
}

// Deep water: blue/teal depth noise plus a network of light ripples.
function ocean() {
  return svg(480, 480,
    noiseFilter("d", { freq: "0.006", octaves: 4, seed: 91, color: "#010a14", gain: 1.3, cut: 0.4 }) +
    noiseFilter("t", { freq: "0.012", octaves: 3, seed: 92, color: "#1a8aa8", gain: 1.3, cut: 0.6 }) +
    `<filter id='c' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='turbulence' baseFrequency='0.022' numOctaves='2' seed='93' stitchTiles='stitch'/>` +
    `<feColorMatrix values='0 0 0 0 0.62 0 0 0 0 0.9 0 0 0 0 0.96 -3.2 0 0 0 0.55'/></filter>` +
    `<rect width='100%' height='100%' fill='#0a3550'/>` + layer("d", 0.7) + layer("t", 0.5) + layer("c", 0.35));
}

// Northern lights: vertical green and violet curtains over a starry sky.
function aurora() {
  const rand = rng(7);
  let dots = "";
  for (let i = 0; i < 60; i++) {
    dots += `<circle cx='${(rand() * 480).toFixed(1)}' cy='${(rand() * 480).toFixed(1)}' r='${((rand() ** 3) * 1.3 + 0.3).toFixed(2)}' fill='#ffffff' opacity='${(0.3 + rand() * 0.6).toFixed(2)}'/>`;
  }
  return svg(480, 480,
    noiseFilter("g", { freq: "0.012 0.0025", octaves: 3, seed: 101, color: "#38e8a0", gain: 1.9, cut: 0.6 }) +
    noiseFilter("v", { freq: "0.009 0.003", octaves: 3, seed: 102, color: "#9a5cff", gain: 1.7, cut: 0.62 }) +
    `<rect width='100%' height='100%' fill='#060b1c'/>` + dots + layer("v", 0.7) + layer("g", 0.75));
}

// Shelf plank gradient (top highlight → body → bottom shadow).
const plank = (hi, body, lo) => `linear-gradient(180deg, ${hi} 0%, ${body} 17%, ${body} 88%, ${lo} 100%)`;

// `group` puts a separator between groups in the View → Bookshelf menu.
const SHELF_ARTS = {
  classic: { group: "wood", label: "Classic wood" },   // the web app's own wood (tinted by the theme)
  oak: {
    group: "wood",
    label: "Light oak",
    svg: wood({ base: "#b98b5a", dark: "#7a5532", light: "#e2bd8e", seed: 3 }),
    plank: plank("#e6c79c", "#b3874f", "#7f5c33"),
  },
  walnut: {
    group: "wood",
    label: "Dark walnut",
    svg: wood({ base: "#3d2617", dark: "#170c05", light: "#6e4a30", seed: 7 }),
    plank: plank("#7a5236", "#46291a", "#24140b"),
  },
  cherry: {
    group: "wood",
    label: "Cherry wood",
    svg: wood({ base: "#6e2f22", dark: "#33110a", light: "#a8593f", seed: 12 }),
    plank: plank("#a5604a", "#6b2e20", "#3f170f"),
  },
  bamboo: { group: "wood", label: "Bamboo", svg: bamboo(), plank: plank("#d9c58a", "#a8904f", "#6e5c2e") },
  marble: { group: "stone", label: "Marble", svg: marble(), plank: plank("#8b8f96", "#55595f", "#2e3034") },
  slate: { group: "stone", label: "Slate", svg: slate(), plank: plank("#6a7078", "#454a51", "#26292d") },
  concrete: { group: "stone", label: "Concrete", svg: concrete(), plank: plank("#8c8c88", "#62625f", "#3d3d3b") },
  brick: { group: "stone", label: "Brick", svg: brick(), plank: plank("#968b80", "#655b52", "#3b342e") },
  leather: { group: "material", label: "Leather", svg: leather(), plank: plank("#9a6a47", "#633f28", "#3a2416") },
  linen: { group: "material", label: "Linen", svg: linen(), plank: plank("#8a8377", "#5c564b", "#37332c") },
  parchment: { group: "material", label: "Parchment", svg: parchment(), plank: plank("#8a6a43", "#5e4527", "#3a2a17") },
  metal: { group: "material", label: "Brushed metal", svg: metal(), plank: plank("#c3c7cd", "#848990", "#4f5359") },
  carbon: { group: "material", label: "Carbon fibre", svg: carbon(), plank: plank("#4a4a4a", "#262626", "#0f0f0f") },
  stars: { group: "scene", label: "Starry night", svg: stars(), plank: plank("#46548f", "#26305f", "#121838") },
  aurora: { group: "scene", label: "Aurora", svg: aurora(), plank: plank("#3d4f6e", "#1f2b45", "#0e1526") },
  ocean: { group: "scene", label: "Ocean", svg: ocean(), plank: plank("#2f6f86", "#174a5e", "#0a2a38") },
  none: { group: "none", label: "None (flat)" },
};

// CSS value for a texture: url("data:image/svg+xml,…")
const artUrl = (art) => `url("data:image/svg+xml,${encodeURIComponent(art.svg)}")`;

module.exports = { SHELF_ARTS, artUrl };
