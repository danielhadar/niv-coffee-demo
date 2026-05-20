// ============================================================
// CONFIGURATION — Change these values to customize the app.
//
// PINs and the expiry window are NOT here on purpose: they're enforced
// entirely server-side and putting them in the bundle would leak them
// to anyone who opens DevTools. The values that govern those (STORE_PIN,
// NIV_PIN, DEAL_EXPIRY, DAY_CUTOFF_HOUR) live at the top of backend/Code.gs.
// ============================================================

var DEALS = [
  { title: "קפה + כריך",       priceOld: "42 ₪",  priceNew: "35 ₪"  },
  { title: "4+1 על הכריכים",   priceOld: "160 ₪", priceNew: "128 ₪" }
];

// Must match the BACKEND_URL in src/app.js (single Apps Script deployment
// serves both apps). When this is empty, the page sits in a permanent error
// state — there's no useful "local-only" mode for the deal app because the
// whole point is server-tracked sessions.
var BACKEND_URL = "https://script.google.com/macros/s/AKfycbyM_7knxRp1RHZjJLliqVvNd21HgAfDXSdgIYyibqYJBaZ0iWAfvta8qY556DZizdeI8w/exec";

var SESSION_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
var SESSION_ID_LENGTH   = 16;

// How long the brief activation-success confetti overlay stays up before
// transitioning to the deals screen. ms.
var ACTIVATE_CELEBRATION_MS = 1800;

// ============================================================
// DOM REFERENCES
// ============================================================

var screenLoading         = document.getElementById("screen-loading");
var screenActivate        = document.getElementById("screen-activate");
var screenDeals           = document.getElementById("screen-deals");
var screenActivateSuccess = document.getElementById("screen-activate-success");
var screenDone            = document.getElementById("screen-done");
var screenError           = document.getElementById("screen-error");

var storePinCells  = document.querySelectorAll("#store-pin-cells .pin-cell");
var storePinBtn    = document.getElementById("store-pin-btn");
var storePinStatus = document.getElementById("store-pin-status");

var nivPinCells    = document.querySelectorAll("#niv-pin-cells .pin-cell");
var nivPinBtn      = document.getElementById("niv-pin-btn");
var nivPinStatus   = document.getElementById("niv-pin-status");

var dealsListEl    = document.getElementById("deals-list");
var dealExpiryEl   = document.getElementById("deal-expiry");
var doneTimestampEl = document.getElementById("done-timestamp");
var errorMessageEl = document.getElementById("screen-error-message");

var storageErrorEl = document.getElementById("storage-error");

// ============================================================
// SESSION ID
// ============================================================

function generateSessionId() {
  var s = "";
  for (var i = 0; i < SESSION_ID_LENGTH; i++) {
    s += SESSION_ID_ALPHABET.charAt(Math.floor(Math.random() * SESSION_ID_ALPHABET.length));
  }
  return s;
}

// Hash format: #s=ABC123...
function readSessionIdFromHash() {
  var h = window.location.hash || "";
  var m = h.match(/[#&]s=([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{16})/);
  return m ? m[1] : null;
}

function writeSessionIdToHash(sessionId) {
  // Replace history entry so the customer can't navigate "back" to the empty hash.
  var newHash = "#s=" + sessionId;
  history.replaceState(null, "", window.location.pathname + window.location.search + newHash);
}

function getOrMintSessionId() {
  var existing = readSessionIdFromHash();
  if (existing) return existing;
  var fresh = generateSessionId();
  writeSessionIdToHash(fresh);
  return fresh;
}

// ============================================================
// BACKEND CALLS
// ============================================================

function backendStatus(sessionId) {
  if (!BACKEND_URL) return Promise.reject(new Error("backend_unconfigured"));
  return fetch(BACKEND_URL + "?action=deal_status&session_id=" + encodeURIComponent(sessionId))
    .then(function (r) { if (!r.ok) throw new Error("bad_response"); return r.json(); });
}

function backendActivate(sessionId, pin) {
  if (!BACKEND_URL) return Promise.reject(new Error("backend_unconfigured"));
  return fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "deal_activate", session_id: sessionId, pin: pin })
  }).then(function (r) { if (!r.ok) throw new Error("bad_response"); return r.json(); });
}

function backendRedeem(sessionId, pin) {
  if (!BACKEND_URL) return Promise.reject(new Error("backend_unconfigured"));
  return fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "deal_redeem", session_id: sessionId, pin: pin })
  }).then(function (r) { if (!r.ok) throw new Error("bad_response"); return r.json(); });
}

// ============================================================
// SCREEN STATE MACHINE
// ============================================================

