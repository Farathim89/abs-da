// SPDX-License-Identifier: GPL-3.0-or-later
// ---------------------------------------------------------------------------
// Server address helpers. No Electron dependencies, so they can be tested
// with plain Node:  node -e "require('./server').probeServer('http://host:13378').then(console.log)"
// ---------------------------------------------------------------------------

// Turn whatever the user typed into a clean base address.
//   "myserver:13378"                     -> "http://myserver:13378"
//   "http://myserver:13378/audiobookshelf/" -> "http://myserver:13378"
function normalizeServer(input) {
  let s = String(input || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  try {
    const u = new URL(s);
    const p = u.pathname.replace(/\/+$/, "").replace(/\/audiobookshelf$/i, "");
    return u.origin + p;   // keeps a custom reverse-proxy sub-path if there is one
  } catch {
    return null;
  }
}

// Fetch with a time limit that also covers reading the answer. Returns { ok, url, body } —
// url is where it ended up after redirects (e.g. http:// → https://).
async function fetchTimeout(url, fetchImpl = fetch, ms = 8000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, redirect: "follow" });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, url: res.url || url, body };
  } finally {
    clearTimeout(timer);
  }
}

// Check the address really is an Audiobookshelf server and find where its
// web app lives. Returns { ok: true, webUrl } or { ok: false, code, error } (code: "unreachable" | "notAbs").
// fetchImpl: the app passes Electron's net.fetch (Chromium's network: Windows certificates, proxy).
async function probeServer(base, fetchImpl) {
  let reachable = false;
  let isAbs = false;
  for (const p of ["/status", "/audiobookshelf/status"]) {
    try {
      const res = await fetchTimeout(base + p, fetchImpl);
      reachable = true;
      if (res.ok) {
        let json = null;
        try { json = JSON.parse(res.body); } catch {}
        if (json && json.app === "audiobookshelf") { isAbs = true; break; }
      }
    } catch {}
  }
  if (!reachable) {
    return { ok: false, code: "unreachable", error: "Couldn't reach that address. Check the server is running and the address and port are right." };
  }
  if (!isAbs) {
    // A different app on the same host is an easy mix-up (wrong port).
    return { ok: false, code: "notAbs", error: "That address answered, but it isn't an Audiobookshelf server. Wrong port? Audiobookshelf's default is 13378." };
  }

  // Newer servers serve the web app under /audiobookshelf/, older ones at the root.
  for (const p of ["/audiobookshelf/", "/"]) {
    try {
      const res = await fetchTimeout(base + p, fetchImpl);
      // (where the server sent us — after an http → https redirect that's the https address)
      if (res.ok && /<title>\s*Audiobookshelf/i.test(res.body)) return { ok: true, webUrl: res.url || base + p };
    } catch {}
  }
  return { ok: true, webUrl: base + "/audiobookshelf/" };
}

module.exports = { normalizeServer, probeServer };
