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

  // Approximate registrable domain ("docs.google.com" -> "google.com",
  // "news.bbc.co.uk" -> "bbc.co.uk"). Extensions can't read Firefox's public
  // suffix list, so two-letter country TLDs with a short second label
  // (co.uk, com.au, ne.jp) are treated as a single suffix.
  function siteOf(hostname) {
    const labels = hostname.replace(/^www\./, "").split(".");
    if (labels.length <= 2 || /^\d+$/.test(labels.at(-1))) return labels.join(".");
    const [sld, tld] = labels.slice(-2);
    const take = tld.length === 2 && sld.length <= 3 ? 3 : 2;
    return labels.slice(-take).join(".");
  }

  function isExcluded(hostname) {
    return settings.excludedSites.some((s) => hostname === s || hostname.endsWith("." + s));
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
    if (isExcluded(location.hostname)) return false;
    return siteOf(url.hostname) !== siteOf(location.hostname);
  }

  function onClick(event) {
    if (isPeek) return;
    const link = event.composedPath().find((el) => el instanceof HTMLAnchorElement && el.href);
    if (!link || !shouldPeek(link, event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    browser.runtime.sendMessage({ type: "open", url: link.href });
  }

  function addPeekControls() {
    const host = document.createElement("div");
    host.style.cssText = "all: initial; position: fixed; top: 10px; right: 10px; z-index: 2147483647;";
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
    shadow.querySelector("button").addEventListener("click", () =>
      browser.runtime.sendMessage({ type: "expand" })
    );
    (document.body ?? document.documentElement).append(host);

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName)) return;
      browser.runtime.sendMessage({ type: "close" });
    });
  }

  // Bubble phase, so pages that handle their own link clicks (SPA routers,
  // menus) get first say and we skip anything they preventDefault().
  document.addEventListener("click", onClick);

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
