"use strict";

// Peek Popup
//
// storage.local:   settings { mode: "pinned" | "all", closeOnAppBlur: bool,
//                             excludedSites: string[], size: number }
// storage.session: peeks    { [peekWindowId]: { parentWindowId, openedAt } }

const DEFAULTS = { mode: "pinned", closeOnAppBlur: false, excludedSites: [], size: 0.8 };
// Focus events that arrive right after opening belong to the click that
// opened the peek, not to the user leaving it.
const FOCUS_GRACE_MS = 600;

async function getSettings() {
  const { settings = {} } = await browser.storage.local.get("settings");
  return { ...DEFAULTS, ...settings };
}

async function getPeeks() {
  const { peeks = {} } = await browser.storage.session.get("peeks");
  return peeks;
}

async function setPeeks(peeks) {
  await browser.storage.session.set({ peeks });
}

async function closePeek(windowId) {
  const peeks = await getPeeks();
  delete peeks[windowId];
  await setPeeks(peeks);
  try {
    await browser.windows.remove(Number(windowId));
  } catch {}
}

async function openPeek(url, parentWindowId) {
  const { size } = await getSettings();

  // One peek at a time, like Arc.
  for (const id of Object.keys(await getPeeks())) await closePeek(id);

  const parent = await browser.windows.get(parentWindowId);
  const width = Math.round(parent.width * size);
  const height = Math.round(parent.height * size);
  const win = await browser.windows.create({
    url,
    type: "popup",
    width,
    height,
    left: parent.left + Math.round((parent.width - width) / 2),
    top: parent.top + Math.round((parent.height - height) / 2),
  });

  const peeks = await getPeeks();
  peeks[win.id] = { parentWindowId, openedAt: Date.now() };
  await setPeeks(peeks);

  // The page may have asked for its state before the peek was recorded above.
  // If its content script is already running, tell it now; if not, its own
  // "state" request will find the record.
  for (const tab of win.tabs ?? []) {
    browser.tabs.sendMessage(tab.id, { type: "peek" }).catch(() => {});
  }
}

// Move the peek's page into a normal tab in the window it came from. Firefox
// won't move tabs out of popup windows, so reopen the URL and close the popup.
async function expandPeek(windowId) {
  const peeks = await getPeeks();
  const peek = peeks[windowId];
  if (!peek) return;
  const [tab] = await browser.tabs.query({ windowId: Number(windowId) });
  let parentId = peek.parentWindowId;
  try {
    await browser.windows.get(parentId);
  } catch {
    parentId = undefined;
  }
  await browser.tabs.create({ url: tab.url, windowId: parentId, active: true });
  if (parentId != null) await browser.windows.update(parentId, { focused: true });
  await closePeek(windowId);
}

browser.windows.onFocusChanged.addListener(async (focusedId) => {
  const peeks = await getPeeks();
  const { closeOnAppBlur } = await getSettings();
  const leftFirefox = focusedId === browser.windows.WINDOW_ID_NONE;
  if (leftFirefox && !closeOnAppBlur) return;
  for (const [id, peek] of Object.entries(peeks)) {
    if (Number(id) === focusedId) continue;
    if (Date.now() - peek.openedAt < FOCUS_GRACE_MS) continue;
    await closePeek(id);
  }
});

browser.windows.onRemoved.addListener(async (windowId) => {
  const peeks = await getPeeks();
  if (windowId in peeks) {
    delete peeks[windowId];
    await setPeeks(peeks);
  }
});

// Let content scripts in pinned tabs know when their pinned state changes.
browser.tabs.onUpdated.addListener(
  (tabId, change) => {
    browser.tabs.sendMessage(tabId, { type: "pinned", pinned: change.pinned }).catch(() => {});
  },
  { properties: ["pinned"] }
);

browser.runtime.onMessage.addListener((msg, sender) => {
  const tab = sender.tab;
  if (!tab) return;
  switch (msg?.type) {
    case "state":
      return getPeeks().then((peeks) => ({
        pinned: tab.pinned,
        isPeek: tab.windowId in peeks,
      }));
    case "open":
      return openPeek(msg.url, tab.windowId);
    case "expand":
      return expandPeek(tab.windowId);
    case "close":
      return closePeek(tab.windowId);
  }
});

browser.commands.onCommand.addListener(async (command, tab) => {
  if (command === "expand-peek" && tab) await expandPeek(tab.windowId);
});
