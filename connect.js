// SPDX-License-Identifier: GPL-3.0-or-later
// Connect / change-server / can't-reach-server screen.
// Modes (from the URL): setup (first run), change, error.

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const mode = params.get("mode") || "setup";
const api = window.absDesktop;
let hasServer = false;   // a server is already saved → offer Cancel

function setStatus(text, isError) {
  $("status").textContent = text || "";
  $("status").classList.toggle("err", !!isError);
}
function setBusy(busy) {
  $("connect").disabled = busy;
  $("server").disabled = busy;
}
function showForm(title) {
  $("title").textContent = title;
  $("subtitle").textContent = "Enter the address of your Audiobookshelf server.";
  $("error-box").classList.add("hidden");
  $("error-actions").classList.add("hidden");
  $("form").classList.remove("hidden");
  $("cancel").classList.toggle("hidden", !hasServer);
  $("server").focus();
  $("server").select();
}

async function init() {
  const cfg = api ? await api.getConfig() : null;
  if (cfg && cfg.server) $("server").value = cfg.server;
  hasServer = !!(cfg && cfg.hasServer);

  if (mode === "error") {
    $("title").textContent = "Can't reach your server";
    $("subtitle").textContent = (cfg && cfg.server) || "";
    const msg = params.get("msg");
    if (msg) {
      $("error-box").textContent = msg;
      $("error-box").classList.remove("hidden");
    }
    $("form").classList.add("hidden");
    $("error-actions").classList.remove("hidden");
    $("retry").focus();
  } else {
    showForm(mode === "change" || (cfg && cfg.hasServer) ? "Change server" : "Connect to your server");
  }
}

$("form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = $("server").value.trim();
  if (!value) { setStatus("Please enter your server address.", true); return; }
  setBusy(true);
  setStatus("Connecting…");
  const res = await api.connect(value);
  if (!res || !res.ok) {
    setBusy(false);
    setStatus((res && res.error) || "Couldn't connect.", true);
  }
  // On success the window switches to your server by itself.
});

$("retry").addEventListener("click", () => {
  setStatus("Retrying…");
  api.retry();
});

// Cancel → go back to the saved server without changing anything.
$("cancel").addEventListener("click", () => {
  setStatus("Going back…");
  api.retry();
});

$("change").addEventListener("click", () => {
  setStatus("");
  showForm("Change server");
});

init();
