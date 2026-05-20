# Store-Deal Redemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a deal-redemption mini-app at `niv-cafe.com/deal/` that lets a customer who bought ≥X NIS at the neighboring store unlock and redeem promotional deals at Niv Cafe via two static-PIN gates (store cashier + Niv) on the customer's phone, with single-use server-tracked sessions.

**Architecture:** New `/deal/` page inside the existing niv-cafe repo (shares deploy, assets, accessibility widget). Three-screen single-page flow (activate → deals → done), client-minted 16-char `session_id` in URL hash, three new Apps Script actions (`deal_activate`, `deal_redeem`, `deal_status`) writing to a new `deal_sessions` sheet, with activation/redemption events appended to the existing `events` sheet so the existing dashboard pivots work. Confetti on successful redemption reuses the punch-card's `.celebration-overlay` + `.confetti` CSS.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step), Google Apps Script on the same Google Sheet that backs the punch card, hosted on GitHub Pages.

**Reference spec:** `docs/superpowers/specs/2026-05-20-store-deal-design.md`

**Testing note:** Per the punch-card convention, there is no automated test runner. Every task that changes runtime behavior ends with a manual verification step (curl against the deployed Apps Script, or a browser-based check). The verification is part of the task — don't mark a task complete without running it.

---

## Task 1: Scaffold deal page directory and empty files

**Files:**
- Create: `niv-cafe/deal/index.html` (empty for now, will hydrate in Task 4)
- Create: `niv-cafe/deal/app.js` (empty)
- Create: `niv-cafe/deal/style.css` (empty)
- Create: `niv-cafe/deal-qr.html` (empty, will hydrate in Task 7)

- [ ] **Step 1: Create the directory and placeholder files**

```bash
cd /Users/danielhadar/claude/niv-cafe
mkdir -p deal
touch deal/index.html deal/app.js deal/style.css deal-qr.html
```

- [ ] **Step 2: Verify the scaffolding**

```bash
ls -la deal/ && ls -la deal-qr.html
```

Expected:
```
deal/index.html
deal/app.js
deal/style.css
deal-qr.html
```
All zero-byte files in place.

- [ ] **Step 3: Commit the scaffold**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add deal/ deal-qr.html
git commit -m "deal: scaffold empty files for /deal/ page + deal-qr poster"
```

---

## Task 2: Extend `backend/Code.gs` with deal-session helpers, handlers, and event logging

**Files:**
- Modify: `niv-cafe/backend/Code.gs` (add deal_sessions sheet accessor + handlers + extend dispatcher)

This is the largest task. It adds:
1. `getDealSessionsSheet_()` (mirrors `getCodesSheet_()` pattern)
2. New constants near the top: `STORE_PIN`, `NIV_PIN`, `DEAL_EXPIRY`, `DAY_CUTOFF_HOUR`, `DEAL_PIN_MAX_ATTEMPTS`, `DEAL_SESSIONS_HEADER`, `DEAL_SESSION_ID_REGEX`
3. `computeDealExpiry_(activated_at)` helper that resolves `DEAL_EXPIRY` to a real Date in the spreadsheet TZ
4. `findDealSessionRow_(sheet, session_id)` (mirrors `findCodeRow_`)
5. `readDealSession_(sheet, row)` and `writeDealSession_(sheet, row, fields)` helpers
6. Event-logging helper `logDealEvent_(type, session_id, now)`
7. Three handlers: `handleDealActivate_`, `handleDealRedeem_`, `handleDealStatus_`
8. Dispatcher additions in `doPost` (deal_activate, deal_redeem) and `doGet` (deal_status)

- [ ] **Step 1: Add the new constants below the existing constants block**

Open `niv-cafe/backend/Code.gs`. Find the block ending at line 40 (`var CODE_REGEX = /^[2-9A-HJ-NP-Z]{6}$/;`). **Immediately after that line**, insert:

```javascript

// ---------- deal-redemption config ----------
// MUST match the values in deal/app.js. Keep these in sync until a future
// iteration moves them to a shared config endpoint.

var STORE_PIN              = '1234';
var NIV_PIN                = '5678';
var DEAL_EXPIRY            = 'today';   // 'today' | '+24h' | '+7d'
var DAY_CUTOFF_HOUR        = 23;        // when DEAL_EXPIRY === 'today', sessions expire at the end of this hour
var DEAL_PIN_MAX_ATTEMPTS  = 5;

var DEAL_SESSIONS_HEADER   = ['session_id', 'activated_at', 'redeemed_at', 'failed_pin_count', 'locked'];
var DEAL_SESSION_ID_REGEX  = /^[A-Z2-9]{16}$/;
```

- [ ] **Step 2: Add the deal-sessions sheet accessor**

Find the `getEventsSheet_` function (around line 56-62). **Immediately after it**, insert:

```javascript

function getDealSessionsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('deal_sessions');
  if (!sheet) sheet = ss.insertSheet('deal_sessions');
  ensureHeader_(sheet, DEAL_SESSIONS_HEADER);
  return sheet;
}
```

- [ ] **Step 3: Add the expiry computation helper**

Find the `toInt_` helper (around line 90-94). **Immediately after it**, insert:

```javascript

// Resolves DEAL_EXPIRY to an absolute Date. Server-side authority — clients
// never compute their own expiry. Uses the spreadsheet TZ for 'today' so the
// cutoff is wall-clock local time, not UTC.
function computeDealExpiry_(activatedAt) {
  if (DEAL_EXPIRY === '+24h') {
    return new Date(activatedAt.getTime() + 24 * 60 * 60 * 1000);
  }
  if (DEAL_EXPIRY === '+7d') {
    return new Date(activatedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  // 'today' — last second of DAY_CUTOFF_HOUR in the spreadsheet TZ.
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var ymd = Utilities.formatDate(activatedAt, tz, 'yyyy-MM-dd');
  var hh  = (DAY_CUTOFF_HOUR < 10 ? '0' : '') + DAY_CUTOFF_HOUR;
  // ISO-like local datetime; Date.parse handles 'yyyy-MM-ddTHH:mm:ss' as local time.
  return new Date(ymd + 'T' + hh + ':59:59');
}
```

- [ ] **Step 4: Add the deal-session row helpers**

Find the `stateToCodeRow_` function (ends around line 125). **Immediately after it**, insert:

```javascript

// ---------- deal-session helpers ----------

function findDealSessionRow_(sheet, sessionId) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === sessionId) return i + 2;
  }
  return -1;
}

