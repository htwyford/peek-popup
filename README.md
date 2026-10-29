# Peek Popup

Arc-style Peek for Firefox. Click a link to a different site and it opens in a floating popup window over the page you're on. Click back into the original window and the popup closes.

- **Open in tab ↗**: a small button in the corner of the popup moves the page into a normal tab. You can also assign a shortcut in `about:addons` → ⚙︎ → Manage Extension Shortcuts.
- **Esc** closes the popup, unless you're typing in a field.
- **Cmd/Ctrl-click, Shift-click and middle-click** behave as usual.

## Settings

- **Where it applies:** only from pinned tabs (Arc's default) or from every tab.
- **Close when switching apps:** off by default, so you can Cmd-Tab away and come back.
- **Size:** how much of the parent window the popup covers.
- **Excluded sites:** links clicked on these sites open normally. Useful for search engines if you peek from every tab.

"Different site" means a different registrable domain, so `docs.google.com` → `mail.google.com` stays in the tab. Extensions can't read Firefox's public suffix list, so the extension uses an approximation that handles common two-part suffixes like `co.uk`.

## Development

```bash
npx web-ext run
npx web-ext lint
```

MIT licensed.
