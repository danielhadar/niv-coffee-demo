/* ============================================================================
 * Negishut — Israeli accessibility widget (IS 5568 / WCAG 2.0 AA)
 * Copyright (c) 2026 Daniel Hadar. All rights reserved.
 *
 * Usage in host page:
 *
 *   <script>
 *     window.NegishutConfig = {
 *       position:    'bottom-right',     // or bottom-left / top-right / top-left
 *       statementUrl:'accessibility.html',
 *       coordinator: { name: '', email: '', phone: '' }
 *     };
 *   </script>
 *   <link rel="stylesheet" href="vendor/negishut/negishut.css">
 *   <script src="vendor/negishut/negishut.js" defer></script>
 *
 * No external dependencies. No tracking. localStorage only.
 * ============================================================================ */

(function () {
  "use strict";

  if (window.__negishut_loaded) {
    console.warn("[negishut] widget loaded more than once — skipping duplicate");
    return;
  }
  window.__negishut_loaded = true;

  /* --------------------------------------------------------------------- */
  /*  Config                                                                */
  /* --------------------------------------------------------------------- */

  var DEFAULT_CONFIG = {
    position:         "bottom-right",
    coordinator:      { name: "", email: "", phone: "" },
    businessName:     "",                     // shown in statement intro
    knownLimitations: "",                     // free-text; empty = no known issues
    language:         "he",
    storageKey:       "negishut_prefs_v1"
  };

  var userConfig = window.NegishutConfig || {};
  var CONFIG = mergeConfig(DEFAULT_CONFIG, userConfig);

  function mergeConfig(a, b) {
    var out = {};
    for (var k in a) out[k] = a[k];
    for (var k in b) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) {
        out[k] = mergeConfig(a[k] || {}, b[k]);
      } else if (b[k] !== undefined) {
        out[k] = b[k];
      }
    }
    return out;
  }


  /* --------------------------------------------------------------------- */
  /*  Hebrew strings                                                        */
  /* --------------------------------------------------------------------- */

  var STR = {
    he: {
      openButton:    "פתיחת סרגל נגישות",
      panelTitle:    "סרגל נגישות",
      close:         "סגירת סרגל הנגישות",
      sections: {
        text:        "טקסט וגופן",
        color:       "צבעים וניגודיות",
        highlight:   "הדגשות ותיאורים",
        nav:         "ניווט וסמן"
      },
      fontInc:       "הגדלת גופן",
      fontDec:       "הקטנת גופן",
      fontLevel:     "גודל גופן",
      readableFont:  "גופן קריא",
      monochrome:    "מונוכרום",
      sepia:         "ספיה",
      highContrast:  "ניגודיות גבוהה",
      blackYellow:   "שחור צהוב",
      invert:        "היפוך צבעים",
      highlightHeadings: "הדגשת כותרות",
      highlightLinks:    "הדגשת קישורים",
      altHover:      "הצגת תיאור",
      altPersistent: "תיאורים קבועים",
      kbd:           "ניווט מקלדת",
      cursorWhite:   "סמן גדול ולבן",
      cursorBlack:   "סמן גדול ושחור",
      noAnim:        "ביטול הבהובים",
      reset:         "איפוס הגדרות",
      statement:     "הצהרת נגישות",
      feedback:      "דיווח על בעיית נגישות",
      noAlt:         "תמונה ללא תיאור",
      mailtoSubject: "דיווח על בעיית נגישות",
      mailtoBody:    "שלום,\n\nברצוני לדווח על בעיית נגישות באתר.\n\nכתובת העמוד: " +
                     (typeof location !== "undefined" ? location.href : "") +
                     "\nתיאור הבעיה:\n\n",
      // Statement modal
      stmtUpdated:    "עודכן לאחרונה",
      stmtIntro1:     "שואף להיות נגיש לכלל המשתמשים, לרבות אנשים עם מוגבלויות. אנו פועלים על מנת להתאים את האתר לדרישות חוק שוויון זכויות לאנשים עם מוגבלות, התשנ\"ח-1998, ולתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע\"ג-2013.",
      stmtStandardH:  "תקן הנגישות",
      stmtStandardP:  "האתר נבנה בהתאם לתקן הישראלי <strong>ת\"י 5568</strong>, המבוסס על הנחיות הנגישות הבינלאומיות <strong>WCAG 2.0 ברמה AA</strong> של ארגון W3C.",
      stmtFeaturesH:  "אמצעי הנגישות באתר",
      stmtFeaturesP:  "באתר מותקן רכיב נגישות (Negishut) המאפשר בין היתר:",
      stmtFeatures:   [
        "הגדלה והקטנה של גודל הטקסט",
        "גופן קריא לאנשים עם דיסלקציה",
        "חמישה מצבי צבעים: מונוכרום, ספיה, ניגודיות גבוהה, שחור-צהוב, היפוך צבעים",
        "הדגשת כותרות וקישורים",
        "הצגת תיאורי תמונות חלופיים",
        "סמן עכבר מוגדל (לבן או שחור)",
        "ניווט מלא במקלדת",
        "ביטול אנימציות והבהובים",
        "איפוס מהיר של כל ההגדרות"
      ],
      stmtFeaturesAfter: "הרכיב נפתח על ידי לחיצה על סמל הנגישות הקבוע בפינת המסך.",
      stmtLimitsH:    "חריגות והגבלות ידועות",
      stmtNoLimits:   "אין חריגות ידועות במועד עדכון זה.",
      stmtLanguage:   "האתר נגיש בשפה העברית בלבד.",
      stmtContactH:   "פנייה לרכז הנגישות",
      stmtContactP:   "אם נתקלת בבעיית נגישות באתר או שיש לך הצעה לשיפור, נשמח שתפנה/י אלינו. אנו מתחייבים לטפל בפנייתך בהקדם האפשרי, לכל המאוחר תוך 5 ימי עסקים.",
      stmtCoordName:  "שם רכז הנגישות:",
      stmtCoordEmail: "דוא\"ל:",
      stmtCoordPhone: "טלפון:",
      stmtSiteIntro:  "אתר"
    }
  };
  var T = STR[CONFIG.language] || STR.he;


  /* --------------------------------------------------------------------- */
  /*  Icons (inline SVG, stroke-based)                                      */
  /* --------------------------------------------------------------------- */

  var ICONS = {
    // Wheelchair icon — Phosphor Icons "wheelchair" (regular, MIT license).
    // Source: github.com/phosphor-icons/core (raw/regular/wheelchair.svg)
    wheelchair:
      '<svg viewBox="0 0 256 256" fill="none" stroke="currentColor" ' +
      'stroke-width="16" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="104" cy="48" r="24"/>' +
      '<polyline points="104 72 104 136 192 136 224 200 248 192"/>' +
      '<path d="M168,96H112a64,64,0,0,0,0,128c29.82,0,56.9-20.4,64-48"/>' +
      '</svg>',

    // Text-glyph icons use HTML span instead of SVG <text> — SVG text
    // inherits the RTL direction from the panel and renders "Aa" / "A+"
    // wrong. HTML span with direction:ltr avoids the issue entirely.
    fontInc:
      '<span class="negishut-glyph">A<small>+</small></span>',
    fontDec:
      '<span class="negishut-glyph">A<small>−</small></span>',
    readableFont:
      '<span class="negishut-glyph">Aa</span>',

    // Color modes — outer circle stroked + half filled with FIXED color
    // (so the icon stays legible even when the button itself goes blue/white)
    monochrome:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M12 3 A9 9 0 0 1 12 21 Z" fill="#1a1a1a" stroke="none"/>' +
      '</svg>',

    sepia:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M12 3 A9 9 0 0 1 12 21 Z" fill="#b88860" stroke="none"/>' +
      '<path d="M12 3 A9 9 0 0 0 12 21 Z" fill="#f0dcb8" stroke="none"/>' +
      '</svg>',

    highContrast:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9" fill="#fff"/>' +
      '<path d="M12 3 A9 9 0 0 1 12 21 Z" fill="#1a1a1a" stroke="none"/>' +
      '</svg>',

    blackYellow:
      '<span class="negishut-glyph negishut-glyph-black-yellow">Aa</span>',

    invert:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9" fill="#fff"/>' +
      '<path d="M12 3 A9 9 0 0 0 12 21 Z" fill="#1a1a1a" stroke="none"/>' +
      '</svg>',

    // Two H's of different sizes — clearly conveys "headings"
    highlightHeadings:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M4 5 L4 13 M4 9 L10 9 M10 5 L10 13"/>' +
      '<path d="M14 11 L14 18 M14 14.5 L19 14.5 M19 11 L19 18"/>' +
      '</svg>',

    // Two interlocking chain links — clearer
    highlightLinks:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
      '<path d="M10 14 L8 16 A3 3 0 0 1 4 12 L6 10 A3 3 0 0 1 9 9.5"/>' +
      '<path d="M14 10 L16 8 A3 3 0 0 1 20 12 L18 14 A3 3 0 0 1 15 14.5"/>' +
      '<path d="M9.5 14.5 L14.5 9.5"/>' +
      '</svg>',

    // Image with tooltip popup (hover mode)
    altHover:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="2.5" y="5" width="12" height="9" rx="1"/>' +
      '<path d="M2.5 11 L6 8 L9 11 L11 9.5 L14.5 12"/>' +
      '<circle cx="11" cy="8" r="1" fill="currentColor" stroke="none"/>' +
      '<path d="M14 17 L21 17 M14 19.5 L19 19.5"/>' +
      '<path d="M11.5 14 L13.5 16 L11.5 18"/>' +
      '</svg>',

    // Image with caption underneath (persistent)
    altPersistent:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="4" y="3" width="16" height="9" rx="1"/>' +
      '<path d="M4 9 L8 6 L13 10 L17 8 L20 10.5"/>' +
      '<circle cx="17" cy="6.5" r="1" fill="currentColor" stroke="none"/>' +
      '<path d="M4 16 L20 16 M4 19 L16 19"/>' +
      '</svg>',

    kbd:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="2" y="6" width="20" height="12" rx="2"/>' +
      '<circle cx="6"  cy="10" r="0.7" fill="currentColor" stroke="none"/>' +
      '<circle cx="10" cy="10" r="0.7" fill="currentColor" stroke="none"/>' +
      '<circle cx="14" cy="10" r="0.7" fill="currentColor" stroke="none"/>' +
      '<circle cx="18" cy="10" r="0.7" fill="currentColor" stroke="none"/>' +
      '<path d="M6 14 L18 14" stroke-linecap="round"/>' +
      '</svg>',

    cursorWhite:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M5 3 L5 20 L9 16 L11.5 21 L14.5 19.5 L12 14.5 L18 14.5 Z" ' +
      'fill="#fff" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '</svg>',

    cursorBlack:
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M5 3 L5 20 L9 16 L11.5 21 L14.5 19.5 L12 14.5 L18 14.5 Z" ' +
      'fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
      '</svg>',

    noAnim:
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
      '<rect x="6"  y="5" width="3" height="14" rx="0.5"/>' +
      '<rect x="15" y="5" width="3" height="14" rx="0.5"/>' +
      '</svg>',

    reset:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 12 A8 8 0 1 1 12 20"/>' +
      '<path d="M4 6 L4 12 L10 12"/>' +
      '</svg>',

    statement:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M6 3 L13 3 L18 8 L18 21 L6 21 Z"/>' +
      '<path d="M13 3 L13 8 L18 8"/>' +
      '<path d="M9 12 L15 12 M9 15 L15 15 M9 18 L13 18"/>' +
      '</svg>',

    feedback:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="5" width="18" height="13" rx="1.5"/>' +
      '<path d="M3 7 L12 13 L21 7"/>' +
      '</svg>'
  };


  /* --------------------------------------------------------------------- */
  /*  State                                                                 */
  /* --------------------------------------------------------------------- */

  var FONT_MAX = 3;
  var FONT_MIN = 0;

  var DEFAULT_STATE = {
    fontLevel:         0,
    colorMode:         null,
    cursor:            null,
    altMode:           null,
    kbd:               false,
    noAnim:            false,
    highlightHeadings: false,
    highlightLinks:    false,
    readableFont:      false
  };

  var state = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return Object.assign({}, DEFAULT_STATE);
      var parsed = JSON.parse(raw);
      return Object.assign({}, DEFAULT_STATE, parsed);
    } catch (e) {
      return Object.assign({}, DEFAULT_STATE);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
    } catch (e) { /* quota / private mode — ignore */ }
  }


  /* --------------------------------------------------------------------- */
  /*  Apply state to host page                                              */
  /* --------------------------------------------------------------------- */

  var COLOR_MODES = ["monochrome", "sepia", "high-contrast", "black-yellow", "invert"];
  var CURSOR_MODES = ["white", "black"];
  var ALT_MODES = ["hover", "persistent"];

  function applyState() {
    var html = document.documentElement;

    // Font level: remove all, add active
    for (var i = 0; i <= FONT_MAX; i++) html.classList.remove("negishut-font-" + i);
    if (state.fontLevel > 0) html.classList.add("negishut-font-" + state.fontLevel);

    // Color modes
    COLOR_MODES.forEach(function (m) { html.classList.remove("negishut-" + m); });
    if (state.colorMode) html.classList.add("negishut-" + state.colorMode);

    // Cursor
    CURSOR_MODES.forEach(function (m) { html.classList.remove("negishut-cursor-" + m); });
    if (state.cursor) html.classList.add("negishut-cursor-" + state.cursor);

    // Alt mode
    html.classList.remove("negishut-show-alt-hover");
    html.classList.remove("negishut-show-alt-persistent");
    if (state.altMode === "hover")      html.classList.add("negishut-show-alt-hover");
    if (state.altMode === "persistent") html.classList.add("negishut-show-alt-persistent");
    applyAltMode();

    // Simple toggles
    toggleClass(html, "negishut-kbd",                 state.kbd);
    toggleClass(html, "negishut-no-anim",             state.noAnim);
    toggleClass(html, "negishut-highlight-headings",  state.highlightHeadings);
    toggleClass(html, "negishut-highlight-links",     state.highlightLinks);
    toggleClass(html, "negishut-readable-font",       state.readableFont);

    saveState();
    refreshButtonStates();
  }

  function toggleClass(el, cls, on) {
    el.classList[on ? "add" : "remove"](cls);
  }


  /* --------------------------------------------------------------------- */
  /*  Image alt captions (persistent mode) & tooltip (hover mode)           */
  /* --------------------------------------------------------------------- */

  function applyAltMode() {
    if (state.altMode === "persistent") {
      injectAltCaptions();
    } else {
      removeAltCaptions();
    }
    if (state.altMode === "hover") {
      bindAltHover();
    } else {
      unbindAltHover();
    }
  }

  function injectAltCaptions() {
    var imgs = document.querySelectorAll("body img:not([data-negishut-skip])");
    imgs.forEach(function (img) {
      if (img.closest("#negishut-root")) return;
      // Skip if caption already present
      var next = img.nextElementSibling;
      if (next && next.classList && next.classList.contains("negishut-alt-caption")) return;
      var alt = (img.getAttribute("alt") || "").trim();
      var span = document.createElement("span");
      span.className = "negishut-alt-caption";
      span.textContent = alt || T.noAlt;
      // Insert after the image (in DOM flow)
      if (img.parentNode) img.parentNode.insertBefore(span, img.nextSibling);
    });
  }

  function removeAltCaptions() {
    var captions = document.querySelectorAll(".negishut-alt-caption");
    captions.forEach(function (c) {
      if (c.parentNode) c.parentNode.removeChild(c);
    });
  }

  var _altTooltipEl = null;
  var _altHoverBound = false;
  var _altHideTimer = null;

  function ensureTooltip() {
    if (_altTooltipEl) return _altTooltipEl;
    _altTooltipEl = document.createElement("div");
    _altTooltipEl.id = "negishut-alt-tooltip";
    _altTooltipEl.setAttribute("role", "tooltip");
    document.body.appendChild(_altTooltipEl);
    return _altTooltipEl;
  }

  function showAltFor(img, x, y) {
    if (!img || img.tagName !== "IMG") return false;
    if (img.closest && img.closest("#negishut-root")) return false;
    var alt = (img.getAttribute("alt") || "").trim();
    var tip = ensureTooltip();
    tip.textContent = alt || T.noAlt;
    positionTooltipAt(x, y);
    tip.classList.add("negishut-visible");
    return true;
  }

  function hideAlt() {
    if (_altTooltipEl) _altTooltipEl.classList.remove("negishut-visible");
    clearTimeout(_altHideTimer);
  }

  function onAltOver(e) {
    var img = e.target.closest && e.target.closest("img");
    if (!img) return;
    showAltFor(img, e.clientX, e.clientY);
  }
  function onAltMove(e) {
    if (!_altTooltipEl || !_altTooltipEl.classList.contains("negishut-visible")) return;
    positionTooltipAt(e.clientX, e.clientY);
  }
  function onAltOut(e) {
    var img = e.target.closest && e.target.closest("img");
    if (!img) return;
    hideAlt();
  }
  // Touch: tap an image to flash its alt text for ~2.5s. Tapping anything
  // else hides the tooltip. Non-preventDefault so links still navigate.
  function onAltTouch(e) {
    var t = e.touches && e.touches[0];
    if (!t) return;
    var el = document.elementFromPoint(t.clientX, t.clientY);
    var img = el && el.closest && el.closest("img");
    if (!img) { hideAlt(); return; }
    if (showAltFor(img, t.clientX, t.clientY)) {
      clearTimeout(_altHideTimer);
      _altHideTimer = setTimeout(hideAlt, 2500);
    }
  }

  function positionTooltipAt(x, y) {
    if (!_altTooltipEl) return;
    var px = x + 14;
    var py = y + 16;
    var rect = _altTooltipEl.getBoundingClientRect();
    if (px + rect.width > window.innerWidth - 8) px = window.innerWidth - rect.width - 8;
    if (py + rect.height > window.innerHeight - 8) py = y - rect.height - 14;
    if (px < 8) px = 8;
    if (py < 8) py = 8;
    _altTooltipEl.style.left = px + "px";
    _altTooltipEl.style.top  = py + "px";
  }

  function bindAltHover() {
    if (_altHoverBound) return;
    document.addEventListener("mouseover",  onAltOver,  true);
    document.addEventListener("mousemove",  onAltMove,  true);
    document.addEventListener("mouseout",   onAltOut,   true);
    document.addEventListener("touchstart", onAltTouch, { capture: true, passive: true });
    _altHoverBound = true;
  }
  function unbindAltHover() {
    if (!_altHoverBound) return;
    document.removeEventListener("mouseover",  onAltOver,  true);
    document.removeEventListener("mousemove",  onAltMove,  true);
    document.removeEventListener("mouseout",   onAltOut,   true);
    document.removeEventListener("touchstart", onAltTouch, { capture: true, passive: true });
    hideAlt();
    _altHoverBound = false;
  }


  /* --------------------------------------------------------------------- */
  /*  Toggle handlers                                                       */
  /* --------------------------------------------------------------------- */

  function setSimple(key) {
    state[key] = !state[key];
    applyState();
  }
  function setExclusive(key, value) {
    // Click on the currently-active option deactivates the group.
    state[key] = (state[key] === value) ? null : value;
    applyState();
  }
  function setFont(delta) {
    var n = state.fontLevel + delta;
    if (n < FONT_MIN) n = FONT_MIN;
    if (n > FONT_MAX) n = FONT_MAX;
    state.fontLevel = n;
    applyState();
  }
  function resetAll() {
    state = Object.assign({}, DEFAULT_STATE);
    applyState();
  }


  /* --------------------------------------------------------------------- */
  /*  DOM construction                                                      */
  /* --------------------------------------------------------------------- */

  function buildToggle(key, label, icon, isActive) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "negishut-toggle";
    btn.setAttribute("data-key", key);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    btn.innerHTML =
      '<span class="negishut-icon">' + icon + '</span>' +
      '<span class="negishut-label">' + escapeHtml(label) + '</span>';
    return btn;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Track buttons by key so we can update aria-pressed centrally
  var buttonMap = {};

  function track(key, btn) {
    if (!buttonMap[key]) buttonMap[key] = [];
    buttonMap[key].push(btn);
    return btn;
  }

  function refreshButtonStates() {
    function set(key, pressed) {
      (buttonMap[key] || []).forEach(function (b) {
        b.setAttribute("aria-pressed", pressed ? "true" : "false");
      });
    }
    set("readableFont",       state.readableFont);
    set("kbd",                state.kbd);
    set("noAnim",             state.noAnim);
    set("highlightHeadings",  state.highlightHeadings);
    set("highlightLinks",     state.highlightLinks);

    COLOR_MODES.forEach(function (m) {
      set("color:" + m, state.colorMode === m);
    });
    CURSOR_MODES.forEach(function (m) {
      set("cursor:" + m, state.cursor === m);
    });
    ALT_MODES.forEach(function (m) {
      set("alt:" + m, state.altMode === m);
    });

    // Font level UI
    if (_fontLevelEl) {
      var pct = Math.round(100 + state.fontLevel * 10 + (state.fontLevel >= 3 ? 5 : 0));
      _fontLevelEl.textContent = pct + "%";
    }
    if (_fontIncBtn) _fontIncBtn.disabled = state.fontLevel >= FONT_MAX;
    if (_fontDecBtn) _fontDecBtn.disabled = state.fontLevel <= FONT_MIN;
  }

  var _fontLevelEl, _fontIncBtn, _fontDecBtn, _rootEl, _panelEl, _fabEl, _previousFocus, _panelHideTimer;
  var _modalEl, _modalHideTimer, _modalPreviousFocus;

  function buildSection(title, contentEl) {
    var section = document.createElement("div");
    section.className = "negishut-section";
    var h = document.createElement("h3");
    h.textContent = title;
    section.appendChild(h);
    section.appendChild(contentEl);
    return section;
  }

  function buildGrid(buttons) {
    var grid = document.createElement("div");
    grid.className = "negishut-grid";
    buttons.forEach(function (b) { grid.appendChild(b); });
    return grid;
  }

  function buildFontRow() {
    var row = document.createElement("div");
    row.className = "negishut-font-row";

    _fontDecBtn = document.createElement("button");
    _fontDecBtn.type = "button";
    _fontDecBtn.className = "negishut-font-btn";
    _fontDecBtn.setAttribute("aria-label", T.fontDec);
    _fontDecBtn.textContent = "A−";
    _fontDecBtn.addEventListener("click", function () { setFont(-1); });

    _fontLevelEl = document.createElement("span");
    _fontLevelEl.className = "negishut-font-level";
    _fontLevelEl.setAttribute("aria-live", "polite");
    _fontLevelEl.textContent = "100%";

    _fontIncBtn = document.createElement("button");
    _fontIncBtn.type = "button";
    _fontIncBtn.className = "negishut-font-btn";
    _fontIncBtn.setAttribute("aria-label", T.fontInc);
    _fontIncBtn.textContent = "A+";
    _fontIncBtn.addEventListener("click", function () { setFont(+1); });

    row.appendChild(_fontDecBtn);
    row.appendChild(_fontLevelEl);
    row.appendChild(_fontIncBtn);
    return row;
  }

  function buildPanel() {
    var panel = document.createElement("aside");
    panel.id = "negishut-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-label", T.panelTitle);
    panel.setAttribute("hidden", "");

    // Header (use <div> not <header> — host pages often style semantic tags)
    var header = document.createElement("div");
    header.id = "negishut-panel-header";
    var h2 = document.createElement("h2");
    h2.textContent = T.panelTitle;
    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.id = "negishut-close";
    closeBtn.setAttribute("aria-label", T.close);
    closeBtn.innerHTML = "&times;";
    closeBtn.addEventListener("click", closePanel);
    header.appendChild(h2);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Body
    var body = document.createElement("div");
    body.id = "negishut-panel-body";

    // --- Text section: font row + readable font (both inside one section) ---
    var textContent = document.createElement("div");
    textContent.className = "negishut-stack";
    textContent.appendChild(buildFontRow());

    var readableFontBtn = track("readableFont",
      bindToggle(buildToggle("readableFont", T.readableFont, ICONS.readableFont, state.readableFont),
        function () { setSimple("readableFont"); }));
    readableFontBtn.classList.add("negishut-span-2");
    textContent.appendChild(buildGrid([readableFontBtn]));

    body.appendChild(buildSection(T.sections.text, textContent));

    // --- Color section ---
    var colorBtns = COLOR_MODES.map(function (m) {
      var lbl = ({
        "monochrome":   T.monochrome,
        "sepia":        T.sepia,
        "high-contrast": T.highContrast,
        "black-yellow": T.blackYellow,
        "invert":       T.invert
      })[m];
      var ico = ({
        "monochrome":   ICONS.monochrome,
        "sepia":        ICONS.sepia,
        "high-contrast": ICONS.highContrast,
        "black-yellow": ICONS.blackYellow,
        "invert":       ICONS.invert
      })[m];
      return track("color:" + m,
        bindToggle(buildToggle("color:" + m, lbl, ico, state.colorMode === m),
          function () { setExclusive("colorMode", m); }));
    });
    // 5 items in 2-col → last (invert) spans full width so the layout looks intentional
    colorBtns[colorBtns.length - 1].classList.add("negishut-span-2");
    body.appendChild(buildSection(T.sections.color, buildGrid(colorBtns)));

    // --- Highlight section ---
    var highlightBtns = [
      track("highlightHeadings",
        bindToggle(buildToggle("highlightHeadings", T.highlightHeadings, ICONS.highlightHeadings, state.highlightHeadings),
          function () { setSimple("highlightHeadings"); })),
      track("highlightLinks",
        bindToggle(buildToggle("highlightLinks", T.highlightLinks, ICONS.highlightLinks, state.highlightLinks),
          function () { setSimple("highlightLinks"); })),
      track("alt:hover",
        bindToggle(buildToggle("alt:hover", T.altHover, ICONS.altHover, state.altMode === "hover"),
          function () { setExclusive("altMode", "hover"); })),
      track("alt:persistent",
        bindToggle(buildToggle("alt:persistent", T.altPersistent, ICONS.altPersistent, state.altMode === "persistent"),
          function () { setExclusive("altMode", "persistent"); }))
    ];
    body.appendChild(buildSection(T.sections.highlight, buildGrid(highlightBtns)));

    // --- Nav / cursor section ---
    var navBtns = [
      track("kbd",
        bindToggle(buildToggle("kbd", T.kbd, ICONS.kbd, state.kbd),
          function () { setSimple("kbd"); })),
      track("cursor:white",
        bindToggle(buildToggle("cursor:white", T.cursorWhite, ICONS.cursorWhite, state.cursor === "white"),
          function () { setExclusive("cursor", "white"); })),
      track("cursor:black",
        bindToggle(buildToggle("cursor:black", T.cursorBlack, ICONS.cursorBlack, state.cursor === "black"),
          function () { setExclusive("cursor", "black"); })),
      track("noAnim",
        bindToggle(buildToggle("noAnim", T.noAnim, ICONS.noAnim, state.noAnim),
          function () { setSimple("noAnim"); }))
    ];
    body.appendChild(buildSection(T.sections.nav, buildGrid(navBtns)));

    panel.appendChild(body);

    // Footer (use <div> not <footer> — host page's `footer{}` rules were
    // leaking into the widget, e.g. text-align:center on the action row)
    var footer = document.createElement("div");
    footer.id = "negishut-panel-footer";

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "negishut-action";
    resetBtn.setAttribute("data-action", "reset");
    resetBtn.innerHTML =
      '<span class="negishut-icon">' + ICONS.reset + '</span>' +
      '<span>' + escapeHtml(T.reset) + '</span>';
    resetBtn.addEventListener("click", resetAll);
    footer.appendChild(resetBtn);

    var stmtBtn = document.createElement("button");
    stmtBtn.type = "button";
    stmtBtn.className = "negishut-action";
    stmtBtn.setAttribute("data-action", "statement");
    stmtBtn.innerHTML =
      '<span class="negishut-icon">' + ICONS.statement + '</span>' +
      '<span>' + escapeHtml(T.statement) + '</span>';
    stmtBtn.addEventListener("click", openStatementModal);
    footer.appendChild(stmtBtn);

    var fbLink = document.createElement("a");
    var email = (CONFIG.coordinator && CONFIG.coordinator.email) || "";
    if (email) {
      fbLink.href = "mailto:" + encodeURIComponent(email) +
                    "?subject=" + encodeURIComponent(T.mailtoSubject) +
                    "&body=" + encodeURIComponent(T.mailtoBody);
    } else {
      fbLink.href = "#";
    }
    fbLink.className = "negishut-action";
    fbLink.setAttribute("data-action", "feedback");
    fbLink.innerHTML =
      '<span class="negishut-icon">' + ICONS.feedback + '</span>' +
      '<span>' + escapeHtml(T.feedback) + '</span>';
    footer.appendChild(fbLink);

    panel.appendChild(footer);
    return panel;
  }

  function bindToggle(btn, handler) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      handler();
    });
    return btn;
  }


  /* --------------------------------------------------------------------- */
  /*  Open / close panel + focus management                                 */
  /* --------------------------------------------------------------------- */

  function openPanel() {
    // Cancel any pending hide from a still-running close animation.
    if (_panelHideTimer) {
      clearTimeout(_panelHideTimer);
      _panelHideTimer = null;
    }
    _previousFocus = document.activeElement;
    _panelEl.removeAttribute("hidden");
    // Force a layout flush so the transition fires.
    // Without this, the display:none → display:block + transform change
    // happen in the same frame and the browser skips the transition.
    /* eslint-disable-next-line no-unused-expressions */
    _panelEl.offsetWidth;
    _rootEl.classList.add("negishut-open");
    _fabEl.setAttribute("aria-expanded", "true");

    // Move focus into the panel (the close button)
    var close = document.getElementById("negishut-close");
    if (close) {
      setTimeout(function () { close.focus(); }, 50);
    }
    document.addEventListener("keydown", onKeydown, true);
  }

  function closePanel() {
    // Trigger the slide-out transform first; DON'T set hidden yet —
    // hidden becomes display:none and kills the transition.
    _rootEl.classList.remove("negishut-open");
    _fabEl.setAttribute("aria-expanded", "false");
    document.removeEventListener("keydown", onKeydown, true);

    // After the slide-out finishes (matches CSS transition duration),
    // hide the panel from the accessibility tree and tab order.
    if (_panelHideTimer) clearTimeout(_panelHideTimer);
    _panelHideTimer = setTimeout(function () {
      _panelEl.setAttribute("hidden", "");
      _panelHideTimer = null;
    }, 320);

    // Restore focus immediately (don't wait for animation)
    if (_previousFocus && typeof _previousFocus.focus === "function" && _previousFocus !== document.body) {
      try { _previousFocus.focus(); } catch (e) { _fabEl.focus(); }
    } else {
      _fabEl.focus();
    }
  }

  function togglePanel() {
    if (_rootEl.classList.contains("negishut-open")) closePanel();
    else openPanel();
  }

  function onKeydown(e) {
    if (e.key === "Escape" || e.keyCode === 27) {
      e.stopPropagation();
      closePanel();
      return;
    }
    // Focus trap (very lightweight): only trap when inside panel
    if (e.key !== "Tab") return;
    var focusables = _panelEl.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    var first = focusables[0];
    var last  = focusables[focusables.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }


  /* --------------------------------------------------------------------- */
  /*  Statement modal                                                       */
  /* --------------------------------------------------------------------- */

  function formatDateHe(d) {
    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
  }

  function buildStatementHTML() {
    var business = CONFIG.businessName || "";
    var coord    = CONFIG.coordinator || {};
    var name     = coord.name  || "";
    var email    = coord.email || "";
    var phone    = coord.phone || "";
    var limits   = CONFIG.knownLimitations || T.stmtNoLimits;
    var today    = formatDateHe(new Date());

    var introSubject = business
      ? T.stmtSiteIntro + " <strong>" + escapeHtml(business) + "</strong> "
      : "אנו ";

    var phoneBlock = phone
      ? '<p><strong>' + escapeHtml(T.stmtCoordPhone) + '</strong> ' +
        '<a href="tel:' + escapeHtml(phone) + '">' + escapeHtml(phone) + '</a></p>'
      : "";

    var featureItems = T.stmtFeatures.map(function (f) {
      return "<li>" + escapeHtml(f) + "</li>";
    }).join("");

    return [
      '<p class="negishut-modal-meta">' + escapeHtml(T.stmtUpdated) + ": " + today + "</p>",
      "<p>" + introSubject + T.stmtIntro1 + "</p>",

      "<h3>" + escapeHtml(T.stmtStandardH) + "</h3>",
      "<p>" + T.stmtStandardP + "</p>",

      "<h3>" + escapeHtml(T.stmtFeaturesH) + "</h3>",
      "<p>" + escapeHtml(T.stmtFeaturesP) + "</p>",
      "<ul>" + featureItems + "</ul>",
      "<p>" + escapeHtml(T.stmtFeaturesAfter) + "</p>",

      "<h3>" + escapeHtml(T.stmtLimitsH) + "</h3>",
      "<p>" + escapeHtml(limits) + "</p>",
      "<p>" + escapeHtml(T.stmtLanguage) + "</p>",

      "<h3>" + escapeHtml(T.stmtContactH) + "</h3>",
      "<p>" + escapeHtml(T.stmtContactP) + "</p>",
      '<div class="negishut-modal-contact">',
        "<p><strong>" + escapeHtml(T.stmtCoordName)  + "</strong> " + escapeHtml(name || "—") + "</p>",
        email
          ? '<p><strong>' + escapeHtml(T.stmtCoordEmail) + "</strong> " +
            '<a href="mailto:' + encodeURIComponent(email) + '">' +
            escapeHtml(email) + "</a></p>"
          : "",
        phoneBlock,
      "</div>"
    ].join("");
  }

  function buildModal() {
    var modal = document.createElement("div");
    modal.id = "negishut-modal";
    modal.setAttribute("hidden", "");

    var backdrop = document.createElement("div");
    backdrop.id = "negishut-modal-backdrop";
    backdrop.addEventListener("click", closeStatementModal);

    var card = document.createElement("div");
    card.id = "negishut-modal-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-labelledby", "negishut-modal-title");

    card.innerHTML =
      '<div id="negishut-modal-header">' +
        '<h2 id="negishut-modal-title">' + escapeHtml(T.statement) + '</h2>' +
        '<button type="button" id="negishut-modal-close" aria-label="' +
          escapeHtml(T.close) + '">&times;</button>' +
      '</div>' +
      '<div class="negishut-modal-body">' + buildStatementHTML() + '</div>';

    card.querySelector("#negishut-modal-close")
        .addEventListener("click", closeStatementModal);

    modal.appendChild(backdrop);
    modal.appendChild(card);
    return modal;
  }

  function openStatementModal() {
    if (!_modalEl) return;
    if (_modalHideTimer) { clearTimeout(_modalHideTimer); _modalHideTimer = null; }
    _modalPreviousFocus = document.activeElement;
    _modalEl.removeAttribute("hidden");
    // Force layout flush so the fade-in transition fires
    /* eslint-disable-next-line no-unused-expressions */
    _modalEl.offsetWidth;
    _modalEl.classList.add("negishut-modal-open");

    var close = document.getElementById("negishut-modal-close");
    if (close) setTimeout(function () { close.focus(); }, 50);
    document.addEventListener("keydown", onModalKeydown, true);
  }

  function closeStatementModal() {
    if (!_modalEl) return;
    _modalEl.classList.remove("negishut-modal-open");
    document.removeEventListener("keydown", onModalKeydown, true);

    if (_modalHideTimer) clearTimeout(_modalHideTimer);
    _modalHideTimer = setTimeout(function () {
      _modalEl.setAttribute("hidden", "");
      _modalHideTimer = null;
    }, 220);

    if (_modalPreviousFocus && typeof _modalPreviousFocus.focus === "function") {
      try { _modalPreviousFocus.focus(); } catch (e) { /* ignore */ }
    }
  }

  function onModalKeydown(e) {
    if (e.key === "Escape" || e.keyCode === 27) {
      e.stopPropagation();
      closeStatementModal();
      return;
    }
    if (e.key !== "Tab") return;
    var card = document.getElementById("negishut-modal-card");
    if (!card) return;
    var focusables = card.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusables.length) return;
    var first = focusables[0];
    var last  = focusables[focusables.length - 1];
    var active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }


  /* --------------------------------------------------------------------- */
  /*  Init                                                                  */
  /* --------------------------------------------------------------------- */

  function init() {
    // Determine document direction. If <html dir> isn't set, default to rtl
    // since this widget is Hebrew-first.
    var htmlDir = (document.documentElement.getAttribute("dir") || "").toLowerCase();
    var dir = htmlDir || "rtl";

    _rootEl = document.createElement("div");
    _rootEl.id = "negishut-root";
    _rootEl.setAttribute("dir", dir);
    _rootEl.setAttribute("data-position", CONFIG.position);

    // FAB
    _fabEl = document.createElement("button");
    _fabEl.type = "button";
    _fabEl.id = "negishut-fab";
    _fabEl.setAttribute("aria-label", T.openButton);
    _fabEl.setAttribute("aria-expanded", "false");
    _fabEl.setAttribute("aria-controls", "negishut-panel");
    _fabEl.innerHTML = ICONS.wheelchair;
    _fabEl.addEventListener("click", togglePanel);

    // Backdrop (for mobile / focus dimming)
    var backdrop = document.createElement("div");
    backdrop.id = "negishut-backdrop";
    backdrop.addEventListener("click", closePanel);

    _panelEl = buildPanel();
    _modalEl = buildModal();

    _rootEl.appendChild(backdrop);
    _rootEl.appendChild(_fabEl);
    _rootEl.appendChild(_panelEl);
    _rootEl.appendChild(_modalEl);

    document.body.appendChild(_rootEl);

    // Apply persisted state so the page reflects user prefs on first paint
    applyState();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