function readDealSession_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, DEAL_SESSIONS_HEADER.length).getValues()[0];
  return {
    session_id:        values[0],
    activated_at:      values[1] instanceof Date ? values[1] : null,
    redeemed_at:       values[2] instanceof Date ? values[2] : null,
    failed_pin_count:  toInt_(values[3]),
    locked:            values[4] === true || values[4] === 'TRUE' || values[4] === 'true'
  };
}

// Writes a full row. Caller passes a partial object; missing fields stay empty.
function writeDealSession_(sheet, row, session) {
  var rowData = [
    session.session_id,
    session.activated_at || '',
    session.redeemed_at  || '',
    toInt_(session.failed_pin_count),
    session.locked ? true : false
  ];
  if (row === -1) {
    sheet.appendRow(rowData);
  } else {
    sheet.getRange(row, 1, 1, DEAL_SESSIONS_HEADER.length).setValues([rowData]);
  }
}
```

- [ ] **Step 5: Add the deal-event logging helper**

Find the `logSocialEvent_` function (around line 165-167). **Immediately after it**, insert:

```javascript

function logDealEvent_(type, sessionId, now) {
  // value is the first 6 chars of session_id — enough to disambiguate in the
  // log without leaking the full token.
  var shortId = (sessionId || '').slice(0, 6);
  getEventsSheet_().appendRow([now, type, shortId]);
}
```

- [ ] **Step 6: Add the three handlers**

Find the `handleScan_` function (around line 222-226). **Immediately after it**, insert:

```javascript

// ---------- deal handlers ----------

function handleDealActivate_(body, now) {
  if (!body.session_id || !DEAL_SESSION_ID_REGEX.test(body.session_id) ||
      typeof body.pin !== 'string') {
    return json_({ ok: false, error: 'bad_request' });
  }
  var sheet = getDealSessionsSheet_();
  var row = findDealSessionRow_(sheet, body.session_id);
  var session;
  if (row === -1) {
    session = {
      session_id: body.session_id,
      activated_at: null,
      redeemed_at: null,
      failed_pin_count: 0,
      locked: false
    };
  } else {
    session = readDealSession_(sheet, row);
  }
  if (session.locked) {
    return json_({ ok: false, error: 'locked' });
  }
  if (body.pin !== STORE_PIN) {
    session.failed_pin_count = (session.failed_pin_count || 0) + 1;
    if (session.failed_pin_count >= DEAL_PIN_MAX_ATTEMPTS) {
      session.locked = true;
      writeDealSession_(sheet, row, session);
      logDealEvent_('deal_lock', body.session_id, now);
      return json_({ ok: false, error: 'locked' });
    }
    writeDealSession_(sheet, row, session);
    return json_({ ok: false, error: 'wrong_pin', attempts_left: DEAL_PIN_MAX_ATTEMPTS - session.failed_pin_count });
  }
  // Correct PIN.
  if (session.activated_at) {
    // Idempotent — already activated, return existing expiry.
    return json_({ ok: true, expires_at: computeDealExpiry_(session.activated_at).toISOString() });
  }
  session.activated_at = now;
  session.failed_pin_count = 0;   // reset counter on first successful gate
  writeDealSession_(sheet, row, session);
  logDealEvent_('deal_activate', body.session_id, now);
  return json_({ ok: true, expires_at: computeDealExpiry_(now).toISOString() });
}

function handleDealRedeem_(body, now) {
  if (!body.session_id || !DEAL_SESSION_ID_REGEX.test(body.session_id) ||
      typeof body.pin !== 'string') {
    return json_({ ok: false, error: 'bad_request' });
  }
  var sheet = getDealSessionsSheet_();
  var row = findDealSessionRow_(sheet, body.session_id);
  if (row === -1) {
    return json_({ ok: false, error: 'not_activated' });
  }
  var session = readDealSession_(sheet, row);
  if (session.locked) {
    return json_({ ok: false, error: 'locked' });
  }
  if (!session.activated_at) {
    return json_({ ok: false, error: 'not_activated' });
  }
  var expiresAt = computeDealExpiry_(session.activated_at);
  if (now.getTime() > expiresAt.getTime()) {
    return json_({ ok: false, error: 'expired' });
  }
  if (session.redeemed_at) {
    return json_({ ok: false, error: 'already_redeemed', redeemed_at: session.redeemed_at.toISOString() });
  }
  if (body.pin !== NIV_PIN) {
    session.failed_pin_count = (session.failed_pin_count || 0) + 1;
    if (session.failed_pin_count >= DEAL_PIN_MAX_ATTEMPTS) {
      session.locked = true;
      writeDealSession_(sheet, row, session);
      logDealEvent_('deal_lock', body.session_id, now);
      return json_({ ok: false, error: 'locked' });
    }
    writeDealSession_(sheet, row, session);
    return json_({ ok: false, error: 'wrong_pin', attempts_left: DEAL_PIN_MAX_ATTEMPTS - session.failed_pin_count });
  }
  session.redeemed_at = now;
  writeDealSession_(sheet, row, session);
  logDealEvent_('deal_redeem', body.session_id, now);
  return json_({ ok: true, redeemed_at: now.toISOString() });
}

function handleDealStatus_(sessionId, now) {
  if (!sessionId || !DEAL_SESSION_ID_REGEX.test(sessionId)) {
    return json_({ ok: false, error: 'bad_request' });
  }
  var sheet = getDealSessionsSheet_();
  var row = findDealSessionRow_(sheet, sessionId);
  if (row === -1) {
    return json_({ ok: true, activated: false, redeemed: false, expired: false, locked: false });
  }
  var session = readDealSession_(sheet, row);
  var expiresAt = session.activated_at ? computeDealExpiry_(session.activated_at) : null;
  var expired = !!(expiresAt && now.getTime() > expiresAt.getTime());
  return json_({
    ok: true,
    activated:   !!session.activated_at,
    redeemed:    !!session.redeemed_at,
    expired:     expired,
    locked:      !!session.locked,
    expires_at:  expiresAt ? expiresAt.toISOString() : null,
    redeemed_at: session.redeemed_at ? session.redeemed_at.toISOString() : null
  });
}
```

- [ ] **Step 7: Wire the new actions into the dispatcher**

Find `doPost` (around line 228-241). Replace the `if (body.action === 'scan') return handleScan_(body, now);` line and the trailing `return json_({ ok: false, error: 'bad_request' });` line by inserting the two new POST cases **before the bad_request return**.

Existing block (around lines 234-237):
```javascript
    if (body.action === 'set')   return handleSet_(body, now);
    if (body.action === 'click') return handleClick_(body, now);
    if (body.action === 'scan')  return handleScan_(body, now);
    return json_({ ok: false, error: 'bad_request' });
