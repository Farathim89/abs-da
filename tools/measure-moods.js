// SPDX-License-Identifier: GPL-3.0-or-later
// Measures how loud each mood sound is as a whole (every layer at its level and speed),
// in LUFS, so the levels in ambience.js RECORDINGS can be set to the same loudness.
// Usage: node tools/measure-moods.js   (needs ffmpeg)
const { spawnSync } = require("child_process");
const fs = require("fs");
const FF = process.env.FFMPEG || "ffmpeg";   // (set FFMPEG to ffmpeg.exe if it is not on PATH)
const path = require("path");
const SND = path.join(__dirname, "..", "sounds") + "/";
const src = fs.readFileSync(path.join(__dirname, "..", "ambience.js"), "utf8");
const block = src.slice(src.indexOf("const RECORDINGS = {"), src.indexOf("};", src.indexOf("const RECORDINGS = {")) + 2);
const RECORDINGS = eval("(" + block.replace("const RECORDINGS = ", "").replace(/;$/, "") + ")");
const out = {};
for (const [mood, layers] of Object.entries(RECORDINGS)) {
  const args = ["-hide_banner", "-nostats"];
  const filters = [];
  layers.forEach(([name, level, rate = 1], i) => {
    args.push("-stream_loop", "-1", "-i", SND + name + ".ogg");
    filters.push(`[${i}:a]${rate !== 1 ? `asetrate=48000*${rate},aresample=48000,` : ""}volume=${level},atrim=0:60[a${i}]`);
  });
  const mix = layers.length > 1 ? `${layers.map((_, i) => `[a${i}]`).join("")}amix=inputs=${layers.length}:normalize=0,ebur128` : `[a0]ebur128`;
  args.push("-filter_complex", filters.join(";") + ";" + mix, "-f", "null", "-");
  const r = spawnSync(FF, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const txt = String(r.stderr || "");
  const m = [...txt.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  out[mood] = m ? Number(m[1]) : null;
}
console.log(JSON.stringify(out));