function show(screen) {
  // First call after init also dismisses the boot-time loading spinner.
  screenLoading.classList.add("hidden");
  screenActivate.classList.add("hidden");
  screenDeals.classList.add("hidden");
  screenError.classList.add("hidden");
  screenDone.classList.remove("visible");
  screenActivateSuccess.classList.remove("visible");

  if (screen === "activate")          { screenActivate.classList.remove("hidden"); focusFirstCell(storePinCells); }
  else if (screen === "deals")        { screenDeals.classList.remove("hidden");    focusFirstCell(nivPinCells); }
  else if (screen === "error")        { screenError.classList.remove("hidden"); }
  else if (screen === "done")         { screenDone.classList.add("visible"); }
  else if (screen === "activate-success") { screenActivateSuccess.classList.add("visible"); }
}

function focusFirstCell(cells) {
  if (!cells || !cells.length) return;
  // setTimeout deferral matters on iOS Safari: focusing a hidden→visible input
  // in the same tick the class flips often no-ops.
  setTimeout(function () { try { cells[0].focus(); } catch (e) {} }, 0);
}

// ============================================================
// RENDERERS
// ============================================================

function renderDeals() {
  var html = "";
  for (var i = 0; i < DEALS.length; i++) {
    var d = DEALS[i];
    html += '<li class="deal-card">';
    html +=   '<span class="deal-card-title">' + escapeHTML(d.title) + '</span>';
    html +=   '<span class="deal-card-prices">';
    if (d.priceNew) {
      html += '<span class="deal-card-price">' + escapeHTML(d.priceNew) + '</span>';
    }
    if (d.priceOld) {
      html += '<span class="deal-card-price-old">' + escapeHTML(d.priceOld) + '</span>';
    }
    html +=   '</span>';
    html += '</li>';
  }
  dealsListEl.innerHTML = html;
}

function renderDealExpiry(expiresAtIso) {
  if (!expiresAtIso) { dealExpiryEl.textContent = ""; return; }
  var d = new Date(expiresAtIso);
  var dd = ("0" + d.getDate()).slice(-2);
  var mm = ("0" + (d.getMonth() + 1)).slice(-2);
  var yy = String(d.getFullYear()).slice(-2);
  dealExpiryEl.textContent = "תום תוקף ההטבה: " + dd + "/" + mm + "/" + yy;
}

function renderDoneScreen(redeemedAtIso) {
  var d = new Date(redeemedAtIso);
  var dd = ("0" + d.getDate()).slice(-2);
  var mm = ("0" + (d.getMonth() + 1)).slice(-2);
  var hh = ("0" + d.getHours()).slice(-2);
  var mi = ("0" + d.getMinutes()).slice(-2);
  doneTimestampEl.textContent = "מומש ב- " + dd + "/" + mm + " " + hh + ":" + mi;
}

function renderErrorScreen(error) {
  var messages = {
    "locked":               "אנא סרקו שוב את הברקוד בחנות",
    "expired":              "ההטבה פגה (תוקף ההטבה הסתיים).",
    "not_activated":        "הסשן עוד לא הופעל. הציגו את המסך למוכר/ת בחנות.",
    "backend_unconfigured": "השירות לא מוגדר. פנו לבית הקפה.",
    "network":              "אין חיבור לרשת. נסו שוב.",
    "unknown":              "משהו השתבש. נסו לרענן את הדף."
  };
  errorMessageEl.textContent = messages[error] || messages.unknown;
}

// ============================================================
// PIN CELLS BEHAVIOR
// ============================================================

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c];
  });
}

function setStatus(el, msg) {
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function setLoading(btn, on) {
  if (on) btn.classList.add("is-loading");
  else    btn.classList.remove("is-loading");
}

// Wires up a row of 4 single-digit cells + a CTA button. Returns helpers.
function attachPinCells(cells, btn, onSubmit) {
  function getValue() {
    var v = "";
    for (var i = 0; i < cells.length; i++) v += cells[i].value;
    return v;
  }

  function clearCells() {
    for (var i = 0; i < cells.length; i++) cells[i].value = "";
    btn.disabled = true;
    try { cells[0].focus(); } catch (e) {}
  }

  function refreshCtaState() {
    btn.disabled = getValue().length !== cells.length;
  }

  for (var i = 0; i < cells.length; i++) {
    (function (idx) {
      var cell = cells[idx];
      cell.addEventListener("input", function () {
        // Keep only the last typed digit. Some keyboards on Android send the
        // whole sequence into one cell — slice forces single-digit cells.
        var digits = cell.value.replace(/\D/g, "");
        cell.value = digits.slice(-1);
        if (cell.value && idx < cells.length - 1) {
          cells[idx + 1].focus();
        } else if (cell.value && idx === cells.length - 1) {
          btn.focus();
        }
        refreshCtaState();
      });
      cell.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !cell.value && idx > 0) {
          cells[idx - 1].focus();
          cells[idx - 1].value = "";
          refreshCtaState();
          e.preventDefault();
        } else if (e.key === "ArrowLeft" && idx > 0) {
          cells[idx - 1].focus();
          e.preventDefault();
        } else if (e.key === "ArrowRight" && idx < cells.length - 1) {
          cells[idx + 1].focus();
          e.preventDefault();
        } else if (e.key === "Enter" && !btn.disabled) {
          btn.click();
        }
      });
      cell.addEventListener("paste", function (e) {
        var pasted = (e.clipboardData || window.clipboardData).getData("text") || "";
        var digits = pasted.replace(/\D/g, "").slice(0, cells.length - idx);
        if (!digits) return;
        e.preventDefault();
        for (var j = 0; j < digits.length; j++) cells[idx + j].value = digits[j];
        var nextIdx = Math.min(idx + digits.length, cells.length - 1);
        cells[nextIdx].focus();
        refreshCtaState();
      });
      cell.addEventListener("focus", function () { cell.select(); });
    })(i);
  }

  btn.addEventListener("click", function () { onSubmit(getValue()); });

  return { getValue: getValue, clearCells: clearCells };
}