```

Replace with:
```javascript
    if (body.action === 'set')           return handleSet_(body, now);
    if (body.action === 'click')         return handleClick_(body, now);
    if (body.action === 'scan')          return handleScan_(body, now);
    if (body.action === 'deal_activate') return handleDealActivate_(body, now);
    if (body.action === 'deal_redeem')   return handleDealRedeem_(body, now);
    return json_({ ok: false, error: 'bad_request' });
```

Then find `doGet` (around line 179-194). Existing logic only accepts `action === 'get'`. Modify the early-return so `deal_status` is also accepted.

Replace the existing block:
```javascript
    var action = (e && e.parameter) ? e.parameter.action : null;
    var code   = (e && e.parameter) ? e.parameter.code   : null;
    if (action !== 'get' || !code || !CODE_REGEX.test(code)) {
      return json_({ ok: false, error: 'bad_request' });
    }
    var sheet = getCodesSheet_();
    var row = findCodeRow_(sheet, code);
    if (row === -1) return json_({ ok: false });
    var values = sheet.getRange(row, 1, 1, CODES_HEADER.length).getValues()[0];
    return json_({ ok: true, state: rowToState_(values) });
```

With:
```javascript
    var action = (e && e.parameter) ? e.parameter.action : null;
    if (action === 'deal_status') {
      var sessionId = (e && e.parameter) ? e.parameter.session_id : null;
      return handleDealStatus_(sessionId, new Date());
    }
    var code = (e && e.parameter) ? e.parameter.code : null;
    if (action !== 'get' || !code || !CODE_REGEX.test(code)) {
      return json_({ ok: false, error: 'bad_request' });
    }
    var sheet = getCodesSheet_();
    var row = findCodeRow_(sheet, code);
    if (row === -1) return json_({ ok: false });
    var values = sheet.getRange(row, 1, 1, CODES_HEADER.length).getValues()[0];
    return json_({ ok: true, state: rowToState_(values) });
```

- [ ] **Step 8: Update the file header comment to document the new actions**

Find the `*` API block at the top (around lines 16-22). Replace with:

```javascript
 * API:
 *   GET  ?action=get&code=XXXXXX                       -> { ok, state }
 *   GET  ?action=deal_status&session_id=ZZ...          -> { ok, activated, redeemed, expired, locked, expires_at }
 *   POST {action:"set",   code, state}                 -> { ok };   server diffs old→new and logs punch/freebie events.
 *   POST {action:"click", value}                       -> { ok };   logs a social event.
 *   POST {action:"scan"}                               -> { ok };   logs a qr scan event.
 *   POST {action:"deal_activate", session_id, pin}     -> { ok, expires_at } | { ok:false, error:"locked"|"wrong_pin", attempts_left? }
 *   POST {action:"deal_redeem",   session_id, pin}     -> { ok, redeemed_at } | { ok:false, error:"locked"|"wrong_pin"|"expired"|"already_redeemed"|"not_activated", attempts_left?, redeemed_at? }
```

And the "Two sheets" comment at the top — replace with "Three sheets" and add a `deal_sessions` block:

Find:
```javascript
 * Two sheets in the spreadsheet:
 *
 *   "codes" sheet (current punch state per code):
 *     A: code | B: coffee | C: pizza | D: sandwich | E: updated_at
 *
 *   "events" sheet (auto-created on first event, append-only):
 *     A: ts | B: type | C: value
 *     type ∈ {punch, freebie, social, scan}
 *     value: tab key for punch/freebie ("coffee"/"pizza"/"sandwich"),
 *            icon key for social ("facebook"/"instagram"/"maps"/"phone"),
 *            source for scan ("qr").
```

Replace with:
```javascript
 * Three sheets in the spreadsheet:
 *
 *   "codes" sheet (current punch state per code):
 *     A: code | B: coffee | C: pizza | D: sandwich | E: updated_at
 *
 *   "events" sheet (auto-created on first event, append-only):
 *     A: ts | B: type | C: value
 *     type ∈ {punch, freebie, social, scan, deal_activate, deal_redeem, deal_lock}
 *     value: tab key for punch/freebie ("coffee"/"pizza"/"sandwich"),
 *            icon key for social ("facebook"/"instagram"/"maps"/"phone"),
 *            source for scan ("qr"),
 *            first 6 chars of session_id for deal_* events.
 *
 *   "deal_sessions" sheet (auto-created on first deal interaction):
 *     A: session_id | B: activated_at | C: redeemed_at | D: failed_pin_count | E: locked
```

- [ ] **Step 9: Verify the file still parses (syntax check via Apps Script editor)**

Apps Script doesn't have a local linter; the easiest sanity check is opening the file in any JS-aware editor and confirming no obvious syntax errors, then proceeding to Task 3 which actually deploys it.

Optional local check (if Node is available):

```bash
node --check /Users/danielhadar/claude/niv-cafe/backend/Code.gs 2>&1 || echo "Node may not like Apps Script globals — that's OK as long as the only errors are 'is not defined' for SpreadsheetApp/Utilities/ContentService."
```

Expected: no syntax errors. "Is not defined" warnings for Apps Script globals are fine — they don't exist outside the Apps Script runtime.

- [ ] **Step 10: Commit**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add backend/Code.gs
git commit -m "backend: add deal_sessions sheet + activate/redeem/status handlers"
```

---

## Task 3: Deploy the updated Apps Script and wire BACKEND_URL into both apps

**Files:**
- Modify: `niv-cafe/src/app.js:32` (BACKEND_URL is currently `""`)
- Modify: `niv-cafe/deal/app.js` (will get its own BACKEND_URL constant in Task 6 — for now we just write down the URL we get from deploying)

This is the one unavoidable manual task. The Apps Script needs to be deployed against a real Google Sheet that doesn't exist yet (the fork left `BACKEND_URL = ""` to make this explicit).

- [ ] **Step 1: Create a new Google Sheet**

Navigate to <https://sheets.new>. Name it `Niv punch cards`. Leave it empty — the script will populate it on first write.

- [ ] **Step 2: Open the Apps Script editor**

In the new sheet: `Extensions` → `Apps Script`.

- [ ] **Step 3: Paste the script**

