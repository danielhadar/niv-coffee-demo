# מבצע שש (deal-6 prepaid pack) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second "מבצע שש!" tab to the punch-card app — a prepaid 6-pack (225₪ instead of 247.5₪) that Niv activates with the staff code, then punches down like a normal card, resetting when finished.

**Architecture:** Extend the existing `TABS` mechanism with a `type` field (`"punch"` vs `"pack"`). The pack tab has three sub-states driven by `{active, punches}`: pre-purchase (explainer + activate CTA), active (green-check + persistent 6-char code + the normal punch card), and done (celebration → reset to pre-purchase). State is localStorage + backend-synced; the backend diffs `pack6_*` columns to log `deal6_purchase`/`deal6_punch`/`deal6_complete` events (the report endpoint + dashboard already read these). No new endpoints; approval is the client-side staff code 2552.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step, no test runner). Google Apps Script backend (`backend/Code.gs`). Verification is `node --check`, browser checks (`open index.html` + hard refresh), and live `curl` probes after deploy.

**Spec:** `docs/superpowers/specs/2026-05-31-deal6-prepaid-pack-design.md`

**Conventions for this repo:**
- No automated tests — each task ends with a `node --check` syntax gate and/or a browser check, then a commit.
- `node --check` can't read `.gs`; copy to a temp `.js` first: `cp backend/Code.gs /tmp/Code.js && node --check /tmp/Code.js`.
- The state blob exchanged with the backend is `{ bundle: {punches}, pack6: {active, punches} }`.
- Do NOT bump `?v=` per task — bump once at ship time (Task 7).

---

### Task 1: Backend — `pack6` schema + event diffing

**Files:**
- Modify: `backend/Code.gs`

- [ ] **Step 1: Add the two pack columns to the codes header + update the docstring**

In `backend/Code.gs`, change the `CODES_HEADER` definition:

```javascript
var CODES_HEADER  = ['code'].concat(TAB_KEYS).concat(['pack6_active', 'pack6_punches', 'updated_at']);
```

And update the codes-sheet line in the top docstring:

```
 *   "codes" sheet (current punch state per code):
 *     A: code | B: bundle | C: pack6_active | D: pack6_punches | E: updated_at
 *     (bundle = כריך+קפה punches; pack6_* = the prepaid 6-pack מבצע שש. Legacy
 *      per-tab columns, if present, are left orphaned — the header self-heals.)
```

- [ ] **Step 2: Carry `pack6` in `rowToState_`**

Replace `rowToState_` with:

```javascript
function rowToState_(values) {
  var state = {};
  for (var i = 0; i < TAB_KEYS.length; i++) {
    var col = CODES_HEADER.indexOf(TAB_KEYS[i]);
    state[TAB_KEYS[i]] = { punches: toInt_(values[col]) };
  }
  var aCol = CODES_HEADER.indexOf('pack6_active');
  var pCol = CODES_HEADER.indexOf('pack6_punches');
  state.pack6 = {
    active:  values[aCol] === true || values[aCol] === 'TRUE' || values[aCol] === 'true',
    punches: toInt_(values[pCol])
  };
  return state;
}
```

- [ ] **Step 3: Write `pack6` in `stateToCodeRow_`**

In `stateToCodeRow_`, immediately before `return row;`, insert:

```javascript
  var pack6 = state.pack6 || {};
  row[CODES_HEADER.indexOf('pack6_active')]  = pack6.active ? true : false;
  row[CODES_HEADER.indexOf('pack6_punches')] = toInt_(pack6.punches);
```

- [ ] **Step 4: Add `readPack6_`, `pack6FromState_`, and `logPack6Events_`**

Add these three helpers (e.g. right after `punchesFromState_`):

