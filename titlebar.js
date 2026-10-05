// SPDX-License-Identifier: GPL-3.0-or-later
// Custom title bar: page title, focus dimming, and the App/Edit/View/Navigate/Help menus.

const desktop = window.absDesktop;
const titleEl = document.getElementById("title");

const setTitle = (t) => { titleEl.textContent = t || "ABS Desktop App"; };
desktop.getTitle().then(setTitle);
desktop.onTitle(setTitle);
desktop.onFocus((focused) => document.body.classList.toggle("blurred", !focused));

// Menu button names in the app's language (the order matches main.js buildMenu).
const MENU_KEYS = ["menu.app", "menu.edit", "menu.view", "menu.navigate", "menu.help"];
function setLabels(s) {
  if (!s) return;
  document.querySelectorAll(".menus button").forEach((btn) => {
    const key = MENU_KEYS[Number(btn.dataset.menu)];
    if (s[key]) btn.textContent = s[key];
  });
}
desktop.getStrings().then(setLabels);
desktop.onStrings(setLabels);

// Each button opens its menu just below itself.
document.querySelectorAll(".menus button").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const r = btn.getBoundingClientRect();
    btn.classList.add("open");
    try {
      await desktop.showMenu(Number(btn.dataset.menu), r.left, r.bottom);
    } finally {
      btn.classList.remove("open");
    }
  });
});
