// SPDX-License-Identifier: GPL-3.0-or-later
// Mood effects drawn on a canvas over the library (the modern versions of the mood
// themes' light layers): particles with depth — small, soft and slow far away, big,
// detailed and faster up close — drifting on a wind that gusts now and then.
// pageMain runs inside the Audiobookshelf page (main.js injects it); the canvas never takes
// clicks, runs ~30 frames a second only while the app is the window you're using
// (html.absda-idle = rest) and while no scene view covers it.

/* global window, document, performance */
function pageMain(opts) {
  const F = window.__absdaMoodFx || (window.__absdaMoodFx = {});
  F.opts = opts;
  if (F.installed) { F.apply(); return true; }
  F.installed = true;
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sprite = (size, draw) => {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    draw(c.getContext("2d"), size);
    return c;
  };

  // (Every mood theme has one; see main.js moodFxOpts.)
  // ---- Snow: tumbling crystal flakes with depth -------------------------------------
  function snow(ctx, W, H) {
    // a soft round flake (far and middle) and a few crystal shapes (near)
    const soft = sprite(32, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.45, "rgba(240,248,255,.55)"); gr.addColorStop(1, "rgba(240,248,255,0)");
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    });
    const crystal = (seed) => sprite(64, (g, s) => {
      const r = s * 0.34, c = s / 2;
      g.translate(c, c);
      g.strokeStyle = "rgba(255,255,255,.95)"; g.lineCap = "round";
      g.shadowColor = "rgba(190,225,255,.9)"; g.shadowBlur = 6;
      const br = [0.35 + (seed % 3) * 0.1, 0.62 + (seed % 2) * 0.08];
      for (let k = 0; k < 6; k++) {
        g.save(); g.rotate((k * TAU) / 6);
        g.lineWidth = 2.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -r); g.stroke();
        g.lineWidth = 1.6;
        for (const b of br) {
          g.beginPath(); g.moveTo(0, -r * b); g.lineTo(r * 0.24, -r * (b + 0.17)); g.moveTo(0, -r * b); g.lineTo(-r * 0.24, -r * (b + 0.17)); g.stroke();
        }
        g.restore();
      }
      g.fillStyle = "#fff"; g.beginPath(); g.arc(0, 0, r * 0.12, 0, TAU); g.fill();
    });
    const crystals = [crystal(0), crystal(1), crystal(2)];
    // depth: 0 far … 1 near
    const flakes = [];
    const add = (z, y) => flakes.push({
      z, x: Math.random() * W, y: y == null ? Math.random() * H : y,
      size: z < 0.7 ? 2 + z * 7 : 14 + (z - 0.7) * 40,        // pixels
      fall: 18 + z * 70, sway: rand(6, 22) * (0.4 + z), phase: rand(0, TAU), freq: rand(0.4, 1.1),
      rot: rand(0, TAU), spin: rand(-0.8, 0.8), alpha: 0.35 + z * 0.55, kind: Math.floor(Math.random() * 3),
    });
    for (let i = 0; i < 90; i++) add(Math.random() * 0.35);           // far
    for (let i = 0; i < 45; i++) add(0.35 + Math.random() * 0.35);    // middle
    for (let i = 0; i < 9; i++) add(0.72 + Math.random() * 0.28);     // near
    flakes.sort((a, b) => a.z - b.z);
    let wind = 0, windTo = 0, nextGust = 4;
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      nextGust -= dt;
      if (nextGust <= 0) { windTo = Math.random() < 0.5 ? rand(-10, 10) : rand(-45, 45); nextGust = rand(4, 10); }
      wind += (windTo - wind) * Math.min(1, dt * 0.6);
      for (const f of flakes) {
        f.y += f.fall * dt;
        f.x += (wind * (0.3 + f.z) + Math.sin(t * f.freq + f.phase) * f.sway * 0.6) * dt;
        f.rot += f.spin * dt;
        if (f.y - f.size > H) { f.y = -f.size; f.x = Math.random() * W; }
        if (f.x < -40) f.x += W + 80; else if (f.x > W + 40) f.x -= W + 80;
        ctx.globalAlpha = f.alpha;
        if (f.z < 0.7) {
          ctx.drawImage(soft, f.x - f.size, f.y - f.size, f.size * 2, f.size * 2);
        } else {
          ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot);
          ctx.drawImage(crystals[f.kind], -f.size, -f.size, f.size * 2, f.size * 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;
    };
  }

  // ---- shared bits -------------------------------------------------------------------
  // A soft round glow in one colour (stamped many times: far cheaper than a gradient each time).
  const glows = {};
  const glow = (rgb) => glows[rgb] || (glows[rgb] = sprite(64, (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.4, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  }));
  const stamp = (ctx, img, x, y, rw, rh, alpha) => {
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.drawImage(img, x - rw, y - rh, rw * 2, rh * 2);
  };
  // Darker corners (drawn once).
  const vignette = (W, H, a) => sprite(Math.max(W, H), (g, s) => {
    const gr = g.createRadialGradient(s / 2, s / 2, s * 0.32, s / 2, s / 2, s * 0.72);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, `rgba(0,0,0,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  });
  // A value that wanders smoothly (flames, flicker).
  const flicker = (lo, hi, speed) => { let v = (lo + hi) / 2; return () => (v += (rand(lo, hi) - v) * speed); };
  // Light shafts falling from the top, swaying (deep sea, summer).
  function shafts(ctx, W, H, t, rgb, alpha, from) {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 5; i++) {
      const sway = Math.sin(t * 0.25 + i * 1.7) * W * 0.03;
      const x = W * (from + i * 0.16) + sway, w0 = W * (0.025 + (i % 2) * 0.02), w1 = w0 * 4;
      const gr = ctx.createLinearGradient(0, 0, 0, H * 0.85);
      gr.addColorStop(0, `rgba(${rgb},${alpha})`); gr.addColorStop(1, `rgba(${rgb},0)`);
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 0.6 + i);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x - w0, 0); ctx.lineTo(x + w0, 0); ctx.lineTo(x + w1 + W * 0.12, H * 0.85); ctx.lineTo(x - w1 + W * 0.12, H * 0.85); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  // ---- Dungeon: two torches on the walls, warm dust in their light ---------------------
  function dungeon(ctx, W, H) {
    const vig = vignette(W, H, 0.42);
    const torches = [{ x: 0, y: H * 0.22, f: flicker(0.72, 1.12, 0.3) }, { x: W, y: H * 0.22, f: flicker(0.72, 1.12, 0.3) }];
    const motes = Array.from({ length: 70 }, () => ({ side: Math.random() < 0.5 ? 0 : 1, x: rand(0, 0.38), y: rand(0.02, 0.75), vx: rand(-4, 4), vy: rand(-8, 3), p: rand(0, TAU), r: rand(0.8, 2.2) }));
    const embers = [];
    const warm = glow("255,140,50"), hot = glow("255,200,110");
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1; ctx.drawImage(vig, (W - vig.width) / 2, (H - vig.height) / 2);
      ctx.globalCompositeOperation = "lighter";
      for (const tc of torches) {
        const f = tc.f();
        stamp(ctx, warm, tc.x, tc.y, H * 0.5 * f, H * 0.62 * f, 0.34 * f);
        stamp(ctx, hot, tc.x, tc.y, H * 0.1 * f, H * 0.14 * f, 0.3 * f);
        if (Math.random() < 0.08) embers.push({ x: tc.x + (tc.x ? -1 : 1) * rand(4, 20), y: tc.y - H * 0.04, vx: (tc.x ? -1 : 1) * rand(2, 14), vy: rand(-40, -18), life: 0, max: rand(1.2, 2.4) });
      }
      for (const m of motes) {
        m.x += (m.vx + Math.sin(t * 0.5 + m.p) * 4) * dt / W; m.y += m.vy * dt / H;
        if (m.y < 0) m.y = 0.78; if (m.y > 0.8) m.y = 0.02; if (m.x < 0) m.x = 0.38; if (m.x > 0.4) m.x = 0;
        const px = m.side ? W - m.x * W : m.x * W, py = m.y * H;
        const lit = Math.max(0, 1 - Math.hypot(m.x * W, py - H * 0.22) / (H * 0.6));
        stamp(ctx, hot, px, py, m.r * 2, m.r * 2, lit * (0.45 + 0.35 * Math.sin(t * 2 + m.p)));
      }
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]; e.life += dt; e.x += e.vx * dt; e.y += e.vy * dt;
        const k = e.life / e.max;
        if (k >= 1) { embers.splice(i, 1); continue; }
        stamp(ctx, hot, e.x, e.y, 3, 3, 1 - k);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
  }

  // ---- Fireside Tavern: the hearth's glow from below, embers curling up ----------------
  function tavern(ctx, W, H) {
    const vig = vignette(W, H, 0.3);
    const f = flicker(0.75, 1.1, 0.25);
    const warm = glow("255,130,40"), hot = glow("255,190,90");
    const embers = [], bokeh = Array.from({ length: 10 }, () => ({ x: Math.random() * W, y: rand(H * 0.4, H), r: rand(10, 22), vy: rand(-10, -4), p: rand(0, TAU) }));
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 1; ctx.drawImage(vig, (W - vig.width) / 2, (H - vig.height) / 2);
      ctx.globalCompositeOperation = "lighter";
      const v = f();
      stamp(ctx, warm, W * 0.5, H * 1.05, W * 0.55 * v, H * 0.42 * v, 0.3 * v);
      if (Math.random() < 0.55) embers.push({ x: W * 0.5 + rand(-W * 0.3, W * 0.3), y: H + 6, vx: rand(-12, 12), vy: rand(-90, -45), life: 0, max: rand(2.5, 5), p: rand(0, TAU), trail: [] });
      for (let i = embers.length - 1; i >= 0; i--) {
        const e = embers[i]; e.life += dt;
        e.x += (e.vx + Math.sin(t * 1.6 + e.p) * 22) * dt; e.y += e.vy * dt; e.vy *= 0.997;
        const k = e.life / e.max;
        if (k >= 1 || e.y < -10) { embers.splice(i, 1); continue; }
        e.trail.push(e.x, e.y); if (e.trail.length > 12) e.trail.splice(0, 2);
        ctx.strokeStyle = `rgba(255,${(160 - 80 * k) | 0},60,${(0.35 * (1 - k)).toFixed(2)})`;
        ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(e.trail[0], e.trail[1]);
        for (let j = 2; j < e.trail.length; j += 2) ctx.lineTo(e.trail[j], e.trail[j + 1]);
        ctx.stroke();
        stamp(ctx, hot, e.x, e.y, 3.5, 3.5, (1 - k) * (0.7 + 0.3 * Math.sin(t * 9 + e.p)));
      }
      for (const b of bokeh) {
        b.y += b.vy * dt; if (b.y < -30) { b.y = H + 30; b.x = Math.random() * W; }
        stamp(ctx, warm, b.x, b.y, b.r, b.r, 0.08 + 0.05 * Math.sin(t * 0.8 + b.p));
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
  }

  // ---- Starship: stars at three depths sliding past, the odd shooting star --------------
  function starship(ctx, W, H) {
    const layers = [[140, 6, 0.7, 0.45], [70, 16, 1.2, 0.65], [26, 42, 2, 0.9]].map(([n, speed, size, a]) =>
      ({ speed, size, a, stars: Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, p: rand(0, TAU), s: rand(0.5, 2) })) }));
    const white = glow("220,235,255"), blue = glow("120,200,255");
    let shoot = null, next = rand(5, 12);
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (const l of layers) {
        for (const s of l.stars) {
          s.x -= l.speed * 0.35 * dt; s.y += l.speed * dt;
          if (s.y > H + 4) { s.y = -4; s.x = Math.random() * (W + 60); }
          if (s.x < -4) s.x += W + 8;
          const a = l.a * (0.6 + 0.4 * Math.sin(t * s.s + s.p));
          stamp(ctx, l.size > 1.5 ? blue : white, s.x, s.y, l.size * 1.6, l.size * 1.6, a);
        }
      }
      next -= dt;
      if (!shoot && next <= 0) { shoot = { x: rand(W * 0.2, W), y: rand(0, H * 0.35), life: 0, max: 0.9 }; next = rand(6, 14); }
      if (shoot) {
        shoot.life += dt;
        const k = shoot.life / shoot.max;
        const x = shoot.x - k * W * 0.35, y = shoot.y + k * H * 0.22;
        const gr = ctx.createLinearGradient(x, y, x + W * 0.08, y - H * 0.05);
        gr.addColorStop(0, `rgba(200,235,255,${(0.9 * (1 - k)).toFixed(2)})`); gr.addColorStop(1, "rgba(200,235,255,0)");
        ctx.globalAlpha = 1; ctx.strokeStyle = gr; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + W * 0.08, y - H * 0.05); ctx.stroke();
        stamp(ctx, white, x, y, 5, 5, 1 - k);
        if (k >= 1) shoot = null;
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
  }

  // ---- Neon Nights: a glowing grid floor rolling towards you, coloured haze -------------
  function neon(ctx, W, H) {
    const pink = glow("255,79,216"), cyan = glow("79,216,255");
    const haze = Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * W, y: rand(H * 0.1, H * 0.6), r: rand(W * 0.08, W * 0.18), vx: rand(-8, 8), c: i % 2 ? pink : cyan, p: rand(0, TAU) }));
    const y0 = H * 0.66;
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      stamp(ctx, pink, W / 2, y0, W * 0.6, H * 0.14, 0.32);                  // the horizon glow
      stamp(ctx, cyan, W / 2, y0, W * 0.4, H * 0.06, 0.18);
      for (const h of haze) {
        h.x += h.vx * dt; if (h.x < -h.r) h.x = W + h.r; if (h.x > W + h.r) h.x = -h.r;
        stamp(ctx, h.c, h.x, h.y, h.r, h.r * 0.6, 0.05 + 0.03 * Math.sin(t * 0.4 + h.p));
      }
      // the grid: lines to the vanishing point, and cross lines coming closer
      const offset = (t * 0.35) % 1;
      const vlines = () => { ctx.beginPath(); for (let i = -14; i <= 14; i++) { ctx.moveTo(W / 2 + i * W * 0.012, y0); ctx.lineTo(W / 2 + i * W * 0.11, H); } };
      const hlines = () => { ctx.beginPath(); for (let k = 0; k < 14; k++) { const z = (k + offset) / 14, y = y0 + (H - y0) * z * z; ctx.moveTo(0, y); ctx.lineTo(W, y); } };
      for (const [width, a] of [[6, 0.08], [1.5, 0.45]]) {
        ctx.lineWidth = width; ctx.globalAlpha = a;
        ctx.strokeStyle = "#ff4fd8"; vlines(); ctx.stroke();
        ctx.strokeStyle = "#4fd8ff"; hlines(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      // the far end of the floor fades into the haze
      const fade = ctx.createLinearGradient(0, y0, 0, y0 + (H - y0) * 0.35);
      fade.addColorStop(0, "rgba(13,6,24,.85)"); fade.addColorStop(1, "rgba(13,6,24,0)");
      ctx.fillStyle = fade; ctx.fillRect(0, y0 - 1, W, (H - y0) * 0.35 + 1);
    };
  }

  // ---- Deep Sea: light shafts from the surface, bubbles wobbling up ---------------------
  function deepsea(ctx, W, H) {
    const bubbles = Array.from({ length: 45 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.pow(Math.random(), 2) * 9 + 2, p: rand(0, TAU) }));
    const snowP = Array.from({ length: 90 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: rand(0.6, 1.6), vx: rand(-3, 3), vy: rand(2, 8) }));
    const shine = glow("200,255,250");
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      shafts(ctx, W, H, t, "140,255,240", 0.09, 0.08);
      ctx.fillStyle = "rgba(200,240,235,.35)";
      for (const s of snowP) {                                  // tiny particles drifting in the water
        s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.lineWidth = 1.2;
      for (const b of bubbles) {
        b.y -= (18 + b.r * 6) * dt; b.x += Math.sin(t * 2.2 + b.p) * b.r * 3 * dt;
        if (b.y < -b.r * 2) { b.y = H + b.r * 2; b.x = Math.random() * W; }
        const wob = 1 + Math.sin(t * 6 + b.p) * 0.08;
        ctx.strokeStyle = "rgba(190,255,245,.45)";
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * wob, b.r / wob, 0, 0, TAU); ctx.stroke();
        ctx.globalCompositeOperation = "lighter";
        stamp(ctx, shine, b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.45, b.r * 0.45, 0.7);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    };
  }

  // ---- Haunted Manor: fog drifting in layers, lightning now and then, green wisps -------
  function haunted(ctx, W, H) {
    const fogImg = glow("180,170,210"), wisp = glow("159,232,112");
    const fog = Array.from({ length: 12 }, (_, i) => ({ x: Math.random() * W, y: rand(H * 0.55, H * 1.02), r: rand(W * 0.18, W * 0.36), vx: (i % 3 + 1) * rand(4, 9) * (i % 2 ? 1 : -1), a: rand(0.07, 0.15) }));
    const wisps = Array.from({ length: 5 }, () => ({ cx: Math.random() * W, cy: rand(H * 0.3, H * 0.8), ax: rand(30, 90), ay: rand(15, 45), fx: rand(0.08, 0.2), fy: rand(0.1, 0.25), p: rand(0, TAU) }));
    let flash = 0, nextFlash = rand(10, 22), seq = null;
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      for (const f of fog) {
        f.x += f.vx * dt; if (f.x > W + f.r) f.x = -f.r; if (f.x < -f.r) f.x = W + f.r;
        stamp(ctx, fogImg, f.x, f.y, f.r, f.r * 0.45, f.a);
      }
      for (const w of wisps) {
        const x = w.cx + Math.sin(t * w.fx + w.p) * w.ax, y = w.cy + Math.sin(t * w.fy + w.p * 2) * w.ay;
        const a = 0.35 + 0.3 * Math.sin(t * 1.3 + w.p);
        stamp(ctx, wisp, x, y, 14, 14, a * 0.5);
        stamp(ctx, wisp, x, y, 4, 4, a);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      nextFlash -= dt;
      if (!seq && nextFlash <= 0) { seq = [[0.14, 0.07], [0, 0.12], [0.2, 0.1], [0.06, 0.25]]; flash = 0; nextFlash = rand(14, 30); }
      if (seq) {
        flash += dt;
        let acc = 0, a = 0;
        for (const [v, d] of seq) { if (flash < acc + d) { a = v; break; } acc += d; }
        if (flash >= acc && a === 0 && flash > 0.6) seq = null;
        if (a) { ctx.fillStyle = `rgba(215,220,255,${a})`; ctx.fillRect(0, 0, W, H); }
      }
    };
  }

  // ---- Wizard's Library: motes spiralling up, little sparkle bursts ---------------------
  function wizard(ctx, W, H) {
    const gold = glow("255,220,130"), violet = glow("190,150,255");
    const motes = Array.from({ length: 75 }, () => ({ x: Math.random() * W, y: Math.random() * H, vy: rand(8, 26), amp: rand(8, 30), f: rand(0.4, 1.2), p: rand(0, TAU), r: rand(1, 2.8), c: Math.random() < 0.7 ? gold : violet }));
    const bursts = [];
    let next = rand(2, 5);
    const star = (x, y, s, a) => {
      ctx.globalAlpha = a; ctx.strokeStyle = "rgba(255,240,200,1)"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y + s); ctx.stroke();
      stamp(ctx, gold, x, y, s * 0.6, s * 0.6, a);
    };
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      stamp(ctx, violet, W * 0.85, H * 0.15, W * 0.35, H * 0.35, 0.1 + 0.04 * Math.sin(t * 0.5));
      for (const m of motes) {
        m.y -= m.vy * dt; const x = m.x + Math.sin(t * m.f + m.p) * m.amp;
        if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; }
        stamp(ctx, m.c, x, m.y, m.r * 2.4, m.r * 2.4, 0.4 + 0.45 * Math.sin(t * 2.5 + m.p));
      }
      next -= dt;
      if (next <= 0) { bursts.push({ x: rand(W * 0.1, W * 0.9), y: rand(H * 0.15, H * 0.85), life: 0 }); next = rand(2.5, 6); }
      for (let i = bursts.length - 1; i >= 0; i--) {
        const b = bursts[i]; b.life += dt;
        const k = b.life / 0.9;
        if (k >= 1) { bursts.splice(i, 1); continue; }
        star(b.x, b.y, 12 * Math.sin(k * Math.PI), Math.sin(k * Math.PI));
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
  }

  // ---- Rainy Day: rain in depth, drops running down the glass ---------------------------
  function rain(ctx, W, H) {
    const lamp = glow("242,180,90");
    const layers = [[140, 650, 10, 0.12, 0.8], [70, 950, 18, 0.2, 1.1], [24, 1350, 32, 0.3, 1.6]].map(([n, speed, len, a, w]) =>
      ({ speed, len, a, w, drops: Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H })) }));
    const slope = 0.14;
    const glass = Array.from({ length: 34 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: rand(1.5, 4.5), v: 0, wait: rand(0, 8), trail: 0 }));
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      stamp(ctx, lamp, W, H, W * 0.42, H * 0.48, 0.16);
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgb(190,210,230)";
      for (const l of layers) {
        ctx.globalAlpha = l.a; ctx.lineWidth = l.w;
        ctx.beginPath();
        for (const d of l.drops) {
          d.y += l.speed * dt; d.x -= l.speed * slope * dt;
          if (d.y > H) { d.y = -l.len - Math.random() * 40; d.x = Math.random() * (W * 1.15); }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + l.len * slope, d.y - l.len);
        }
        ctx.stroke();
      }
      // drops on the window: resting, then running down with a trail
      for (const g of glass) {
        if (g.v === 0) { g.wait -= dt; if (g.wait <= 0) g.v = rand(40, 140); }
        else { g.y += g.v * dt; g.trail = Math.min(60, g.trail + g.v * dt); if (Math.random() < 0.02) { g.v = 0; g.wait = rand(1, 5); } }
        if (g.y > H + 10) { g.y = rand(-20, H * 0.5); g.x = Math.random() * W; g.v = 0; g.wait = rand(0, 6); g.trail = 0; }
        if (g.trail > 0) {
          const gr = ctx.createLinearGradient(g.x, g.y - g.trail, g.x, g.y);
          gr.addColorStop(0, "rgba(200,220,240,0)"); gr.addColorStop(1, "rgba(200,220,240,.25)");
          ctx.globalAlpha = 1; ctx.strokeStyle = gr; ctx.lineWidth = g.r * 0.6;
          ctx.beginPath(); ctx.moveTo(g.x, g.y - g.trail); ctx.lineTo(g.x, g.y); ctx.stroke();
          if (g.v === 0) g.trail = Math.max(0, g.trail - 20 * dt);
        }
        ctx.globalAlpha = 0.55; ctx.fillStyle = "rgba(170,195,220,1)";
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.8; ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(g.x - g.r * 0.35, g.y - g.r * 0.35, g.r * 0.3, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
  }

  // ---- Summer Woods: sun rays swaying, pollen glinting in the light ---------------------
  function summer(ctx, W, H) {
    const sun = glow("255,235,150"), pollen = glow("255,250,210");
    const motes = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: rand(-6, 6), vy: rand(-6, 2), p: rand(0, TAU), r: rand(1, 2.6) }));
    const bokeh = Array.from({ length: 8 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.7, r: rand(14, 30), vx: rand(-5, 5), p: rand(0, TAU) }));
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      stamp(ctx, sun, W * 0.18, -H * 0.05, W * 0.5, H * 0.5, 0.2);
      ctx.globalCompositeOperation = "source-over";
      shafts(ctx, W, H, t, "255,230,150", 0.075, 0.02);
      ctx.globalCompositeOperation = "lighter";
      for (const b of bokeh) {
        b.x += b.vx * dt; if (b.x < -b.r) b.x = W + b.r; if (b.x > W + b.r) b.x = -b.r;
        stamp(ctx, sun, b.x, b.y, b.r, b.r, 0.06 + 0.04 * Math.sin(t * 0.6 + b.p));
      }
      for (const m of motes) {
        m.x += (m.vx + Math.sin(t * 0.7 + m.p) * 6) * dt; m.y += (m.vy + Math.cos(t * 0.5 + m.p) * 4) * dt;
        if (m.x < 0) m.x += W; if (m.x > W) m.x -= W; if (m.y < 0) m.y += H; if (m.y > H) m.y -= H;
        const inLight = Math.max(0.25, 1 - Math.hypot(m.x - W * 0.25, m.y) / (W * 0.8));
        const glint = Math.pow(0.5 + 0.5 * Math.sin(t * 3 + m.p * 3), 4);
        stamp(ctx, pollen, m.x, m.y, m.r * 2.2, m.r * 2.2, inLight * (0.25 + 0.65 * glint));
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };
  }

  // ---- Autumn Woods: leaves tumbling and flipping as they fall -------------------------
  function autumn(ctx, W, H) {
    const colours = ["#d9622b", "#e8a33a", "#b8401c", "#c9952e", "#8a4a1c", "#e07a2e"];
    const leafImgs = colours.map((c) => sprite(48, (g, s) => {
      g.translate(s / 2, s / 2);
      g.fillStyle = c;
      g.beginPath(); g.moveTo(0, -s * 0.42); g.quadraticCurveTo(s * 0.34, -s * 0.12, 0, s * 0.42); g.quadraticCurveTo(-s * 0.34, -s * 0.12, 0, -s * 0.42); g.fill();
      g.strokeStyle = "rgba(60,25,5,.5)"; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(0, -s * 0.38); g.lineTo(0, s * 0.46); g.stroke();
      for (const k of [-0.15, 0.05, 0.22]) { g.beginPath(); g.moveTo(0, s * k); g.lineTo(s * 0.14, s * (k - 0.12)); g.moveTo(0, s * k); g.lineTo(-s * 0.14, s * (k - 0.12)); g.stroke(); }
    }));
    const leaves = Array.from({ length: 28 }, () => {
      const z = Math.random();
      return { z, x: Math.random() * W, y: Math.random() * H, size: 7 + z * 16, fall: 22 + z * 45, sway: rand(15, 45), f: rand(0.5, 1.2), p: rand(0, TAU), rot: rand(0, TAU), spin: rand(-1.4, 1.4), flip: rand(1, 3), img: leafImgs[Math.floor(Math.random() * leafImgs.length)] };
    }).sort((a, b) => a.z - b.z);
    let wind = 0, windTo = 0, nextGust = 3;
    return function frame(t, dt) {
      ctx.clearRect(0, 0, W, H);
      nextGust -= dt;
      if (nextGust <= 0) { windTo = Math.random() < 0.5 ? rand(-15, 15) : rand(-70, 70); nextGust = rand(4, 9); }
      wind += (windTo - wind) * Math.min(1, dt * 0.7);
      for (const l of leaves) {
        l.y += l.fall * dt;
        l.x += (wind * (0.4 + l.z) + Math.sin(t * l.f + l.p) * l.sway) * dt;
        l.rot += l.spin * dt;
        if (l.y - l.size > H) { l.y = -l.size * 2; l.x = Math.random() * W; }
        if (l.x < -40) l.x += W + 80; else if (l.x > W + 40) l.x -= W + 80;
        ctx.save();
        ctx.globalAlpha = 0.55 + l.z * 0.45;
        ctx.translate(l.x, l.y); ctx.rotate(l.rot);
        ctx.scale(Math.cos(t * l.flip + l.p), 1);              // turning over as it falls
        ctx.drawImage(l.img, -l.size, -l.size, l.size * 2, l.size * 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
  }

  const EFFECTS = { snow, dungeon, tavern, starship, neon, deepsea, haunted, wizard, rain, summer, autumn };

  // ---- the canvas over the library ----
  const css = document.createElement("style");
  css.textContent = `#absda-mood-fx { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147482002; }
    /* while the canvas draws a mood, the theme's older CSS light layers step aside */
    html.absda-moodfx-on body:is(:has(#__nuxt), .absda-mood-page)::before, html.absda-moodfx-on body:is(:has(#__nuxt), .absda-mood-page)::after { display: none !important; }`;
  document.head.append(css);
  let canvas = null, frame = null, timer = 0, last = 0, t0 = performance.now(), current = null;
  function resize() {
    if (!canvas) return;
    const k = Math.min(1, Math.sqrt(1.2e6 / (window.innerWidth * window.innerHeight)));
    canvas.width = Math.round(window.innerWidth * k);
    canvas.height = Math.round(window.innerHeight * k);
    frame = EFFECTS[current](canvas.getContext("2d"), canvas.width, canvas.height);
  }
  const resting = () => document.hidden || document.documentElement.classList.contains("absda-idle");
  function loop() {
    timer = window.setTimeout(loop, 1000 / 30);
    if (resting()) { last = 0; return; }
    const now = performance.now();
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    frame((now - t0) / 1000, dt);
  }
  F.apply = () => {
    const want = F.opts.effect && EFFECTS[F.opts.effect] && F.opts.motion ? F.opts.effect : null;
    if (want === current) return;
    window.clearTimeout(timer);
    if (canvas) { canvas.remove(); canvas = null; }
    current = want;
    document.documentElement.classList.toggle("absda-moodfx-on", !!want);
    if (!want) return;
    canvas = document.createElement("canvas");
    canvas.id = "absda-mood-fx";
    document.body.append(canvas);
    resize();
    loop();
  };
  window.addEventListener("resize", resize);
  F.apply();
  return true;
}

module.exports = (opts) => `(${pageMain.toString()})(${JSON.stringify(opts)})`;