Copy the entire contents of `niv-cafe/backend/Code.gs` into the editor, replacing the default `function myFunction()` skeleton. Save (⌘S).

- [ ] **Step 4: Deploy as Web App**

- Top right: `Deploy` → `New deployment`
- Click the gear icon next to "Select type" → choose `Web app`
- Description: `niv v1`
- Execute as: **Me** (your account)
- Who has access: **Anyone**
- Click `Deploy`
- First-time authorization: Google asks to authorize the script. Approve. (The "unsafe" warning is normal for unverified personal scripts — it's your own script touching your own sheet.)
- Copy the **Web app URL** that appears. It looks like:
  `https://script.google.com/macros/s/AKfy.../exec`

- [ ] **Step 5: Wire BACKEND_URL into `src/app.js`**

Open `niv-cafe/src/app.js`. Find line 32:

```javascript
var BACKEND_URL = "";
```

Replace with (use the actual URL from Step 4):

```javascript
var BACKEND_URL = "https://script.google.com/macros/s/AKfy.../exec";
```

- [ ] **Step 6: Verify the deployment with a smoke test**

```bash
# Replace URL_FROM_STEP_4 with the actual URL
curl -s "URL_FROM_STEP_4?action=deal_status&session_id=ABCDEFGH23456789"
```

Expected response (since the session doesn't exist yet):

```json
{"ok":true,"activated":false,"redeemed":false,"expired":false,"locked":false}
```

If you get an HTML page back instead of JSON, the deployment access isn't "Anyone" — fix in step 4.

If you get `{"ok":false,"error":"bad_request"}`, the session_id format check is rejecting your test ID — confirm it's exactly 16 chars from the alphabet `[A-Z2-9]`.

- [ ] **Step 7: Commit `src/app.js`**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add src/app.js
git commit -m "app: wire backend webapp URL (niv punch cards sheet)"
```

- [ ] **Step 8: Open the sheet and confirm the `deal_sessions` tab now exists**

Reload the spreadsheet in the browser. You should see three tabs: `codes` (the script auto-created/renamed on the smoke-test call), `events`, `deal_sessions`. The `deal_sessions` tab should have row 1 = `session_id | activated_at | redeemed_at | failed_pin_count | locked`.

If only `deal_sessions` shows up (and not `codes` / `events`), that's fine — the punch card hasn't been used yet on this sheet, those tabs only materialize on first use.

---

## Task 4: Build `deal/index.html` (three screens + celebration overlay)

**Files:**
- Modify (rewrite from empty): `niv-cafe/deal/index.html`

The page reuses the existing fonts, manifest, and accessibility widget. Three `<section>` screens stacked with `.hidden` toggled by JS; the done state is a full-viewport `.celebration-overlay` so the existing confetti CSS just works.

- [ ] **Step 1: Write the full HTML**

Replace the empty `niv-cafe/deal/index.html` with:

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#3F5C38">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="default">
  <meta name="apple-mobile-web-app-title" content="ניב קפה מעדניה">
  <link rel="apple-touch-icon" sizes="180x180" href="../assets/apple-touch-icon.png?v=15">
  <link rel="icon" type="image/png" sizes="32x32" href="../assets/favicon.png?v=15">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alef:wght@400;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../src/style.css?v=15">
  <link rel="stylesheet" href="style.css?v=15">
  <script src="app.js?v=15" defer></script>
  <title>ניב קפה מעדניה - הטבה</title>
</head>
<body>

  <!-- localStorage unavailable error (hidden by default; we use sessionStorage as a soft hint but the URL hash is the real session source of truth, so this is mostly informational) -->
  <div id="storage-error" class="storage-error hidden">
    <p class="storage-error-he">הדפדפן לא תומך בשמירת נתונים. נסו לפתוח בדפדפן רגיל.</p>
  </div>

  <div id="app" class="app-container">

    <header class="header">
      <img src="../assets/logo.png?v=15" alt="ניב קפה מעדניה - Niv" class="header-logo">
    </header>

    <!-- Toast notification -->
    <div id="toast" class="toast hidden" aria-live="polite"></div>

    <!-- Screen 1: cashier-gate -->
    <section id="screen-activate" class="deal-screen" aria-labelledby="screen-activate-title">
      <h1 id="screen-activate-title" class="deal-title">הראו את המסך למוכר/ת בחנות</h1>
      <p class="deal-subtitle">המוכר/ת תקליד קוד בן 4 ספרות כדי להפעיל את ההטבה</p>
      <div class="pin-section">
        <input
          type="text"
          id="store-pin-input"
          class="pin-input"
          inputmode="numeric"
          maxlength="4"
          placeholder="••••"
          aria-label="קוד הפעלה"
          autocomplete="off">
        <button type="button" id="store-pin-btn" class="punch-btn" disabled>הפעלה</button>
        <div id="store-pin-status" class="status-message hidden" role="status" aria-live="polite"></div>
      </div>
    </section>

    <!-- Screen 2: deals + Niv-redeem -->
    <section id="screen-deals" class="deal-screen hidden" aria-labelledby="screen-deals-title">
      <h1 id="screen-deals-title" class="deal-title">ההטבה הופעלה ✓</h1>
      <p class="deal-subtitle">הציגו את המסך לניב והוא יזין קוד</p>
      <ul id="deals-list" class="deals-list"></ul>
      <div class="pin-section">
        <input
          type="text"
          id="niv-pin-input"
          class="pin-input"
          inputmode="numeric"
          maxlength="4"
          placeholder="••••"
          aria-label="קוד מימוש"
          autocomplete="off">
        <button type="button" id="niv-pin-btn" class="punch-btn" disabled>מימוש</button>
        <div id="niv-pin-status" class="status-message hidden" role="status" aria-live="polite"></div>
      </div>
    </section>

    <!-- Screen 4: error (locked / expired / unexpected) -->
    <section id="screen-error" class="deal-screen hidden" aria-labelledby="screen-error-title">
      <h1 id="screen-error-title" class="deal-title">משהו השתבש</h1>
      <p id="screen-error-message" class="deal-subtitle"></p>
      <p class="deal-subtitle deal-subtitle--muted">סרקו שוב את הברקוד בחנות כדי לנסות שוב</p>
    </section>

  </div>

  <!-- Screen 3: done — reuses celebration-overlay so confetti CSS just works -->
  <div id="screen-done" class="celebration-overlay" role="dialog" aria-modal="true" aria-labelledby="done-title">
    <div class="confetti-container">
      <div class="confetti confetti-diamond"></div>
      <div class="confetti confetti-circle"></div>
      <div class="confetti confetti-hexagon"></div>
      <div class="confetti confetti-triangle"></div>
      <div class="confetti confetti-square"></div>
      <div class="confetti confetti-diamond"></div>
      <div class="confetti confetti-circle"></div>
      <div class="confetti confetti-hexagon"></div>
      <div class="confetti confetti-triangle"></div>
      <div class="confetti confetti-square"></div>
      <div class="confetti confetti-diamond"></div>
      <div class="confetti confetti-circle"></div>
      <div class="confetti confetti-hexagon"></div>
      <div class="confetti confetti-triangle"></div>
      <div class="confetti confetti-square"></div>
      <div class="confetti confetti-diamond"></div>
      <div class="confetti confetti-circle"></div>
      <div class="confetti confetti-hexagon"></div>
      <div class="confetti confetti-triangle"></div>
      <div class="confetti confetti-square"></div>
      <div class="confetti confetti-diamond"></div>
      <div class="confetti confetti-circle"></div>
      <div class="confetti confetti-hexagon"></div>
      <div class="confetti confetti-triangle"></div>
      <div class="confetti confetti-square"></div>
      <div class="confetti confetti-diamond"></div>
      <div class="confetti confetti-circle"></div>
      <div class="confetti confetti-hexagon"></div>
      <div class="confetti confetti-triangle"></div>
      <div class="confetti confetti-square"></div>
    </div>
    <div class="celebration-content">
      <h2 id="done-title" class="celebration-line1">נוצל ✓</h2>
      <p id="done-deals" class="done-deals"></p>
      <p id="done-timestamp" class="done-timestamp"></p>
    </div>
  </div>

  <!-- Negishut accessibility widget — IS 5568 / WCAG 2.0 AA -->
  <script>
    window.NegishutConfig = {
      position:         "bottom-right",
      businessName:     "ניב קפה מעדניה",
      knownLimitations: "",
      coordinator: {
        name:  "דניאל הדר",
        email: "TODO-niv-accessibility@example.com",
        phone: ""
      }
    };
  </script>
  <link rel="stylesheet" href="../vendor/negishut/negishut.css?v=8593dd0b">
  <script src="../vendor/negishut/negishut.js?v=8593dd0b" defer></script>
</body>
</html>
```

- [ ] **Step 2: Verify the page opens in a browser without errors**

```bash
cd /Users/danielhadar/claude/niv-cafe && python3 -m http.server 8000 &
sleep 1
open http://localhost:8000/deal/
```

Expected: page loads, you see the logo + "הראו את המסך למוכר/ת בחנות" title + an empty PIN field + a disabled "הפעלה" button.

The JS isn't written yet so the button stays disabled forever — that's fine. Just confirm the page renders with no console errors (open DevTools, check Console).

Stop the local server when done:

```bash
kill %1 2>/dev/null
```

- [ ] **Step 3: Commit**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add deal/index.html
git commit -m "deal: build three-screen html shell + done overlay"
```

---

## Task 5: Build `deal/style.css` (deal-specific styles, reuses the global palette)

**Files:**
- Modify (rewrite from empty): `niv-cafe/deal/style.css`

This sheet is intentionally short — most styling comes from `../src/style.css` (palette vars, font, header, toast, celebration overlay, confetti). The deal-specific additions: screen layout, pin input, deals list.

- [ ] **Step 1: Write the CSS**

Replace the empty `niv-cafe/deal/style.css` with:

```css
/* ============================================================
   Deal-page-specific styles. Global palette/font/header/toast/
   celebration come from ../src/style.css. Keep this sheet small.
   ============================================================ */

.deal-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 24px 32px;
  text-align: center;
}

.deal-title {
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--green);
  margin: 8px 0 12px;
  line-height: 1.3;
}

