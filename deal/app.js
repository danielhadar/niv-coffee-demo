// ============================================================
// CONFIGURATION — Change these values to customize the app.
// IMPORTANT: STORE_PIN, NIV_PIN, DEAL_EXPIRY, DAY_CUTOFF_HOUR
// must be kept in sync with backend/Code.gs.
// ============================================================

var STORE_PIN = "1234";
var NIV_PIN   = "5678";

var DEAL_EXPIRY     = "today";   // "today" | "+24h" | "+7d"
var DAY_CUTOFF_HOUR = 23;        // last hour of validity when DEAL_EXPIRY === "today"

var DEALS = [
  { title: "קפה + כריך", price: "35 ₪", note: "" },
  { title: "4+1 על הכריכים", price: "", note: "חמישי על חשבון הבית" }
];

// Must match the BACKEND_URL in src/app.js (single Apps Script deployment
// serves both apps). When this is empty, the page sits in a permanent error
// state — there's no useful "local-only" mode for the deal app because the
// whole point is server-tracked sessions.
var BACKEND_URL = "https://script.google.com/macros/s/AKfycbyM_7knxRp1RHZjJLliqVvNd21HgAfDXSdgIYyibqYJBaZ0iWAfvta8qY556DZizdeI8w/exec";

var SESSION_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
var SESSION_ID_LENGTH   = 16;
var SESSION_ID_REGEX    = /^[A-Z2-9]{16}$/;

// ============================================================
// DOM REFERENCES
// ============================================================

var screenActivate = document.getElementById("screen-activate");
var screenDeals    = document.getElementById("screen-deals");
var screenDone     = document.getElementById("screen-done");
var screenError    = document.getElementById("screen-error");

var storePinInput  = document.getElementById("store-pin-input");
var storePinBtn    = document.getElementById("store-pin-btn");
var storePinStatus = document.getElementById("store-pin-status");

var nivPinInput    = document.getElementById("niv-pin-input");
var nivPinBtn      = document.getElementById("niv-pin-btn");
var nivPinStatus   = document.getElementById("niv-pin-status");

var dealsListEl    = document.getElementById("deals-list");
var doneDealsEl    = document.getElementById("done-deals");
var doneTimestampEl = document.getElementById("done-timestamp");
var errorMessageEl = document.getElementById("screen-error-message");

var toastEl        = document.getElementById("toast");
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
  var m = h.match(/[#&]s=([A-Z2-9]{16})/);
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
  // Three main screens + the done overlay. show() handles them all uniformly.
  screenActivate.classList.add("hidden");
  screenDeals.classList.add("hidden");
  screenError.classList.add("hidden");
  screenDone.classList.remove("visible");
  if (screen === "activate") screenActivate.classList.remove("hidden");
  if (screen === "deals")    screenDeals.classList.remove("hidden");
  if (screen === "error")    screenError.classList.remove("hidden");
  if (screen === "done")     screenDone.classList.add("visible");
}

function renderDeals() {
  var html = "";
  for (var i = 0; i < DEALS.length; i++) {
    var d = DEALS[i];
    html += '<li class="deal-card">';
    html +=   '<span>';
    html +=     '<span class="deal-card-title">' + escapeHTML(d.title) + '</span>';
    if (d.note) {
      html +=   '<span class="deal-card-note">' + escapeHTML(d.note) + '</span>';
    }
    html +=   '</span>';
    if (d.price) {
      html += '<span class="deal-card-price">' + escapeHTML(d.price) + '</span>';
    }
    html += '</li>';
  }
  dealsListEl.innerHTML = html;
}

function renderDoneScreen(redeemedAtIso) {
  // List the deals as plain text so the customer remembers what they got
  // before the screen settles.
  var titles = DEALS.map(function (d) { return d.title; }).join(" · ");
  doneDealsEl.textContent = titles;
  // Local time, HH:MM.
  var d = new Date(redeemedAtIso);
  var hh = ("0" + d.getHours()).slice(-2);
  var mm = ("0" + d.getMinutes()).slice(-2);
  doneTimestampEl.textContent = "מומש בשעה " + hh + ":" + mm;
}

function renderErrorScreen(error) {
  var messages = {
    "locked":           "הסשן נחסם לאחר ניסיונות שגויים. סרקו שוב את הברקוד בחנות.",
    "expired":          "ההטבה פגה (תוקף ההטבה הסתיים).",
    "not_activated":    "הסשן עוד לא הופעל. הציגו את המסך למוכר/ת בחנות.",
    "backend_unconfigured": "השירות לא מוגדר. פנו לבית הקפה.",
    "network":          "אין חיבור לרשת. נסו שוב.",
    "unknown":          "משהו השתבש. נסו לרענן את הדף."
  };
  errorMessageEl.textContent = messages[error] || messages.unknown;
}

// ============================================================
// HANDLERS
// ============================================================

function setStatus(el, msg) {
  if (!msg) { el.classList.add("hidden"); el.textContent = ""; return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c];
  });
}

