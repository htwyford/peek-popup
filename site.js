"use strict";

// Shared by the background script and the content script.

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

function isExcludedHost(hostname, excludedSites) {
  return excludedSites.some((s) => hostname === s || hostname.endsWith("." + s));
}