.deal-subtitle {
  font-size: 1.05rem;
  font-weight: 400;
  color: var(--green);
  opacity: 0.85;
  margin: 0 0 20px;
  line-height: 1.45;
}

.deal-subtitle--muted {
  opacity: 0.6;
  font-size: 0.95rem;
  margin-top: 8px;
}

/* PIN field — same visual weight as the punch-card code input but always 4 chars. */
.pin-section {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
}

.pin-input {
  font-family: var(--font-stack);
  font-size: 2.4rem;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.4em;
  padding: 14px 16px;
  border: 2px solid var(--green);
  border-radius: var(--radius);
  background: var(--white);
  color: var(--green);
  outline: none;
  caret-color: var(--green);
}

.pin-input::placeholder {
  color: var(--green);
  opacity: 0.35;
  letter-spacing: 0.4em;
}

.pin-input:focus {
  border-color: var(--coral);
}

.hidden { display: none !important; }

/* Deals list — one card per deal, all visible at once. */
.deals-list {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 360px;
  text-align: right;
}

.deal-card {
  background: var(--white);
  border: 1.5px solid rgba(63, 92, 56, 0.18);
  border-radius: var(--radius);
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.deal-card-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--green);
}

.deal-card-price {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--coral);
  white-space: nowrap;
}

.deal-card-note {
  display: block;
  font-size: 0.9rem;
  font-weight: 400;
  color: var(--green);
  opacity: 0.7;
  margin-top: 4px;
}

/* Done overlay — reuse celebration-overlay base; add a small label below the big "נוצל ✓". */
.done-deals {
  font-size: 1.05rem;
  margin: 0 0 8px;
  color: var(--white);
  opacity: 0.9;
}

.done-timestamp {
  font-size: 0.95rem;
  margin: 0;
  color: var(--white);
  opacity: 0.6;
}
```

- [ ] **Step 2: Verify in the browser**

```bash
cd /Users/danielhadar/claude/niv-cafe && python3 -m http.server 8000 &
sleep 1
open http://localhost:8000/deal/
```

Expected: page now renders with the title, subtitle, PIN field, and button properly styled — green text, generous PIN field with placeholder dots, large green border. No layout breakage.

Stop the server:

```bash
kill %1 2>/dev/null
```

- [ ] **Step 3: Commit**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add deal/style.css
git commit -m "deal: style the deal-screen, pin input, and deals list"
```

---

## Task 6: Build `deal/app.js` (config, session_id, state machine, backend calls)

**Files:**
- Modify (rewrite from empty): `niv-cafe/deal/app.js`

