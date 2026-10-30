"use strict";

// Runs in every page. In a normal tab it intercepts plain clicks on links to
// another site and asks the background to open them in a peek. Inside a peek
// it adds the "Open in tab" button and Escape-to-close.

(() => {
  if (window.top !== window) return;

  const DEFAULTS = { mode: "pinned", excludedSites: [] };
  let settings = { ...DEFAULTS };
  let pinned = false;
  let isPeek = false;
  let controls = null; // the "Open in tab" button's host element, in a peek

  function linkFrom(event) {
    return event.composedPath().find((el) => el instanceof HTMLAnchorElement && el.href);
  }

  function shouldPeek(link, event) {
    if (event.defaultPrevented || event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    if (link.hasAttribute("download")) return false;
    if (settings.mode === "pinned" && !pinned) return false;
    let url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (isExcludedHost(location.hostname, settings.excludedSites)) return false;
    return siteOf(url.hostname) !== siteOf(location.hostname);
  }

  function onClick(event) {
    if (isPeek) return;
    const link = linkFrom(event);
    if (!link || !shouldPeek(link, event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    browser.runtime.sendMessage({ type: "open", url: link.href });
  }

  // The background script peeks new tabs this page opens. When the user is
  // deliberately opening a link in a new tab (Cmd/Ctrl-click, middle-click,
  // the context menu), tell it to stand down.
  function onDeliberateNewTab(event) {
    if (isPeek || !linkFrom(event)) return;
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1;
    if (event.type === "contextmenu" || modified) {
      browser.runtime.sendMessage({ type: "bypass", kind: event.type === "contextmenu" ? "menu" : "click" });
    }
  }

  function addPeekControls() {
    const host = document.createElement("div");
    host.style.cssText = "all: initial; position: fixed; top: 10px; right: 10px; z-index: 2147483647;";
    // A manual popover renders in the browser's top layer, above anything the
    // page can stack with z-index, including invisible overlays (bot checks,
    // consent layers) that would otherwise swallow the click.
    host.setAttribute("popover", "manual");
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
      <style>
        button {
          font: 500 12px/1 system-ui, sans-serif;
          padding: 7px 10px;
          border-radius: 8px;
          border: 1px solid rgba(0,0,0,.15);
          background: rgba(255,255,255,.92);
          color: #222;
          box-shadow: 0 2px 8px rgba(0,0,0,.15);
          cursor: pointer;
          opacity: .55;
          transition: opacity .15s;
        }
        button:hover { opacity: 1; }
        @media (prefers-color-scheme: dark) {
          button { background: rgba(40,40,44,.92); color: #eee; border-color: rgba(255,255,255,.15); }
        }
      </style>
      <button title="Open in a full tab">Open in tab ↗</button>`;
    (document.body ?? document.documentElement).append(host);
    try {
      host.showPopover();
    } catch {}
    controls = host;
  }

  // Registered at document_start, before any page script, so a page that
  // stops clicks in its own capture listeners can't block the button.
  function onControlsClick(event) {
    if (!controls || !event.composedPath().includes(controls)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    browser.runtime.sendMessage({ type: "expand" });
  }

  function onEscape(event) {
    if (!isPeek || event.key !== "Escape" || event.defaultPrevented) return;
    const el = document.activeElement;
    if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName)) return;
    browser.runtime.sendMessage({ type: "close" });
  }

  window.addEventListener("click", onControlsClick, true);
  // Bubble phase: a page using Esc to close its own dialog gets first say.
  document.addEventListener("keydown", onEscape);
  // Bubble phase, so pages that handle their own link clicks (SPA routers,
  // menus) get first say and we skip anything they preventDefault().
  document.addEventListener("click", onClick);
  // Capture phase: the page can't swallow these before we see them.
  for (const type of ["click", "auxclick", "contextmenu"]) {
    document.addEventListener(type, onDeliberateNewTab, true);
  }

  browser.storage.local.get("settings").then(({ settings: s = {} }) => {
    settings = { ...DEFAULTS, ...s };
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      settings = { ...DEFAULTS, ...changes.settings.newValue };
    }
  });
  function becomePeek() {
    if (isPeek) return;
    isPeek = true;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", addPeekControls, { once: true });
    } else {
      addPeekControls();
    }
  }

  browser.runtime.onMessage.addListener((msg) => {
    if (msg?.type === "pinned") pinned = msg.pinned;
    if (msg?.type === "peek") becomePeek();
  });

  browser.runtime.sendMessage({ type: "state" }).then((state) => {
    pinned = state.pinned;
    if (state.isPeek) becomePeek();
  });
})();