```javascript
function readPack6_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, CODES_HEADER.length).getValues()[0];
  var aCol = CODES_HEADER.indexOf('pack6_active');
  var pCol = CODES_HEADER.indexOf('pack6_punches');
  return {
    active:  values[aCol] === true || values[aCol] === 'TRUE' || values[aCol] === 'true',
    punches: toInt_(values[pCol])
  };
}

function pack6FromState_(state) {
  var p = (state && state.pack6) ? state.pack6 : {};
  return { active: p.active ? true : false, punches: toInt_(p.punches) };
}

// Diff old → new pack state and log events. active false→true ⇒ purchase;
// punch increments ⇒ one deal6_punch each; reaching 6 (was <6) ⇒ complete.
function logPack6Events_(oldPack, newPack, now) {
  var rows = [];
  if (!oldPack.active && newPack.active) {
    rows.push([now, 'deal6_purchase', '']);
  }
  if (newPack.punches > oldPack.punches) {
    var delta = newPack.punches - oldPack.punches;
    for (var j = 0; j < delta; j++) rows.push([now, 'deal6_punch', '']);
  }
  if (newPack.punches >= 6 && oldPack.punches < 6) {
    rows.push([now, 'deal6_complete', '']);
  }
  if (rows.length === 0) return;
  var sheet = getEventsSheet_();
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, EVENTS_HEADER.length).setValues(rows);
}
```

- [ ] **Step 5: Call the pack diff from `handleSet_`**

Replace `handleSet_` with:

```javascript
function handleSet_(body, now) {
  if (!body.code || !CODE_REGEX.test(body.code) || !body.state) {
    return json_({ ok: false, error: 'bad_request' });
  }
  var sheet = getCodesSheet_();
  var row = findCodeRow_(sheet, body.code);
  var oldPunches = (row === -1) ? {} : readCodePunches_(sheet, row);
  var oldPack    = (row === -1) ? { active: false, punches: 0 } : readPack6_(sheet, row);
  var newPunches = punchesFromState_(body.state);
  var newPack    = pack6FromState_(body.state);
  var rowData = stateToCodeRow_(body.code, body.state, now);
  if (row === -1) {
    sheet.appendRow(rowData);
  } else {
    sheet.getRange(row, 1, 1, CODES_HEADER.length).setValues([rowData]);
  }
  logPunchAndFreebieEvents_(oldPunches, newPunches, now);
  logPack6Events_(oldPack, newPack, now);
  return json_({ ok: true });
}
```

- [ ] **Step 6: Syntax-check**

Run: `cp ~/claude/niv-cafe/backend/Code.gs /tmp/Code.js && node --check /tmp/Code.js && echo OK`
Expected: `OK`

- [ ] **Step 7: Commit**

```bash
cd ~/claude/niv-cafe
git add backend/Code.gs
git commit -m "backend: track pack6 (prepaid 6-pack) state + deal6 event diffing"
```

---

### Task 2: Client — `TABS` config, tab `type`, and pack state load/save/restore

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Add `type` to the bundle tab and add the pack tab**

Replace the `TABS` array:

```javascript
var TABS = [
  { key: "bundle", type: "punch", label: "כריך + קפה", emoji: "☕🥪", code: "2552", total: 6, storageKey: "niv_punch_bundle", celebrate: "מגיע לכם כריך + קפה בחצי מחיר ☕🥪" },
  { key: "pack6",  type: "pack",  label: "מבצע שש!",   emoji: "🎟️", code: "2552", total: 6, storageKey: "niv_pack6", celebrate: "החבילה הסתיימה, תודה! 🎉", priceNew: "225 ₪", priceOld: "247.5 ₪", saving: "חיסכון של 22.5 ₪" }
];
```

- [ ] **Step 2: Make `loadStateFor` carry `active` for pack tabs**

Replace `loadStateFor` with:

```javascript
function loadStateFor(tab) {
  var isPack = tab.type === "pack";
  function withActive(state) {
    if (isPack) state.active = state.active === true;
    else delete state.active;
    return state;
  }

  var defaults = withActive({ active: false, punches: 0, shapeIndices: generateShapeIndices(tab.total) });
  var raw;

  try {
    raw = localStorage.getItem(tab.storageKey);
  } catch (e) {
    return defaults;
  }
  if (raw === null) return defaults;

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return defaults;
  }

  var punches = parsed.punches;
  if (typeof punches !== "number" || !Number.isInteger(punches) || punches < 0 || punches > tab.total) {
    return defaults;
  }
  var active = parsed.active === true;

  var indices = parsed.shapeIndices;
  if (!Array.isArray(indices) || indices.length !== tab.total) {
    return withActive({ active: active, punches: punches, shapeIndices: generateShapeIndices(tab.total) });
  }
  var seen = {};
  for (var i = 0; i < indices.length; i++) {
    var idx = indices[i];
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= SHAPE_DEFS.length || seen[idx]) {
      return withActive({ active: active, punches: punches, shapeIndices: generateShapeIndices(tab.total) });
    }
    seen[idx] = true;
  }

  return withActive({ active: active, punches: punches, shapeIndices: indices.slice() });
}
```