// ============================================================
// HANDLERS
// ============================================================

var storePin;
var nivPin;

function handleStorePinSubmit(pin) {
  setLoading(storePinBtn, true);
  storePinBtn.disabled = true;
  setStatus(storePinStatus, "");
  backendActivate(sessionId, pin)
    .then(function (resp) {
      if (resp && resp.ok) {
        storePin.clearCells();
        // Render the expiry + deal cards now so they're ready behind the celebration.
        renderDealExpiry(resp.expires_at);
        // Brief celebration, then deals screen.
        show("activate-success");
        setTimeout(function () { show("deals"); }, ACTIVATE_CELEBRATION_MS);
        return;
      }
      if (resp && resp.error === "locked") {
        show("error");
        renderErrorScreen("locked");
        return;
      }
      if (resp && resp.error === "wrong_pin") {
        setStatus(storePinStatus, "קוד שגוי. נסיונות שנותרו: " + resp.attempts_left);
        storePin.clearCells();
        return;
      }
      setStatus(storePinStatus, "שגיאה. נסו שוב.");
      storePin.clearCells();
    })
    .catch(function (err) {
      if (err && err.message === "backend_unconfigured") {
        show("error");
        renderErrorScreen("backend_unconfigured");
        return;
      }
      setStatus(storePinStatus, "אין חיבור לרשת. נסו שוב.");
    })
    .then(function () { setLoading(storePinBtn, false); });
}

function handleNivPinSubmit(pin) {
  setLoading(nivPinBtn, true);
  nivPinBtn.disabled = true;
  setStatus(nivPinStatus, "");
  backendRedeem(sessionId, pin)
    .then(function (resp) {
      if (resp && resp.ok) {
        nivPin.clearCells();
        renderDoneScreen(resp.redeemed_at);
        show("done");
        return;
      }
      if (resp && (resp.error === "locked" || resp.error === "expired")) {
        show("error");
        renderErrorScreen(resp.error);
        return;
      }
      if (resp && resp.error === "already_redeemed") {
        renderDoneScreen(resp.redeemed_at);
        show("done");
        return;
      }
      if (resp && resp.error === "wrong_pin") {
        setStatus(nivPinStatus, "קוד שגוי. נסיונות שנותרו: " + resp.attempts_left);
        nivPin.clearCells();
        return;
      }
      if (resp && resp.error === "not_activated") {
        show("activate");
        return;
      }
      setStatus(nivPinStatus, "שגיאה. נסו שוב.");
      nivPin.clearCells();
    })
    .catch(function (err) {
      if (err && err.message === "backend_unconfigured") {
        show("error");
        renderErrorScreen("backend_unconfigured");
        return;
      }
      setStatus(nivPinStatus, "אין חיבור לרשת. נסו שוב.");
    })
    .then(function () { setLoading(nivPinBtn, false); });
}

// ============================================================
// INIT
// ============================================================

try {
  localStorage.setItem("__niv_deal_test__", "1");
  localStorage.removeItem("__niv_deal_test__");
} catch (e) {
  storageErrorEl.classList.remove("hidden");
}

var sessionId = getOrMintSessionId();

renderDeals();
storePin = attachPinCells(storePinCells, storePinBtn, handleStorePinSubmit);
nivPin   = attachPinCells(nivPinCells,   nivPinBtn,   handleNivPinSubmit);

// On load, ask the server where we are in the flow. Lets a refresh land on
// the right screen.
backendStatus(sessionId)
  .then(function (resp) {
    if (!resp || !resp.ok) { show("activate"); return; }
    if (resp.locked)    { show("error"); renderErrorScreen("locked"); return; }
    if (resp.redeemed)  { renderDoneScreen(resp.redeemed_at || new Date().toISOString()); show("done"); return; }
    if (resp.expired)   { show("error"); renderErrorScreen("expired"); return; }
    if (resp.activated) { renderDealExpiry(resp.expires_at); show("deals"); return; }
    show("activate");
  })
  .catch(function (err) {
    if (err && err.message === "backend_unconfigured") {
      show("error");
      renderErrorScreen("backend_unconfigured");
      return;
    }
    show("activate");
  });