This file is the brain of the page. Roughly:
- Config block at the top (PINs, deals, expiry — MUST match Code.gs).
- `BACKEND_URL` constant (must match the value in `src/app.js`).
- `getOrMintSessionId()` reads the URL hash, mints a 16-char id if missing.
- `deal_status` on load → routes to the right screen.
- Two button handlers → POST `deal_activate` / `deal_redeem`, transition state.
- Toast/status helpers (copied from `src/app.js` pattern).

- [ ] **Step 1: Write the full JS**

Replace the empty `niv-cafe/deal/app.js` with:

```javascript
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
var BACKEND_URL = "";   // <-- paste the same URL you put in src/app.js

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
```

- [ ] **Step 2: Paste in the BACKEND_URL from Task 3**

Open `niv-cafe/deal/app.js` again. Find the line:

```javascript
var BACKEND_URL = "";   // <-- paste the same URL you put in src/app.js
```

Replace `""` with the URL you deployed in Task 3 (same as in `src/app.js`).

- [ ] **Step 3: Browser smoke test — activate path**

```bash
cd /Users/danielhadar/claude/niv-cafe && python3 -m http.server 8000 &
sleep 1
open "http://localhost:8000/deal/"
```

Expected:
1. Page loads on the activate screen (no console errors).
2. URL bar now shows `#s=...` (16 chars) — confirms session was minted.
3. Type `0000` in the PIN field → "הפעלה" button enables.
4. Click "הפעלה" → status message "קוד שגוי. נסיונות שנותרו: 4". Field clears, focus returns.
5. Type `1234` → click → screen transitions to the deals screen with both deal cards visible + a Niv-PIN field.
6. Type `5678` → click "מימוש" → screen transitions to the green confetti overlay with "נוצל ✓" + the deal titles + the local-time stamp.
7. Refresh the page (same URL). Expect: status round-trip returns `redeemed: true` with the original `redeemed_at`, page shows the celebration screen with the same timestamp as the original redemption.

Open the spreadsheet in the browser and confirm:
- `deal_sessions` has one row with your session_id, activated_at, redeemed_at, `failed_pin_count = 1`, `locked = FALSE`.
- `events` has new rows: one `deal_activate` and one `deal_redeem` with the first 6 chars of your session_id.

Stop the server:
```bash
kill %1 2>/dev/null
```

- [ ] **Step 4: Browser smoke test — lockout path**

Open a NEW incognito window to start a fresh session:

```bash
cd /Users/danielhadar/claude/niv-cafe && python3 -m http.server 8000 &
sleep 1
open -na "Google Chrome" --args --incognito "http://localhost:8000/deal/"
```

Type `0000` five times. After the 5th wrong attempt, expect:
- The page transitions to the error screen with text "הסשן נחסם לאחר ניסיונות שגויים..."
- `deal_sessions` shows `locked = TRUE` for this session
- `events` has a `deal_lock` row

Stop the server:
```bash
kill %1 2>/dev/null
```