- [ ] **Step 3: Include `pack6` (with `active`) in the backend state blob**

Replace `backendStateBlob` with:

```javascript
// Backend sees punch counts; pack tabs also send their active flag. Shape
// arrangement is local presentation and is not synced.
function backendStateBlob() {
  var s = {};
  for (var i = 0; i < TABS.length; i++) {
    var t = TABS[i];
    var st = states[t.key];
    if (t.type === "pack") {
      s[t.key] = { punches: st.punches, active: st.active === true };
    } else {
      s[t.key] = { punches: st.punches };
    }
  }
  return s;
}
```

- [ ] **Step 4: Restore `active` for pack tabs in `applyRestoredCode`**

In `applyRestoredCode`, replace the `for` loop body that rebuilds each tab's state with:

```javascript
  for (var i = 0; i < TABS.length; i++) {
    var tab = TABS[i];
    var backendTab = state[tab.key];
    var valid = isValidBackendTab(backendTab, tab);
    var punches = valid ? backendTab.punches : 0;
    var fresh;
    if (tab.type === "pack") {
      var active = valid ? (backendTab.active === true) : false;
      fresh = { active: active, punches: punches, shapeIndices: generateShapeIndices(tab.total) };
    } else {
      fresh = { punches: punches, shapeIndices: generateShapeIndices(tab.total) };
    }
    states[tab.key] = fresh;
    try { localStorage.setItem(tab.storageKey, JSON.stringify(fresh)); } catch (e) {}
  }
```

- [ ] **Step 5: Syntax-check**

Run: `node --check ~/claude/niv-cafe/src/app.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Browser sanity check**

Run: `open ~/claude/niv-cafe/index.html`
Hard-refresh (Cmd+Shift+R). Expected: two tabs appear — "כריך + קפה" and "מבצע שש!". Clicking the second tab does not error (it'll show the normal card for now — wired in Task 4). Check the console for no errors.

- [ ] **Step 7: Commit**

```bash
cd ~/claude/niv-cafe
git add src/app.js
git commit -m "punch: add pack tab to TABS; carry pack active state in load/sync/restore"
```

---

### Task 3: Client — pack-header markup + activation popup + styles

**Files:**
- Modify: `index.html`
- Modify: `src/style.css`

- [ ] **Step 1: Add the pack-header region to `index.html`**

In `index.html`, immediately AFTER the `<nav id="tabs-nav" ...></nav>` line and BEFORE `<section class="card">`, insert:

```html
    <!-- Pack (מבצע שש) header — shown only on the pack tab, content by sub-state -->
    <section id="pack-header" class="pack-header hidden">
      <!-- pre-purchase -->
      <div id="pack-pre" class="pack-pre hidden">
        <p class="pack-pitch">חבילת 6 × כריך + קפה</p>
        <p class="pack-price">
          <span class="pack-price-new" id="pack-price-new"></span>
          <span class="pack-price-old">במקום <s id="pack-price-old"></s></span>
        </p>
        <p class="pack-save" id="pack-save"></p>
        <button type="button" id="pack-activate-btn" class="punch-btn">הפעלת חבילה</button>
      </div>
      <!-- active -->
      <div id="pack-active" class="pack-active hidden">
        <p class="pack-status"><span class="pack-check" aria-hidden="true">✓</span> החבילה פעילה</p>
        <p class="pack-remaining" id="pack-remaining"></p>
        <div class="pack-code">
          <button type="button" class="icon-btn" id="pack-copy-btn" aria-label="העתקת הקוד"></button>
          <div class="pack-code-value" id="pack-code-value" dir="ltr"></div>
        </div>
      </div>
    </section>
```

- [ ] **Step 2: Add pack styles to `src/style.css`**

Append to `src/style.css`:

```css
/* ============================================================
   PACK (מבצע שש) — prepaid 6-pack header
   ============================================================ */
