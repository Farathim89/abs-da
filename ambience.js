// SPDX-License-Identifier: GPL-3.0-or-later
// Mood sounds: quiet background ambience for the mood themes (rain on the glass, a
// crackling hearth, dripping cave water, a starship's hum…). Real recordings (CC0, see
// sounds/CREDITS.txt) looped with a cross-fade; the sounds made with Web Audio below are
// only used if a recording can't be loaded. Runs in the title bar page, which stays open for the whole session,
// so the sound carries on across pages. main.js decides when it plays (mood theme on,
// sounds switched on, and — unless you chose otherwise — only while a book is playing).

/* global window, AudioContext */
(() => {
  const desktop = window.absDesktop;
  if (!desktop || !desktop.onAmbience) return;

  let ctx = null, master = null, white = null, brown = null;
  let current = null;          // { id, out, kit }
  let stopTimer = null;
  const rnd = (a, b) => a + Math.random() * (b - a);

  function start() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);
      // Noise to shape everything from: white (hiss) and brown (deep rumble), 4 s loops.
      const len = ctx.sampleRate * 4;
      white = ctx.createBuffer(1, len, ctx.sampleRate);
      brown = ctx.createBuffer(1, len, ctx.sampleRate);
      const w = white.getChannelData(0), b = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const r = Math.random() * 2 - 1;
        w[i] = r;
        last = (last + 0.02 * r) / 1.02;
        b[i] = last * 3.5;
      }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  // Building blocks for one mood; everything it starts is stopped by kit.stop().
  // Decoded recordings, kept for the mood that's playing (and the one before, while it fades).
  const buffers = new Map();
  async function loadBuffer(name) {
    if (buffers.has(name)) return buffers.get(name);
    const bytes = await desktop.ambienceFile(name).catch(() => null);
    if (!bytes) return null;
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const buf = await ctx.decodeAudioData(ab).catch(() => null);
    if (buf) buffers.set(name, buf);
    return buf;
  }
  function makeKit(out) {
    const nodes = [], timers = [];
    const keep = (n) => { nodes.push(n); return n; };
    const k = {
      stopped: false,
      // A recording, looped with a cross-fade (no audible seam); starts somewhere in the middle.
      async loopFile(name, gain) {
        const buf = await loadBuffer(name);
        if (!buf || k.stopped) return !!buf;
        const layer = ctx.createGain();
        layer.gain.value = gain;
        layer.connect(out);
        const XF = Math.min(3, buf.duration / 4);
        let next = ctx.currentTime + 0.05, first = true;
        const play = () => {
          if (k.stopped) return;
          const s = keep(ctx.createBufferSource());
          s.buffer = buf;
          const g = ctx.createGain();
          s.connect(g).connect(layer);
          const offset = first ? rnd(0, Math.max(0, buf.duration - XF * 3)) : 0;
          const len = buf.duration - offset;
          g.gain.setValueAtTime(0.0001, next);
          g.gain.linearRampToValueAtTime(1, next + XF);
          g.gain.setValueAtTime(1, next + len - XF);
          g.gain.linearRampToValueAtTime(0.0001, next + len);
          s.start(next, offset);
          s.stop(next + len + 0.05);
          next = next + len - XF;
          first = false;
          timers.push(setTimeout(play, Math.max(0, (next - ctx.currentTime - 1.5) * 1000)));
        };
        play();
        return true;
      },
      // Endless filtered noise (wind, rain, rumble).
      noise(kind, { type = "lowpass", freq = 1000, q = 0.7, gain = 0.2 } = {}) {
        const s = keep(ctx.createBufferSource());
        s.buffer = kind === "brown" ? brown : white;
        s.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain();
        g.gain.value = gain;
        s.connect(f).connect(g).connect(out);
        s.start(0, rnd(0, 3.9));
        return { filter: f, gain: g };
      },
      // A steady tone (engine hum, synth pad).
      tone(freq, type, gain, dest = out) {
        const o = keep(ctx.createOscillator());
        o.type = type; o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = gain;
        o.connect(g).connect(dest);
        o.start();
        return o;
      },
      // Slow wobble of a value (gusts, swells).
      lfo(param, rate, depth) {
        const o = keep(ctx.createOscillator());
        o.frequency.value = rate;
        const g = ctx.createGain();
        g.gain.value = depth;
        o.connect(g).connect(param);
        o.start();
      },
      // A short noise burst (a raindrop, a crackle, thunder).
      burst({ kind = "white", type = "bandpass", freq = 1000, q = 1, dur = 0.05, gain = 0.1, attack = 0.002, at = ctx.currentTime + 0.02, dest = out }) {
        const s = ctx.createBufferSource();
        s.buffer = kind === "brown" ? brown : white;
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(gain, at + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, at + attack + dur);
        s.connect(f).connect(g).connect(dest);
        s.start(at, rnd(0, 3.5));
        s.stop(at + attack + dur + 0.05);
      },
      // A short sliding tone (a drip, a bubble, a chime, a beep).
      chirp({ from, to = from, dur = 0.08, gain = 0.05, type = "sine", attack = 0.004, at = ctx.currentTime + 0.02, dest = out, lowpass = 0 }) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(from, at);
        o.frequency.exponentialRampToValueAtTime(to, at + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(gain, at + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, at + attack + dur);
        let last = o.connect(g);
        if (lowpass) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lowpass; last = last.connect(f); }
        last.connect(dest);
        o.start(at);
        o.stop(at + attack + dur + 0.05);
      },
      // An echo (cave, hall) to send sounds through.
      echo(time, feedback, wet) {
        const input = ctx.createGain();
        const d = ctx.createDelay(2);
        d.delayTime.value = time;
        const fb = ctx.createGain(); fb.gain.value = feedback;
        const w = ctx.createGain(); w.gain.value = wet;
        input.connect(out);
        input.connect(d); d.connect(fb).connect(d); d.connect(w).connect(out);
        return input;
      },
      // Do something every few seconds (random spacing), until the mood stops.
      every(minS, maxS, fn) {
        const tick = () => { fn(ctx.currentTime + 0.03); timers.push(setTimeout(tick, rnd(minS, maxS) * 1000)); };
        timers.push(setTimeout(tick, rnd(0, minS) * 1000));
      },
      stop() {
        k.stopped = true;
        timers.forEach(clearTimeout);
        nodes.forEach((n) => { try { n.stop(); } catch {} });
      },
    };
    return k;
  }

  // ---- the recordings (sounds/*.ogg) per mood: [file, level] -------------------------
  // Wind is mixed low on purpose (it gets tiring); drips and the clock sit under the rest.
  const RECORDINGS = {
    tavern: [["tavern", 0.75]],
    dungeon: [["dungeon", 1.3]],   // (a deep, quieter loop)
    starship: [["starship", 0.6]],
    neon: [["neon", 1.0]],
    deepsea: [["deepsea", 1.0]],
    haunted: [["haunted", 0.75]],
    wizard: [["wizard-fire", 0.9], ["wizard-clock", 0.15], ["wizard-bubbles", 0.2]],   // (clock and cauldron mixed low)
    rain: [["rain", 0.4]],
    summer: [["summer", 0.8]],
    autumn: [["autumn", 0.7]],
    snow: [["snow", 0.5]],
  };

  // ---- the moods -------------------------------------------------------------------
  const CRACKLE = (k, loud) => k.every(0.06, 0.45, (t) => {
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) k.burst({ type: "highpass", freq: rnd(1500, 4500), dur: rnd(0.004, 0.016), gain: rnd(0.06, 0.16) * loud, at: t + i * rnd(0.01, 0.03) });
  });
  const MOODS = {
    // Cave wind, water dripping into a pool with an echo, now and then a distant rumble.
    dungeon(k) {
      const wind = k.noise("brown", { type: "bandpass", freq: 260, q: 0.8, gain: 0.32 });
      k.lfo(wind.gain.gain, 0.07, 0.12);
      const cave = k.echo(0.23, 0.42, 0.55);
      k.every(1.5, 6, (t) => k.chirp({ from: rnd(1300, 2000), to: rnd(450, 700), dur: 0.06, gain: 0.12, at: t, dest: cave }));
      k.every(25, 55, (t) => k.burst({ kind: "brown", type: "lowpass", freq: 120, dur: 2.5, attack: 0.4, gain: 0.3, at: t }));
    },
    // A hearth: low roar, crackles and the odd pop.
    tavern(k) {
      const roar = k.noise("brown", { type: "lowpass", freq: 420, gain: 0.34 });
      k.lfo(roar.gain.gain, 0.3, 0.08);
      CRACKLE(k, 1);
      k.every(3, 9, (t) => k.burst({ type: "lowpass", freq: 900, dur: 0.05, gain: 0.28, at: t }));
    },
    // Engine hum, air handling, a console beep now and then.
    starship(k) {
      k.tone(55, "sine", 0.1);
      k.tone(110.6, "sine", 0.05);
      k.tone(165, "triangle", 0.012);
      k.noise("brown", { type: "lowpass", freq: 140, gain: 0.2 });
      k.noise("white", { type: "bandpass", freq: 900, q: 0.3, gain: 0.014 });
      k.every(7, 20, (t) => {
        k.chirp({ from: 1760, dur: 0.07, gain: 0.025, at: t });
        if (Math.random() < 0.5) k.chirp({ from: 2349, dur: 0.07, gain: 0.02, at: t + 0.12 });
      });
    },
    // A slow synth chord over the hum of a city at night.
    neon(k) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = 700;
      const pad = ctx.createGain(); pad.gain.value = 1;
      f.connect(pad).connect(k.out);
      for (const [hz, det] of [[220, -6], [261.63, 4], [329.63, -3], [110, 0]]) k.tone(hz, "sawtooth", 0.018, f).detune.value = det;
      k.lfo(f.frequency, 0.05, 320);
      const city = k.noise("brown", { type: "lowpass", freq: 350, gain: 0.18 });
      k.lfo(city.gain.gain, 0.03, 0.06);
    },
    // Deep water pressure, bubbles rising, a whale far away.
    deepsea(k) {
      const deep = k.noise("brown", { type: "lowpass", freq: 180, gain: 0.27 });
      k.lfo(deep.gain.gain, 0.05, 0.07);
      k.every(0.8, 4, (t) => {
        const n = 2 + Math.floor(Math.random() * 5);
        for (let i = 0, at = t; i < n; i++, at += rnd(0.05, 0.16)) k.chirp({ from: rnd(300, 600), to: rnd(900, 1600), dur: rnd(0.03, 0.07), gain: 0.05, at });
      });
      k.every(30, 70, (t) => k.chirp({ from: 115, to: 72, dur: 3.5, gain: 0.07, attack: 0.8, at: t, lowpass: 400 }));
    },
    // Howling wind, creaking boards, thunder in the distance.
    haunted(k) {
      const a = k.noise("white", { type: "bandpass", freq: 600, q: 6, gain: 0.8 });
      k.lfo(a.filter.frequency, 0.09, 250);
      const b = k.noise("white", { type: "bandpass", freq: 900, q: 8, gain: 0.5 });
      k.lfo(b.filter.frequency, 0.13, 300);
      k.every(9, 24, (t) => k.chirp({ from: 70, to: 96, dur: 0.5, gain: 0.06, type: "sawtooth", at: t, lowpass: 900 }));
      k.every(20, 45, (t) => k.burst({ kind: "brown", type: "lowpass", freq: 110, dur: 3, attack: 0.3, gain: 0.35, at: t }));
    },
    // A soft fire and magical chimes ringing out.
    wizard(k) {
      k.noise("brown", { type: "lowpass", freq: 350, gain: 0.2 });
      CRACKLE(k, 0.5);
      const hall = k.echo(0.3, 0.4, 0.5);
      const notes = [1046.5, 1318.5, 1568, 1760, 2349.3];
      k.every(2.5, 7, (t) => k.chirp({ from: notes[Math.floor(Math.random() * notes.length)], dur: 2.2, gain: 0.025, attack: 0.01, at: t, dest: hall }));
    },
    // Rain on the window and roof.
    rain(k) {
      k.noise("white", { type: "bandpass", freq: 2500, q: 0.5, gain: 0.16 });
      k.noise("brown", { type: "lowpass", freq: 300, gain: 0.25 });
      k.every(0.04, 0.16, (t) => k.burst({ type: "bandpass", freq: rnd(2000, 6000), q: 4, dur: 0.02, gain: rnd(0.05, 0.11), at: t }));
    },
    // A light breeze and birds now and then.
    summer(k) {
      const air = k.noise("white", { type: "lowpass", freq: 900, gain: 0.08 });
      k.every(3, 6, (t) => air.gain.gain.setTargetAtTime(rnd(0.04, 0.12), t, 1.5));
      k.every(0.8, 3, (t) => {
        const n = 2 + Math.floor(Math.random() * 4), base = rnd(2200, 3800);
        for (let i = 0, at = t; i < n; i++, at += rnd(0.08, 0.16)) k.chirp({ from: base * rnd(0.9, 1.1), to: base * rnd(1.15, 1.35), dur: rnd(0.05, 0.1), gain: 0.025, at });
      });
    },
    // Wind gusting through dry leaves.
    autumn(k) {
      const wind = k.noise("white", { type: "lowpass", freq: 700, gain: 0.3 });
      k.every(2, 5, (t) => wind.gain.gain.setTargetAtTime(rnd(0.12, 0.5), t, 1.2));
      k.every(0.3, 2.5, (t) => k.burst({ type: "highpass", freq: 2500, dur: rnd(0.15, 0.45), attack: 0.05, gain: 0.07, at: t }));
    },
    // Soft winter wind; very quiet.
    snow(k) {
      const wind = k.noise("brown", { type: "bandpass", freq: 450, q: 0.7, gain: 0.4 });
      k.every(3, 7, (t) => wind.gain.gain.setTargetAtTime(rnd(0.22, 0.56), t, 1.5));
      k.noise("white", { type: "highpass", freq: 7000, gain: 0.006 });
    },
  };

  // Switch to a mood (cross-fading), or fade out and go quiet.
  function apply(s) {
    const want = s && s.on && MOODS[s.mood] ? s.mood : null;
    if (want) {
      clearTimeout(stopTimer);
      start();
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, s.volume)) * 0.7, ctx.currentTime, 0.4);
      if (!current || current.id !== want) {
        const old = current;
        const out = ctx.createGain();
        out.gain.value = 0.0001;
        out.connect(master);
        const kit = makeKit(out);
        kit.out = out;
        const recs = RECORDINGS[want];
        if (recs) {
          Promise.all(recs.map(([name, level]) => kit.loopFile(name, level))).then((ok) => {
            if (!kit.stopped && !ok.some(Boolean)) MOODS[want](kit);   // (no recording loaded: the made sound)
          });
        } else {
          MOODS[want](kit);
        }
        // forget recordings no other mood needs any more
        const keepNames = new Set((recs || []).map((r) => r[0]).concat(old ? (RECORDINGS[old.id] || []).map((r) => r[0]) : []));
        for (const n of [...buffers.keys()]) if (!keepNames.has(n)) buffers.delete(n);
        out.gain.setTargetAtTime(1, ctx.currentTime + 0.3, 0.3);   // (after the old one is gone)
        current = { id: want, out, kit };
        if (old) {
          old.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
          setTimeout(() => { old.kit.stop(); old.out.disconnect(); }, 700);
        }
      }
    } else if (ctx && current) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        if (current) { current.kit.stop(); current.out.disconnect(); current = null; }
        ctx.suspend().catch(() => {});   // nothing running while it's quiet
      }, 900);
    }
  }
  desktop.onAmbience(apply);
  // (for checks: which mood plays and which recordings are loaded)
  window.__absdaAmbienceInfo = () => ({ mood: current && current.id, loaded: [...buffers.keys()], state: ctx && ctx.state });
})();
