// Simple polyfill: use browser.* if available, else chrome.*
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  window.browser = chrome;
}