.pack-header {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-top: 16px;
}

.pack-pitch {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--brand);
  margin: 0 0 6px;
}

.pack-price {
  font-size: 1rem;
  color: var(--brand);
  margin: 0 0 4px;
}
.pack-price-new {
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--coral, #EA9580);
}
.pack-price-old { opacity: 0.6; margin-right: 6px; }
.pack-price-old s { text-decoration: line-through; }

.pack-save {
  font-size: 0.85rem;
  opacity: 0.6;
  color: var(--brand);
  margin: 0 0 16px;
}

#pack-activate-btn { max-width: 320px; }

.pack-status {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--brand);
  margin: 0 0 4px;
}
.pack-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 0.8rem;
  margin-left: 4px;
}
.pack-remaining {
  font-size: 0.95rem;
  opacity: 0.75;
  color: var(--brand);
  margin: 0 0 12px;
}
.pack-code {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  background: var(--white);
  border: 1.5px solid rgba(63, 92, 56, 0.18);
  border-radius: var(--radius);
  padding: 8px 14px;
  margin-bottom: 4px;
}
.pack-code-value {
  font-size: 1.3rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--brand);
}
```

Note: `--coral` may not be defined in `src/style.css` (it's defined in `deal/style.css`). The `var(--coral, #EA9580)` fallback covers that. If you prefer, add `--coral: #EA9580;` to the `:root` block in `src/style.css`.

- [ ] **Step 3: Browser sanity check**

Run: `open ~/claude/niv-cafe/index.html`
Hard-refresh. Expected: no layout break on the כריך+קפה tab (the pack header is `hidden`). No console errors.

- [ ] **Step 4: Commit**

```bash
cd ~/claude/niv-cafe
git add index.html src/style.css
git commit -m "pack: add מבצע שש header markup (pre/active states) + styles"
```

---

### Task 4: Client — pack rendering, tab switching, visibility

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Add DOM refs for the pack region**

In `src/app.js`, in the DOM REFERENCES block (after `var cardSvgEl = ...`), add:

```javascript
var packHeaderEl    = document.getElementById("pack-header");
var packPreEl       = document.getElementById("pack-pre");
var packActiveEl    = document.getElementById("pack-active");
var packRemainingEl = document.getElementById("pack-remaining");
var packCodeValueEl = document.getElementById("pack-code-value");
var packActivateBtn = document.getElementById("pack-activate-btn");
var packCopyBtn     = document.getElementById("pack-copy-btn");
var cardSectionEl     = document.querySelector(".card");
var quantitySectionEl = document.querySelector(".quantity-section");
var codeSectionEl     = document.querySelector(".code-section");
```

- [ ] **Step 2: Add `setPunchAreaVisible` and `renderPackTab`**

Add these functions (e.g. just before `function render()`):

```javascript
// Show/hide the punch card + stepper + code entry as a group.
function setPunchAreaVisible(visible) {
  cardSectionEl.classList.toggle("hidden", !visible);
  quantitySectionEl.classList.toggle("hidden", !visible);
  codeSectionEl.classList.toggle("hidden", !visible);
}

// Render the pack-tab chrome (header + which sub-state is shown) and toggle the
// punch area. For a punch tab: hide the pack header, always show the punch area.
function renderPackTab() {
  var tab = activeTab();
  if (tab.type !== "pack") {
    packHeaderEl.classList.add("hidden");
    setPunchAreaVisible(true);
    return;
  }
  var s = activeState();
  var active = s.active === true;

  packHeaderEl.classList.remove("hidden");
  packPreEl.classList.toggle("hidden", active);
  packActiveEl.classList.toggle("hidden", !active);
  setPunchAreaVisible(active);

  if (active) {
    packRemainingEl.textContent = "נותרו לך " + (tab.total - s.punches) + " מתוך " + tab.total;
    packCodeValueEl.textContent = userCode || "";
  }

  // Pre-purchase price strings (filled once; cheap to repeat).
  document.getElementById("pack-price-new").textContent = tab.priceNew || "";
  document.getElementById("pack-price-old").textContent = tab.priceOld || "";
  document.getElementById("pack-save").textContent = tab.saving || "";
}
```

- [ ] **Step 3: Call `renderPackTab` from `render`**

At the END of the `render()` function (just before its closing `}`), add:

```javascript
  renderPackTab();
```

- [ ] **Step 4: Set the pack-copy icon and wire the activate/copy buttons**

In `src/app.js`, in the EVENT HANDLERS area (near `accountBtnEl.addEventListener(...)`), add:

```javascript
if (packCopyBtn) {
  packCopyBtn.innerHTML = iconCopy();
  packCopyBtn.addEventListener("click", function () { handleCopyCode(this); });
}
if (packActivateBtn) {
  packActivateBtn.addEventListener("click", function () { openModal("pack-activate"); });
}
```

- [ ] **Step 5: Syntax-check + browser check**

Run: `node --check ~/claude/niv-cafe/src/app.js && echo OK`
Expected: `OK`

Run: `open ~/claude/niv-cafe/index.html` and hard-refresh. Click "מבצע שש!". Expected: the pre-purchase view shows ("חבילת 6 × כריך + קפה", **225 ₪** with ~~247.5 ₪~~, "חיסכון של 22.5 ₪", and a "הפעלת חבילה" button); the punch card/stepper/code entry are hidden. Switching back to "כריך + קפה" shows the normal card and hides the pack header. (The activate button opens an empty/placeholder modal until Task 5 — that's expected; cancel/Escape should close it via existing modal handling once Task 5 lands.)

- [ ] **Step 6: Commit**

```bash
cd ~/claude/niv-cafe
git add src/app.js
git commit -m "pack: render pre/active sub-states + toggle punch area by tab type"
```

---

### Task 5: Client — activation popup (enter 2552 → eligible)

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Add the `pack-activate` branch to `renderModal`**

In `renderModal`, add a new `else if` branch (after the `override-confirm` branch, before the function closes):

```javascript
  } else if (modalState === "pack-activate") {
    card.innerHTML =
      '<h2 id="modal-title" class="modal-title">הפעלת חבילה</h2>' +
      '<p class="modal-subtitle">הזינו את קוד הצוות כדי להפעיל את החבילה</p>' +
      '<input type="text" id="pack-activate-input" class="code-input-field" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="קוד">' +
      '<div id="pack-activate-status" class="modal-status"></div>' +
      '<button type="button" class="modal-primary-btn" id="pack-activate-submit">הפעלה</button>' +
      '<button type="button" class="modal-link-btn" id="pack-activate-cancel">ביטול</button>';
    var pInput  = document.getElementById("pack-activate-input");
    var pSubmit = document.getElementById("pack-activate-submit");
    var pStatus = document.getElementById("pack-activate-status");

    function submitActivate() {
      var entered = pInput.value.trim().toLowerCase();
      var correct = tabConfig("pack6").code.toLowerCase();
      if (entered === correct) {
        activatePack();
      } else {
        pStatus.textContent = "קוד לא נכון";
        pInput.value = "";
        pInput.focus();
      }
    }
    pInput.addEventListener("input", function () { pStatus.textContent = ""; });
    pInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && pInput.value.length > 0) { e.preventDefault(); submitActivate(); }
    });
    pSubmit.addEventListener("click", submitActivate);
    document.getElementById("pack-activate-cancel").addEventListener("click", closeModal);
    setTimeout(function () { pInput.focus(); }, 200);
  }
```

- [ ] **Step 2: Let Escape close the activate popup**

In `onModalKeydown`, change the final `else` so the activate modal closes on Escape. Replace the function body's branch logic with:

```javascript
function onModalKeydown(e) {
  if (e.key !== "Escape") return;
  if (modalState === "override-confirm") openModal("restore");
  else if (modalState === "restore") {
    if (userCode) openModal("my-card"); else closeModal();
  } else {
    closeModal();
  }
}
```

(This is unchanged behaviour except that `pack-activate` falls into the final `else` → `closeModal()`, which is what we want. If the file already matches this, leave it.)

- [ ] **Step 3: Add `activatePack`**

Add this function (e.g. near `applyRestoredCode`):

```javascript
// Grant a fresh prepaid pack on the pack tab: active=true, punches=0. Persists
// + syncs (the backend diff logs deal6_purchase), then re-renders to the
// active sub-state.
function activatePack() {
  var tab = tabConfig("pack6");
  var fresh = { active: true, punches: 0, shapeIndices: generateShapeIndices(tab.total) };
  states["pack6"] = fresh;
  try { localStorage.setItem(tab.storageKey, JSON.stringify(fresh)); } catch (e) {}
  syncToBackend();

  closeModal();

  // If the pack tab is the one on screen, refresh its card + chrome.
  if (activeTabKey === "pack6") {
    renderSVGSlots(fresh.shapeIndices);
    quantity = 1;
    render();
    updatePunchButtonState();
  }
  showToast("החבילה הופעלה :)");
}
```

- [ ] **Step 4: Syntax-check + browser check**

Run: `node --check ~/claude/niv-cafe/src/app.js && echo OK`
Expected: `OK`

Run: `open ~/claude/niv-cafe/index.html`, hard-refresh, go to "מבצע שש!", tap "הפעלת חבילה". Expected: popup with a code box. Entering a wrong code shows "קוד לא נכון"; entering **2552** closes the popup, shows the green-check "החבילה פעילה", "נותרו לך 6 מתוך 6", the 6-char code with a copy button (tap it → toast "הקוד הועתק"), and the 6-slot card + stepper + code entry appear.

- [ ] **Step 5: Commit**

```bash
cd ~/claude/niv-cafe
git add src/app.js
git commit -m "pack: activation popup — staff code 2552 grants a fresh pack"
```

---

### Task 6: Client — pack punching, reward-banner gating, completion reset

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Gate the reward banner to punch tabs only**

In `renderSVGSlots`, change the `isReward` line so the half-price banner only renders on punch tabs:

```javascript
    var isReward = (i === shapeIndices.length - 1) && (activeTab().type !== "pack");
```

(The rest of the badge block stays the same; when `isReward` is false, `badge` is `''` and the slot gets no `slot--reward` class.)

- [ ] **Step 2: Preserve `active` when saving punches in `handlePunch`**

In `handlePunch`, the two `saveActiveState({...})` calls build a new state object. Update both to preserve the pack `active` flag. Replace the completed-card save:

```javascript
    if (newPunches === tab.total) {
      var doneState = { punches: tab.total, shapeIndices: s.shapeIndices };
      if (tab.type === "pack") doneState.active = true;
      saveActiveState(doneState);

      animatePunches(oldPunches, awardedQuantity, function () {
        setTimeout(function () {
          showCelebration();
        }, 500);
      });
    } else {
      var midState = { punches: newPunches, shapeIndices: s.shapeIndices };
      if (tab.type === "pack") midState.active = true;
      saveActiveState(midState);

      animatePunches(oldPunches, awardedQuantity, function () {
        unlockUI();

        if (awardedQuantity === 1) {
          showToast("ניקוב נוסף בהצלחה");
        } else {
          showToast(awardedQuantity + " ניקובים נוספו בהצלחה");
        }
      });
    }
```

- [ ] **Step 3: Make `dismissCelebration` reset packs to pre-purchase**

In `dismissCelebration`, replace the block that builds and saves the new card state (the `var newIndices = ...; saveActiveState({ punches: 0, shapeIndices: newIndices });` section) with:

```javascript
    var tab = activeTab();
    var newIndices = generateShapeIndices(tab.total);
    if (tab.type === "pack") {
      // Pack consumed → back to pre-purchase (must re-activate to buy another).
      saveActiveState({ active: false, punches: 0, shapeIndices: newIndices });
    } else {
      saveActiveState({ punches: 0, shapeIndices: newIndices });
    }

    // Re-render SVG with new shapes
    renderSVGSlots(activeState().shapeIndices);

    quantity = 1;
    render();
    unlockUI();

    showToast(tab.type === "pack" ? "אפשר לרכוש חבילה חדשה :)" : "כרטיסיה חדשה :)");
```

- [ ] **Step 4: Syntax-check + full browser flow**

Run: `node --check ~/claude/niv-cafe/src/app.js && echo OK`
Expected: `OK`

Run: `open ~/claude/niv-cafe/index.html`, hard-refresh. Full pack flow:
1. "מבצע שש!" → "הפעלת חבילה" → enter **2552** → active.
2. The pack card shows **no** "חצי מחיר" banner on the 6th slot (that banner is punch-tab-only).
3. Enter **2552** in the code box, use +/- to punch. "נותרו לך X מתוך 6" decreases as you punch (after re-render).
4. Punch to 6 → celebration with "החבילה הסתיימה, תודה! 🎉" → dismiss → tab returns to the **pre-purchase** state (activate button again).
5. Switch to "כריך + קפה" → its 6th slot still shows the "חצי מחיר" banner. ✓

- [ ] **Step 5: Commit**

```bash
cd ~/claude/niv-cafe
git add src/app.js
git commit -m "pack: punch flow + completion reset; keep half-price banner punch-only"
```

---

### Task 7: Ship — cache-bump, push, redeploy backend, verify live

**Files:**
- Modify: `index.html`, `qr-code.html`, `deal/index.html`, `deal/deal-qr.html` (version bump only)

- [ ] **Step 1: Bump the cache version in lockstep**

Run:

```bash
cd ~/claude/niv-cafe
grep -rl '?v=20' *.html deal/*.html dashboard/*.html | xargs sed -i '' 's/?v=20/?v=21/g'
grep -rho '?v=[0-9a-f]*' *.html deal/*.html dashboard/*.html | sort | uniq -c
```
Expected: all app-asset refs now show `?v=21` (negishut stays `?v=8593dd0b`). Zero `?v=20` stragglers.

- [ ] **Step 2: Commit + push**

```bash
cd ~/claude/niv-cafe
git add -A
git commit -m "pack: ship מבצע שש prepaid 6-pack; bump assets v=21"
git push origin main
```

- [ ] **Step 3: Redeploy the Apps Script backend (MANUAL)**

`backend/Code.gs` does NOT deploy via git. In the Apps Script editor bound to the Niv punch-card spreadsheet:
1. Paste the full current `backend/Code.gs` over the existing `Code.gs`.
2. Deploy → Manage deployments → edit active deployment → Version: New version → Deploy (same `/exec` URL).
3. (Optional) Run `setupReport` to refresh the spreadsheet dashboard.

- [ ] **Step 4: Verify live (Pages + backend)**

Wait for the Pages build, then run:

```bash
B="https://niv-coffee.danielhadar.com"
gh api repos/danielhadar/niv-coffee/pages/builds/latest --jq '.status'   # expect: built
curl -sI "$B/" -o /dev/null -w "punch %{http_code}\n"                     # 200
curl -s "$B/src/app.js?v=21" | grep -o 'type: "pack"' | head -1           # type: "pack"
U="https://script.google.com/macros/s/AKfycbyM_7knxRp1RHZjJLliqVvNd21HgAfDXSdgIYyibqYJBaZ0iWAfvta8qY556DZizdeI8w/exec"
curl -sL "$U?action=report&from=2026-01-01&to=2026-12-31" | grep -o '"deal6":{[^}]*}'   # deal6 counts present
```

- [ ] **Step 5: End-to-end on the live site**

On `https://niv-coffee.danielhadar.com` (phone or browser): activate a pack (2552), punch it to 6, finish it. Then open `https://niv-coffee.danielhadar.com/dashboard/` (code 2552) and confirm the **מבצע שש** section shows Purchases ≥ 1, Punches ≥ 6, Completions ≥ 1 for a range covering today.

---

## Self-review notes

- **Spec coverage:** pre/active/done states (Tasks 4–6), 2552 activation (Task 5), reuse 6-char code (Task 4 `packCodeValueEl = userCode`), cyclic reset (Task 6), backend pack6 schema + diff events (Task 1), `pack6` carried in load/sync/restore (Task 2), banner punch-only + tab-aware dismiss (Task 6), analytics already wired (verified Task 7). Pricing strings (Task 3/4). All covered.
- **Type consistency:** state blob `{bundle:{punches}, pack6:{active,punches}}` used identically in `backendStateBlob` (Task 2), `pack6FromState_`/`rowToState_` (Task 1), and `applyRestoredCode` (Task 2). `activatePack`/pack state shape `{active,punches,shapeIndices}` consistent across Tasks 2/4/5/6.
- **Note on `isValidBackendTab`:** it validates `punches` only; `active` is read defensively (`=== true`) in restore, so no change needed there.
