// SPDX-License-Identifier: GPL-3.0-or-later
// Connect / change-server / can't-reach-server screen.
// Modes (from the URL): setup (first run), change, error.

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "setup";
const api = window.absDesktop;
let hasServer = false;   // a server is already saved → offer Cancel
let S = {};              // texts in the app's language (see i18n.js)
const T = (key, fallback) => S[key] || fallback;
let current = null;      // what's on screen, so a language change can redraw it

function setStatus(text, isError) {
  $("status").textContent = text || "";
  $("status").classList.toggle("err", !!isError);
}
function setBusy(busy) {
  $("connect").disabled = busy;
  $("server").disabled = busy;
}

// Fixed texts: field label, placeholder, buttons.
function applyStrings() {
  document.querySelector('label[for="server"]').textContent = T("connect.label", "Server address");
  $("server").placeholder = T("connect.placeholder", "http://your-server:13378");
  $("connect").textContent = T("connect.connect", "Connect");
  $("cancel").textContent = T("connect.cancel", "Cancel");
  $("retry").textContent = T("connect.retry", "Retry");
  $("change").textContent = T("connect.change", "Change server");
  if (current) current();
}

function showForm(titleKey, titleFallback) {
  current = () => {
    $("title").textContent = T(titleKey, titleFallback);
    $("subtitle").textContent = T("connect.subtitle", "Enter the address of your Audiobookshelf server.");
  };
  current();
  $("error-box").classList.add("hidden");
  $("error-actions").classList.add("hidden");
  $("form").classList.remove("hidden");
  $("cancel").classList.toggle("hidden", !hasServer);
  $("server").focus();
  $("server").select();
}

async function init() {
  if (api && api.getStrings) {
    S = (await api.getStrings()) || {};
    api.onStrings((s) => { S = s || {}; applyStrings(); });
  }
  applyStrings();
  const cfg = api ? await api.getConfig() : null;
  if (cfg && cfg.server) $("server").value = cfg.server;
  hasServer = !!(cfg && cfg.hasServer);

  if (mode === "error") {
    current = () => { $("title").textContent = T("connect.titleError", "Can't reach your server"); };
    current();
    $("subtitle").textContent = (cfg && cfg.server) || "";
    const msg = params.get("msg");
    if (msg) {
      $("error-box").textContent = msg;
      $("error-box").classList.remove("hidden");
    }
    $("form").classList.add("hidden");
    $("error-actions").classList.remove("hidden");
    $("retry").focus();
  } else if (mode === "change" || (cfg && cfg.hasServer)) {
    showForm("connect.titleChange", "Change server");
  } else {
    showForm("connect.titleSetup", "Connect to your server");
  }
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = $("server").value.trim();
  if (!value) { setStatus(T("connect.empty", "Please enter your server address."), true); return; }
  setBusy(true);
  setStatus(T("connect.connecting", "Connecting…"));
  const res = await api.connect(value);
  if (!res || !res.ok) {
    setBusy(false);
    setStatus((res && res.error) || T("connect.failed", "Couldn't connect."), true);
  }
  // On success the window switches to your server by itself.
});

$("retry").addEventListener("click", () => {
  setStatus(T("connect.retrying", "Retrying…"));
  api.retry();
});

// Cancel → go back to the saved server without changing anything.
$("cancel").addEventListener("click", () => {
  setStatus(T("connect.goingBack", "Going back…"));
  api.retry();
});

$("change").addEventListener("click", () => {
  setStatus("");
  showForm("connect.titleChange", "Change server");
});

init();