- [ ] **Step 5: Commit**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add deal/app.js
git commit -m "deal: implement session id + state machine + backend calls"
```

---

## Task 7: Build `deal-qr.html` (printable poster pointing at /deal/)

**Files:**
- Modify (rewrite from empty): `niv-cafe/deal-qr.html`

This is a clone of the existing `qr-code.html`, with:
- Different title and subtitle copy
- Different `text:` field passed to the QRCode constructor

- [ ] **Step 1: Diff source — open `qr-code.html` to mirror its structure**

```bash
cat /Users/danielhadar/claude/niv-cafe/qr-code.html
```

- [ ] **Step 2: Write the new file**

Replace the empty `niv-cafe/deal-qr.html` with the following. This is a near-copy of `qr-code.html`; the only differences are the `<title>`, the visible `qr-title` / `qr-subtitle` text, and the URL passed to `QRCode`.

```html
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ניב קפה מעדניה — קוד הטבה</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Alef:wght@400;700&display=swap" rel="stylesheet">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
  <style>
    :root {
      --green: #3F5C38;
      --cream: #F4EBD2;
      --coral: #EA9580;
      --font: 'Alef', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--font);
      font-weight: 700;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: var(--cream);
      padding: 24px 16px;
    }

    .qr-card {
      background: #FFFFFF;
      border-radius: 24px;
      box-shadow: 0 6px 32px rgba(63, 92, 56, 0.16);
      padding: 36px 32px 40px;
      text-align: center;
      max-width: 360px;
      width: 100%;
      position: relative;
    }

    .qr-card::before {
      content: "";
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 56px;
      height: 4px;
      border-radius: 0 0 4px 4px;
      background: var(--coral);
    }

    .brand-logo {
      display: block;
      width: 80%;
      max-width: 240px;
      height: auto;
      margin: 8px auto 14px;
    }

    .divider {
      width: 64px;
      height: 1px;
      background: var(--coral);
      opacity: 0.7;
      margin: 22px auto 24px;
    }

    .qr-title {
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--green);
      margin-bottom: 4px;
    }

    .qr-subtitle {
      font-size: 0.92rem;
      font-weight: 400;
      color: var(--green);
      opacity: 0.75;
      margin-bottom: 24px;
    }

    #qr-container {
      display: flex;
      justify-content: center;
      padding: 12px;
      background: #FFFFFF;
      border-radius: 14px;
      border: 1px solid rgba(63, 92, 56, 0.15);
      width: fit-content;
      margin: 0 auto;
    }

    #qr-container canvas,
    #qr-container img {
      display: block;
      border-radius: 8px;
    }

    @media print {
      body {
        background: #FFFFFF;
        min-height: auto;
        padding: 0;
      }
      .qr-card {
        box-shadow: none;
        border: 1.5px solid var(--green);
        max-width: none;
        width: 10cm;
        padding: 1.4cm 1.2cm 1.5cm;
        border-radius: 12px;
      }
      .qr-card::before {
        background: var(--coral) !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .divider {
        background: var(--coral) !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>

  <div class="qr-card">
    <img src="assets/logo.png?v=15" alt="ניב קפה מעדניה" class="brand-logo">

    <div class="divider"></div>

    <p class="qr-title">קוד הטבה</p>
    <p class="qr-subtitle">סרקו כאן לקבלת הטבה בניב</p>

    <div id="qr-container"></div>
  </div>

  <script>
    new QRCode(document.getElementById("qr-container"), {
      text: "https://TODO-niv-domain.example.com/deal/",
      width: 220,
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  </script>

</body>
</html>
```

- [ ] **Step 3: Verify in the browser**

```bash
cd /Users/danielhadar/claude/niv-cafe && python3 -m http.server 8000 &
sleep 1
open "http://localhost:8000/deal-qr.html"
```

Expected: a printable card identical in layout to `qr-code.html`, with the logo, divider, "קוד הטבה" title, "סרקו כאן לקבלת הטבה בניב" subtitle, and a QR code in the center. Scanning the QR (e.g. with the iOS camera app on the printout) should currently take the visitor to the placeholder `TODO-niv-domain.example.com/deal/` URL — that's expected until the real domain is wired up.

Stop the server:
```bash
kill %1 2>/dev/null
```

- [ ] **Step 4: Commit**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add deal-qr.html
git commit -m "deal: printable QR poster (deal-qr.html)"
```

---

## Task 8: Extend `setupReport` with deal metrics

**Files:**
- Modify: `niv-cafe/backend/Code.gs` (the `setupReport()` function near the bottom)

Add a new section to the report sheet showing deal activations, redemptions, locks, and the derived redemption rate.

- [ ] **Step 1: Edit `setupReport` to insert new rows before the `DERIVED` block**

Open `niv-cafe/backend/Code.gs`. Find the `rows` array inside `setupReport()` (around line 309 onward). Find the line:

```javascript
    ['', ''],                                                                        // 29
    ['DERIVED', ''],                                                                 // 30
    ['Coffee completion %',   '=IFERROR(B17*10/B12,0)'],                             // 31
    ['Pizza completion %',    '=IFERROR(B18*10/B13,0)'],                             // 32
    ['Sandwich completion %', '=IFERROR(B19*10/B14,0)'],                             // 33
    ['Total codes ever',      '=COUNTA(codes!A:A)-1']                                // 34
  ];
```

Replace with (inserts a new `DEAL` section before `DERIVED`, and renumbers the derived rows):

```javascript
    ['', ''],                                                                        // 29
    ['DEAL', ''],                                                                    // 30
    ['Activations', '=COUNTIFS(events!B:B,"deal_activate",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 31
    ['Redemptions', '=COUNTIFS(events!B:B,"deal_redeem",  events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 32
    ['Locks',       '=COUNTIFS(events!B:B,"deal_lock",    events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 33
    ['', ''],                                                                        // 34
    ['DERIVED', ''],                                                                 // 35
    ['Coffee completion %',   '=IFERROR(B17*10/B12,0)'],                             // 36
    ['Pizza completion %',    '=IFERROR(B18*10/B13,0)'],                             // 37
    ['Sandwich completion %', '=IFERROR(B19*10/B14,0)'],                             // 38
    ['Redemption rate %',     '=IFERROR(B32/B31,0)'],                                // 39
    ['Total codes ever',      '=COUNTA(codes!A:A)-1'],                               // 40
    ['Total deal sessions ever', '=COUNTA(deal_sessions!A:A)-1']                     // 41
  ];
```

- [ ] **Step 2: Update the bold-header rows and number formatting**

Find:
```javascript
  var headerRows = [1, 7, 11, 16, 21, 27, 30];
```

Replace with (adds row 30 for `DEAL`, shifts `DERIVED` from 30→35):
```javascript
  var headerRows = [1, 7, 11, 16, 21, 27, 30, 35];
```

Find:
```javascript
  sheet.getRange('B31:B33').setNumberFormat('0%');
```

Replace with (the completion-% rows are now 36-38, plus the new redemption-rate at 39):
```javascript
  sheet.getRange('B36:B39').setNumberFormat('0%');
```

- [ ] **Step 3: Re-run `setupReport` from the Apps Script editor**

Open the deployed Apps Script project. In the function dropdown, select `setupReport`. Click `Run`. Open the spreadsheet and confirm the `report` sheet now has:

- A `DEAL` section (header bold, around row 30) with Activations / Redemptions / Locks rows pointing at events!B:B
- A `Redemption rate %` row in the DERIVED section (% format)
- A `Total deal sessions ever` row

- [ ] **Step 4: Commit**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add backend/Code.gs
git commit -m "backend: extend setupReport with deal activations/redemptions/locks"
```

---

## Task 9: Manual verification matrix (full-flow tests before ship)

**Files:** none modified

Run the full set of acceptance tests defined in the spec. This is the gate before shipping.

- [ ] **Step 1: Start the local server**

```bash
cd /Users/danielhadar/claude/niv-cafe && python3 -m http.server 8000 &
sleep 1
```

- [ ] **Step 2: Happy path**

1. Open `http://localhost:8000/deal/` in a fresh incognito window.
2. Confirm URL hash now has `#s=<16-char-id>`.
3. Type `0000`, click "הפעלה" → expect "קוד שגוי. נסיונות שנותרו: 4".
4. Type `0000`, click → "נסיונות שנותרו: 3".
5. Type `1234`, click → page transitions to deals screen.
6. Type `0000`, click "מימוש" → "קוד שגוי. נסיונות שנותרו: 4" (note: same counter is used for both gates; this is fine).
7. Type `5678`, click → page transitions to the green confetti screen with "נוצל ✓".

- [ ] **Step 3: Refresh / replay**

8. Refresh the page (cmd+R) without changing the URL → page should re-land directly on the "נוצל ✓" screen (server says redeemed=true).

- [ ] **Step 4: Lockout (fresh session)**

9. Open a NEW incognito window at `http://localhost:8000/deal/`.
10. Type `0000` and click 5 times. After the 5th, expect transition to the error screen with the "הסשן נחסם" message.
11. Verify in the spreadsheet: the new session_id has `locked = TRUE`. The events sheet has a `deal_lock` row.

- [ ] **Step 5: Expiry (manual sheet edit)**

12. In a NEW incognito window, complete activation only (correct store PIN, do NOT redeem). Note the session_id from the URL hash.
13. Open the spreadsheet, find the row for that session_id in `deal_sessions`, and edit `activated_at` to a date in the past (e.g. yesterday's date at noon). Save.
14. Refresh the browser page. Expect transition to the error screen with the "ההטבה פגה" message.

- [ ] **Step 6: Wrong-session-id fraud test (impossible path)**

15. In a NEW incognito window at `http://localhost:8000/deal/`. Manually edit the URL hash to `#s=ZZZZZZZZZZZZZZZZ` (16 Zs — invalid per the alphabet) and reload. Expect: server returns `bad_request`, page shows activate screen (the catch falls through to "not activated").
16. Edit to `#s=AAAAAAAAAAAAAAAA` (valid alphabet, but no row exists). Reload. Expect: activate screen (server returns `activated: false`).
17. Try `1234` → server creates the row and activates. Confirm a brand-new row appears in `deal_sessions`. The cheat doesn't reveal anything because you still need both PINs.

- [ ] **Step 7: Network-failure idempotency**

18. In a fresh incognito window, scan / open the deal page. Activate with `1234`.
19. Open DevTools → Network → set throttling to "Offline".
20. Type `5678`, click "מימוש". Expect a "אין חיבור לרשת" toast.
21. Set throttling back to "Online". Click "מימוש" again. Expect: success → done screen. No double-stamp in the events sheet (only ONE `deal_redeem` event for this session).

- [ ] **Step 8: Stop the server**

```bash
kill %1 2>/dev/null
```

- [ ] **Step 9: Report**

Tell the user: "All 7 verification scenarios pass: happy path, refresh/replay, lockout, expiry, fraud-resistance, network idempotency. Ready to ship."

If any scenario fails, do NOT proceed to Task 10. File a bug, fix it, re-run the matrix.

---

## Task 10: Cache-bust, ship, and verify the live site

**Files:**
- Modify: `niv-cafe/index.html`, `niv-cafe/deal/index.html`, `niv-cafe/qr-code.html`, `niv-cafe/deal-qr.html` — bump every `?v=15` to `?v=16` in lockstep

Per the project's shipit convention (`.claude/commands/shipit.md`), any commit that touches a query-versioned asset MUST bump the version on all HTML references.

- [ ] **Step 1: Find all `?v=` references**

```bash
cd /Users/danielhadar/claude/niv-cafe && grep -rn '?v=' *.html deal/*.html 2>/dev/null
```

Expected: many references in `index.html`, `qr-code.html`, `deal/index.html`, `deal-qr.html` all at `?v=15`.

- [ ] **Step 2: Bump every `?v=15` to `?v=16`**

```bash
cd /Users/danielhadar/claude/niv-cafe
# Bump in every HTML file that contains the pattern
for f in index.html qr-code.html deal/index.html deal-qr.html; do
  sed -i.bak 's/?v=15/?v=16/g' "$f" && rm "${f}.bak"
done
```

- [ ] **Step 3: Verify no `?v=15` references remain**

```bash
cd /Users/danielhadar/claude/niv-cafe && grep -rn '?v=15' *.html deal/*.html 2>/dev/null
```

Expected: no output (zero matches).

- [ ] **Step 4: Re-confirm app still works locally**

```bash
cd /Users/danielhadar/claude/niv-cafe && python3 -m http.server 8000 &
sleep 1
open "http://localhost:8000/deal/"
```

Expected: same behavior as Task 6 step 3 — page loads, can activate, redeem, see confetti. (The version bump is just a cache-bust string; no behavior changes.)

Stop the server:
```bash
kill %1 2>/dev/null
```

- [ ] **Step 5: Commit the version bump**

```bash
cd /Users/danielhadar/claude/niv-cafe
git add index.html qr-code.html deal/index.html deal-qr.html
git commit -m "cache-bust: bump asset versions to v=16 for /deal/ launch"
```

- [ ] **Step 6: Ship**

The /shipit slash command in `.claude/commands/shipit.md` codifies the push + verify ritual. If you're driving manually:

```bash
cd /Users/danielhadar/claude/niv-cafe
git push origin main
```

(The repo doesn't have a remote configured yet — the user will need to create a GitHub repo and `git remote add origin ...` before this works. Flag this to the user if remote is missing.)

- [ ] **Step 7: Verify the live site**

Once a real domain is wired up (per the spec's TODO items in `CNAME` and `deal-qr.html`), the standard probe:

```bash
curl -sI https://<niv-domain>/deal/ -o /dev/null -w "%{http_code}\n"
```

Expected: `200`.

Until the domain is configured, this task is complete when the local server matches expectations and the commits are pushed.

---

## Self-review notes (for the planner)

**Spec coverage check:**

| Spec section | Implemented in |
|---|---|
| §Summary, §Goals, §Non-goals | Whole plan |
| §User flows (customer/cashier/Niv) | Task 6 (state machine), Task 9 (verification matrix) |
| §Threat model | Tasks 2, 6 (single-use server-side, rate-limit, URL bar mitigation as accepted residual) |
| §Components (deal/index.html, app.js, style.css, deal-qr.html, Code.gs) | Tasks 4, 5, 6, 7, 2 |
| §Data model (deal_sessions sheet) | Task 2 step 2 (sheet accessor) |
| §API (deal_activate, deal_redeem, deal_status) | Task 2 steps 6-7 |
| §Expiry computation | Task 2 step 3 |
| §Client state machine | Task 6 step 1 |
| §Edge cases (refresh, network drop, multi-tab, TZ) | Task 6 step 3 (refresh), Task 9 steps 3 & 7 (replay + idempotency) |
| §Observability (events sheet + new types) | Task 2 step 5, Task 8 (report sheet rows) |
| §Accessibility (Negishut, RTL, numeric inputs) | Task 4 step 1 (HTML), Task 5 (CSS) |
| §Testing (manual matrix) | Task 9 |
| §Configuration constants | Tasks 2 step 1 (Code.gs side), 6 step 1 (deal/app.js side), 3 step 5 (BACKEND_URL) |
| §Confetti reuse | Task 4 step 1 (markup reuses `.celebration-overlay` + 30 `.confetti` children), Task 6 step 1 (show("done") flips `.visible` to trigger CSS animation) |

No gaps.

**Type/name consistency check:**

- `session_id` (snake_case in JSON and Apps Script; `sessionId` in JS variables) — consistent across all tasks.
- `STORE_PIN` / `NIV_PIN` / `DEAL_EXPIRY` / `DAY_CUTOFF_HOUR` — same identifiers on both sides (Task 2 step 1, Task 6 step 1).
- `DEAL_SESSIONS_HEADER` column order matches `readDealSession_` / `writeDealSession_` indices.
- Error strings (`locked`, `wrong_pin`, `expired`, `already_redeemed`, `not_activated`, `bad_request`) match between Apps Script returns and `deal/app.js` switch cases.

**Placeholder scan:** no TBD / TODO / "implement later" / "similar to" / "appropriate error handling" inside step contents. The two `TODO-niv-*` markers (in `CNAME` and `deal-qr.html`) are intentional from the earlier fork — not plan placeholders.