function attachPinBehavior(input, btn) {
  input.addEventListener("input", function () {
    // Strip non-digits so a numeric inputmode keyboard with autocorrect can't pollute.
    var clean = input.value.replace(/\D/g, "").slice(0, 4);
    if (clean !== input.value) input.value = clean;
    btn.disabled = clean.length !== 4;
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !btn.disabled) btn.click();
  });
}

function handleStorePinSubmit() {
  var pin = storePinInput.value;
  storePinBtn.disabled = true;
  setStatus(storePinStatus, "");
  backendActivate(sessionId, pin)
    .then(function (resp) {
      if (resp && resp.ok) {
        storePinInput.value = "";
        show("deals");
        return;
      }
      if (resp && resp.error === "locked") {
        show("error");
        renderErrorScreen("locked");
        return;
      }
      if (resp && resp.error === "wrong_pin") {
        setStatus(storePinStatus, "קוד שגוי. נסיונות שנותרו: " + resp.attempts_left);
        storePinInput.value = "";
        storePinInput.focus();
        return;
      }
      setStatus(storePinStatus, "שגיאה. נסו שוב.");
    })
    .catch(function (err) {
      if (err && err.message === "backend_unconfigured") {
        show("error");
        renderErrorScreen("backend_unconfigured");
        return;
      }
      setStatus(storePinStatus, "אין חיבור לרשת. נסו שוב.");
    })
    .then(function () { storePinBtn.disabled = storePinInput.value.length !== 4; });
}

function handleNivPinSubmit() {
  var pin = nivPinInput.value;
  nivPinBtn.disabled = true;
  setStatus(nivPinStatus, "");
  backendRedeem(sessionId, pin)
    .then(function (resp) {
      if (resp && resp.ok) {
        nivPinInput.value = "";
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
        nivPinInput.value = "";
        nivPinInput.focus();
        return;
      }
      if (resp && resp.error === "not_activated") {
        show("activate");
        return;
      }
      setStatus(nivPinStatus, "שגיאה. נסו שוב.");
    })
    .catch(function (err) {
      if (err && err.message === "backend_unconfigured") {
        show("error");
        renderErrorScreen("backend_unconfigured");
        return;
      }
      setStatus(nivPinStatus, "אין חיבור לרשת. נסו שוב.");
    })
    .then(function () { nivPinBtn.disabled = nivPinInput.value.length !== 4; });
}

// ============================================================
// INIT
// ============================================================

// Ensure localStorage works (vestigial — we don't actually use it, but the
// dialog is friendly to surface if the browser is locked down).
try {
  localStorage.setItem("__niv_deal_test__", "1");
  localStorage.removeItem("__niv_deal_test__");
} catch (e) {
  storageErrorEl.classList.remove("hidden");
}

var sessionId = getOrMintSessionId();

renderDeals();
attachPinBehavior(storePinInput, storePinBtn);
attachPinBehavior(nivPinInput, nivPinBtn);
storePinBtn.addEventListener("click", handleStorePinSubmit);
nivPinBtn.addEventListener("click", handleNivPinSubmit);

// On load, ask the server where we are in the flow. Lets a refresh land on
// the right screen.
backendStatus(sessionId)
  .then(function (resp) {
    if (!resp || !resp.ok) { show("activate"); return; }
    if (resp.locked)    { show("error"); renderErrorScreen("locked"); return; }
    if (resp.redeemed)  { renderDoneScreen(resp.redeemed_at || new Date().toISOString()); show("done"); return; }
    if (resp.expired)   { show("error"); renderErrorScreen("expired"); return; }
    if (resp.activated) { show("deals"); return; }
    show("activate");
  })
  .catch(function (err) {
    if (err && err.message === "backend_unconfigured") {
      show("error");
      renderErrorScreen("backend_unconfigured");
      return;
    }
    // On network failure, assume not-activated and let the customer try.
    show("activate");
  });
