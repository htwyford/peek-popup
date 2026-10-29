"use strict";

const DEFAULTS = { mode: "pinned", closeOnAppBlur: false, excludedSites: [], size: 0.8 };
const $ = (id) => document.getElementById(id);

async function load() {
  const { settings = {} } = await browser.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

async function save(patch) {
  const settings = { ...(await load()), ...patch };
  await browser.storage.local.set({ settings });
}

load().then((s) => {
  for (const radio of document.querySelectorAll("input[name=mode]")) {
    radio.checked = radio.value === s.mode;
  }
  $("closeOnAppBlur").checked = s.closeOnAppBlur;
  $("size").value = s.size;
  $("sizeLabel").textContent = `${Math.round(s.size * 100)}%`;
  $("excludedSites").value = s.excludedSites.join("\n");
});

document.addEventListener("change", (e) => {
  if (e.target.name === "mode") save({ mode: e.target.value });
  if (e.target.id === "closeOnAppBlur") save({ closeOnAppBlur: e.target.checked });
  if (e.target.id === "size") save({ size: Number(e.target.value) });
  if (e.target.id === "excludedSites") {
    const excludedSites = e.target.value
      .split("\n")
      .map((s) => s.trim().toLowerCase().replace(/^www\./, ""))
      .filter(Boolean);
    save({ excludedSites });
  }
});

$("size").addEventListener("input", (e) => {
  $("sizeLabel").textContent = `${Math.round(e.target.value * 100)}%`;
});
