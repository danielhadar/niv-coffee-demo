// ============================================================
// CONFIGURATION — Change these values to customize the app
// ============================================================

// Per-tab config. Tab order = display order (RTL: rightmost first).
// To change a code or goal, edit it here. Each tab has its own state and storage.
var TABS = [
  { key: "coffee",   label: "☕ קפה",  code: "2552", total: 10, storageKey: "niv_punch_coffee",   celebrate: "הקפה הזה על חשבוננו :)" },
  { key: "pizza",    label: "🍕 פיצה", code: "2552", total: 10, storageKey: "niv_punch_pizza",    celebrate: "הפיצה הזאת על חשבוננו :)" },
  { key: "sandwich", label: "🥪 כריך", code: "2552", total: 10, storageKey: "niv_punch_sandwich", celebrate: "הכריך הזה על חשבוננו :)" }
];

// Change to "text" if any code contains letters. "numeric" opens the number pad on mobile.
var INPUT_MODE = "numeric";

// Minimum selectable punch quantity.
var MIN_QUANTITY = 1;

// Remembers which tab the user was viewing last.
var ACTIVE_TAB_STORAGE_KEY = "niv_active_tab";

// User code (identifies a customer across devices).
// Alphabet excludes 0/O and 1/I to avoid ambiguity when read aloud or written.
var USER_CODE_STORAGE_KEY = "niv_user_code";
var CODE_LENGTH = 6;
var CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

// Backend endpoint (Google Apps Script Web App URL). Empty = local-only mode:
// codes still work on this device, but restoring a code only finds what was
// stored locally under "niv_remote_<code>". Deploy backend/Code.gs to a new
// Google Sheet, then paste the /exec URL here to enable real cross-device sync.
var BACKEND_URL = "https://script.google.com/macros/s/AKfycbyM_7knxRp1RHZjJLliqVvNd21HgAfDXSdgIYyibqYJBaZ0iWAfvta8qY556DZizdeI8w/exec";

// ============================================================
// SHAPE DEFINITIONS — 16 geometric shapes inspired by the brand
// Each shape is defined relative to center (0,0) within ~34x34 box.
// Parts can be 'circle' or 'path' SVG elements.
// ============================================================

var SHAPE_DEFS = [
  // 0: Full Circle
  { parts: [{ elem: "circle", r: 17 }] },

  // 1: Quarter Circle (center at bottom-left, fills upper-right)
  { parts: [{ elem: "path", d: "M-17,17 L-17,-17 A34,34,0,0,1,17,17 Z" }] },

  // 2: Shield (flat top, rounded bottom)
  { parts: [{ elem: "path", d: "M-16,-17 L16,-17 L16,0 A16,17,0,0,1,-16,0 Z" }] },

  // 3: Crescent (C-shape, opening right)
  { parts: [{ elem: "path", d: "M13.9,-9.8 A17,17,0,1,0,13.9,9.8 A12,12,0,0,1,13.9,-9.8 Z" }] },

  // 4: Notched Circle (3/4 circle, bottom-right removed)
  { parts: [{ elem: "path", d: "M0,0 L0,17 A17,17,0,1,0,17,0 Z" }] },

  // 5: Four-Petal Clover (4 overlapping circles in 2x2)
  { parts: [
    { elem: "circle", cx: -7, cy: -7, r: 9.5 },
    { elem: "circle", cx: 7, cy: -7, r: 9.5 },
    { elem: "circle", cx: -7, cy: 7, r: 9.5 },
    { elem: "circle", cx: 7, cy: 7, r: 9.5 }
  ]},

  // 6: Pac-Man (mouth ~90deg facing right)
  { parts: [{ elem: "path", d: "M0,0 L12,12 A17,17,0,1,0,12,-12 Z" }] },

  // 7: Arch (thick inverted U with hollow center)
  { parts: [{ elem: "path", d: "M-17,3.5 L-17,-8.5 A17,17,0,0,1,17,-8.5 L17,3.5 L9,3.5 L9,-8.5 A9,9,0,0,0,-9,-8.5 L-9,3.5 Z" }] },

  // 8: Circle Cluster (5 circles in quincunx/dice-5 pattern)
  { parts: [
    { elem: "circle", cx: -9, cy: -9, r: 6.5 },
    { elem: "circle", cx: 9, cy: -9, r: 6.5 },
    { elem: "circle", cx: 0, cy: 0, r: 6.5 },
    { elem: "circle", cx: -9, cy: 9, r: 6.5 },
    { elem: "circle", cx: 9, cy: 9, r: 6.5 }
  ]},

  // 9: 8-pointed Star / Asterisk
  { parts: [{ elem: "path", d: "M0,-17 L3.1,-7.4 L12,-12 L7.4,-3.1 L17,0 L7.4,3.1 L12,12 L3.1,7.4 L0,17 L-3.1,7.4 L-12,12 L-7.4,3.1 L-17,0 L-7.4,-3.1 L-12,-12 L-3.1,-7.4 Z" }] },

  // 10: Circle Grid (4x4 small circles)
  { parts: [
    { elem: "circle", cx: -12, cy: -12, r: 3.2 },
    { elem: "circle", cx: -4, cy: -12, r: 3.2 },
    { elem: "circle", cx: 4, cy: -12, r: 3.2 },
    { elem: "circle", cx: 12, cy: -12, r: 3.2 },
    { elem: "circle", cx: -12, cy: -4, r: 3.2 },
    { elem: "circle", cx: -4, cy: -4, r: 3.2 },
    { elem: "circle", cx: 4, cy: -4, r: 3.2 },
    { elem: "circle", cx: 12, cy: -4, r: 3.2 },
    { elem: "circle", cx: -12, cy: 4, r: 3.2 },
    { elem: "circle", cx: -4, cy: 4, r: 3.2 },
    { elem: "circle", cx: 4, cy: 4, r: 3.2 },
    { elem: "circle", cx: 12, cy: 4, r: 3.2 },
    { elem: "circle", cx: -12, cy: 12, r: 3.2 },
    { elem: "circle", cx: -4, cy: 12, r: 3.2 },
    { elem: "circle", cx: 4, cy: 12, r: 3.2 },
    { elem: "circle", cx: 12, cy: 12, r: 3.2 }
  ]},

  // 11: Double Dome (small dome on top, large dome on bottom)
  { parts: [
    { elem: "path", d: "M-10,-2 A10,10,0,0,0,10,-2 Z" },
    { elem: "path", d: "M-17,12 A17,17,0,0,0,17,12 Z" }
  ]},

  // 12: Triple Dome (3 stacked semicircles, smallest on top)
  { parts: [
    { elem: "path", d: "M-5,-8 A5,5,0,0,0,5,-8 Z" },
    { elem: "path", d: "M-10,2 A10,10,0,0,0,10,2 Z" },
    { elem: "path", d: "M-16,13 A16,16,0,0,0,16,13 Z" }
  ]},

  // 13: Triangle Grid (8 right triangles in checkerboard pattern)
  { parts: [
    { elem: "path", d: "M-14,-14 L0,-14 L-14,0 Z" },
    { elem: "path", d: "M0,-14 L14,-14 L14,0 Z" },
    { elem: "path", d: "M0,0 L0,-14 L14,0 Z" },
    { elem: "path", d: "M-14,0 L0,0 L-14,14 Z" },
    { elem: "path", d: "M0,0 L14,0 L14,14 Z" },
    { elem: "path", d: "M0,0 L0,14 L-14,14 Z" },
    { elem: "path", d: "M0,14 L14,0 L14,14 Z" }
  ]},

  // 14: 5-Petal Flower (teardrop petals at 72deg intervals)
  { parts: [
    { elem: "path", d: "M0,1.5 C-5,-3.5 -5,-11.5 0,-14.5 C5,-11.5 5,-3.5 0,1.5 Z" },
    { elem: "path", d: "M0,1.5 C3.2,-4.8 10.8,-7.3 15.2,-3.4 C13.9,2.2 6.3,4.7 0,1.5 Z" },
    { elem: "path", d: "M0,1.5 C7.0,2.6 11.7,9.1 9.4,14.4 C3.6,15.0 -1.1,8.5 0,1.5 Z" },
    { elem: "path", d: "M0,1.5 C1.1,8.5 -3.6,15.0 -9.4,14.4 C-11.7,9.1 -7.0,2.6 0,1.5 Z" },
    { elem: "path", d: "M0,1.5 C-6.3,4.7 -13.9,2.2 -15.2,-3.4 C-10.8,-7.3 -3.2,-4.8 0,1.5 Z" }
  ]},

  // 15: Triple Chevron (3 wide leaf shapes fanning upward)
  { parts: [
    { elem: "path", d: "M0,14 C-3,6 -16,-2 -14,-12 C-10,-6 -2,4 0,14 Z" },
    { elem: "path", d: "M0,14 C-3,4 -3,-10 0,-14 C3,-10 3,4 0,14 Z" },
    { elem: "path", d: "M0,14 C3,6 16,-2 14,-12 C10,-6 2,4 0,14 Z" }
  ]}
];

// SVG viewBox is "0 0 300 130". Slot grid is centered inside it.
// 1 row when total ≤ 5, otherwise 2 rows; bottom row centers if uneven.
// For total > 10 you'll likely want to grow the viewBox height too.
function computeSlotPositions(total) {
  var viewW = 300, viewH = 130;
  var spacingX = 60, spacingY = 70;
  var rows = total <= 5 ? 1 : 2;
  var topCount = rows === 1 ? total : Math.ceil(total / 2);
  var bottomCount = total - topCount;
  var startY = (viewH - (rows - 1) * spacingY) / 2;

  var positions = [];
  function addRow(count, row) {
    var startX = (viewW - (count - 1) * spacingX) / 2;
    for (var c = 0; c < count; c++) {
      positions.push({ x: startX + c * spacingX, y: startY + row * spacingY });
    }
  }
  addRow(topCount, 0);
  if (bottomCount > 0) addRow(bottomCount, 1);
  return positions;
}

// ============================================================
// DOM REFERENCES
// ============================================================

var appEl = document.getElementById("app");
var storageErrorEl = document.getElementById("storage-error");
var toastEl = document.getElementById("toast");
var progressCountEl = document.getElementById("progress-count");
var progressTotalEl = document.getElementById("progress-total");
var stepperMinusEl = document.getElementById("stepper-minus");
var stepperPlusEl = document.getElementById("stepper-plus");
var stepperValueEl = document.getElementById("stepper-value");
var codeInputEl = document.getElementById("code-input");
var punchBtnEl = document.getElementById("punch-btn");
var statusMessageEl = document.getElementById("status-message");
var celebrationEl = document.getElementById("celebration");
var celebrationTitleEl = document.getElementById("celebration-title");
var celebrationCloseEl = document.getElementById("celebration-close");
var tabsNavEl = document.getElementById("tabs-nav");
var modalEl = document.getElementById("code-modal");
var accountBtnEl = document.getElementById("account-btn");
var cardSvgEl = document.querySelector(".card-svg");
var slotGroups = []; // populated by renderSVGSlots

// ============================================================
// STATE
// ============================================================

// states[tabKey] = { punches, shapeIndices }. punches===tab.total means
// a celebration is pending. shapeIndices is local presentation only.
var states = {};
var activeTabKey = TABS[0].key;
var quantity = 1;
var toastTimer = null;
var errorTimer = null;
var isAnimating = false;
var userCode = null;
var modalState = null; // null | "my-card" | "restore" | "override-confirm"
var restoreInputValue = "";
var pendingRestoreCode = null;
var pendingRestoreState = null;

function tabConfig(key) {
  for (var i = 0; i < TABS.length; i++) {
    if (TABS[i].key === key) return TABS[i];
  }
  return TABS[0];
}

function activeTab()   { return tabConfig(activeTabKey); }
function activeState() { return states[activeTabKey]; }

// ============================================================
// SHAPE RENDERING
// ============================================================

/**
 * Pick `total` random shape indices from the available shapes (no repeats).
 */
function generateShapeIndices(total) {
  var indices = [];
  for (var i = 0; i < SHAPE_DEFS.length; i++) {
    indices.push(i);
  }
  // Fisher-Yates shuffle
  for (var i = indices.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var temp = indices[i];
    indices[i] = indices[j];
    indices[j] = temp;
  }
  return indices.slice(0, total);
}

/**
 * Create SVG markup for a single element (circle or path).
 * className: "slot-outline" or "slot-fill"
 * isFill: true for the colored fill layer
 */
function createSVGElement(part, className, isFill) {
  var fillAttr, strokeAttr;

  if (isFill) {
    fillAttr = 'fill="rgb(63,92,56)"';
    strokeAttr = 'stroke="rgb(63,92,56)" stroke-width="1.5"';
  } else {
    fillAttr = 'fill="none"';
    strokeAttr = 'stroke="#B5C2A8" stroke-width="1.5"';
  }

  var vecEffect = ' vector-effect="non-scaling-stroke"';

  if (part.elem === "circle") {
    var cx = part.cx || 0;
    var cy = part.cy || 0;
    return '<circle class="' + className + '" cx="' + cx + '" cy="' + cy + '" r="' + part.r + '" ' + fillAttr + ' ' + strokeAttr + vecEffect + '/>';
  } else if (part.elem === "path") {
    return '<path class="' + className + '" d="' + part.d + '" ' + fillAttr + ' ' + strokeAttr + vecEffect + '/>';
  }
  return '';
}

/**
 * Render SVG slot groups into the card SVG based on shapeIndices.
 */
function renderSVGSlots(shapeIndices) {
  var TARGET_SIZE = 34;
  var positions = computeSlotPositions(shapeIndices.length);

  // Remove existing slots
  var existing = cardSvgEl.querySelectorAll(".slot");
  for (var j = existing.length - 1; j >= 0; j--) {
    cardSvgEl.removeChild(existing[j]);
  }

  // Build and insert new slots with inner group wrapper
  for (var i = 0; i < shapeIndices.length; i++) {
    var shapeDef = SHAPE_DEFS[shapeIndices[i]];
    var pos = positions[i];
    var html = '';

    // Outline elements
    for (var p = 0; p < shapeDef.parts.length; p++) {
      html += createSVGElement(shapeDef.parts[p], "slot-outline", false);
    }
    // Fill elements
    for (var p = 0; p < shapeDef.parts.length; p++) {
      html += createSVGElement(shapeDef.parts[p], "slot-fill", true);
    }

    // Create the group with inner wrapper for normalization
    var temp = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    temp.innerHTML = '<g class="slot" data-slot="' + i + '" transform="translate(' + pos.x + ',' + pos.y + ')"><g class="slot-inner">' + html + '</g></g>';
    cardSvgEl.appendChild(temp.firstChild);
  }

  // Re-query slot groups
  slotGroups = cardSvgEl.querySelectorAll(".slot");

  // Normalize each shape to fit uniformly in TARGET_SIZE x TARGET_SIZE
  for (var i = 0; i < slotGroups.length; i++) {
    var inner = slotGroups[i].querySelector(".slot-inner");
    try {
      var bbox = inner.getBBox();
      if (bbox.width === 0 || bbox.height === 0) continue;

      var cx = bbox.x + bbox.width / 2;
      var cy = bbox.y + bbox.height / 2;
      var maxDim = Math.max(bbox.width, bbox.height);
      var scale = TARGET_SIZE / maxDim;

      // scale() then translate(): translate runs first (centers shape at origin),
      // then scale resizes to target. vector-effect keeps strokes consistent.
      inner.setAttribute("transform",
        "scale(" + scale + ") translate(" + (-cx) + "," + (-cy) + ")");
    } catch (e) {
      // Shape failed to measure — leave as-is
    }
  }
}

// ============================================================
// LOCALSTORAGE HELPERS
// ============================================================

/**
 * Check if localStorage is available by writing and reading a test value.
 */
function checkLocalStorageAvailable() {
  try {
    var testKey = "__niv_test__";
    localStorage.setItem(testKey, "1");
    var result = localStorage.getItem(testKey);
    localStorage.removeItem(testKey);
    return result === "1";
  } catch (e) {
    return false;
  }
}

/**
 * Load state for a given tab from localStorage. Returns defaults
 * if data is missing, unparseable, or fails validation.
 *
 * State shape: { punches, shapeIndices }. punches===tab.total means a
 * celebration is pending; no separate flag is needed.
 */
function loadStateFor(tab) {
  var defaults = { punches: 0, shapeIndices: generateShapeIndices(tab.total) };
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

  // shapeIndices is presentation-only; regenerate if missing or invalid.
  var indices = parsed.shapeIndices;
  if (!Array.isArray(indices) || indices.length !== tab.total) {
    return { punches: punches, shapeIndices: generateShapeIndices(tab.total) };
  }
  var seen = {};
  for (var i = 0; i < indices.length; i++) {
    var idx = indices[i];
    if (typeof idx !== "number" || !Number.isInteger(idx) || idx < 0 || idx >= SHAPE_DEFS.length || seen[idx]) {
      return { punches: punches, shapeIndices: generateShapeIndices(tab.total) };
    }
    seen[idx] = true;
  }

  return { punches: punches, shapeIndices: indices.slice() };
}

/**
 * Save state for the active tab to localStorage. Shows a toast on error.
 */
function saveActiveState(newState) {
  states[activeTabKey] = newState;
  try {
    localStorage.setItem(activeTab().storageKey, JSON.stringify(newState));
  } catch (e) {
    showToast("לא ניתן לשמור את הכרטיס");
  }
  syncToBackend();
}

function saveActiveTabKey() {
  try { localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabKey); } catch (e) {}
}

function loadActiveTabKey() {
  try {
    var raw = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
    if (raw && tabConfig(raw).key === raw) return raw;
  } catch (e) {}
  return TABS[0].key;
}

// ============================================================
// RENDERING
// ============================================================

/**
 * Render the entire UI from the active tab's state (static, no animation).
 */
function render() {
  var s = activeState();
  for (var i = 0; i < slotGroups.length; i++) {
    slotGroups[i].classList.remove("animating");
    if (i < s.punches) {
      slotGroups[i].classList.add("punched");
    } else {
      slotGroups[i].classList.remove("punched");
    }
  }

  progressCountEl.textContent = s.punches;
  progressTotalEl.textContent = activeTab().total;

  var maxQuantity = activeTab().total - s.punches;
  if (maxQuantity < MIN_QUANTITY) maxQuantity = MIN_QUANTITY;
  if (quantity > maxQuantity) quantity = maxQuantity;
  if (quantity < MIN_QUANTITY) quantity = MIN_QUANTITY;
  renderStepper(maxQuantity);
}

/**
 * Animate new punches filling in one by one with a 200ms stagger.
 */
function animatePunches(startSlot, count, onComplete) {
  var animationDuration = 400;
  var stagger = 200;

  for (var i = 0; i < count; i++) {
    (function (slotIndex, delay) {
      setTimeout(function () {
        slotGroups[slotIndex].classList.add("punched", "animating");
        progressCountEl.textContent = slotIndex + 1;
      }, delay);
    })(startSlot + i, i * stagger);
  }

  var totalTime = (count - 1) * stagger + animationDuration;
  if (onComplete) {
    setTimeout(onComplete, totalTime);
  }
}

/**
 * Render the stepper value and button disabled states.
 */
function renderStepper(maxQuantity) {
  stepperValueEl.textContent = quantity;
  stepperMinusEl.disabled = (quantity <= MIN_QUANTITY);
  stepperPlusEl.disabled = (quantity >= maxQuantity);
}

/**
 * Update the punch button disabled state based on input content.
 */
function updatePunchButtonState() {
  punchBtnEl.disabled = (codeInputEl.value.length === 0);
}

// ============================================================
// TOAST
// ============================================================

function showToast(message, duration) {
  if (duration === undefined) duration = 1500;

  if (toastTimer !== null) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }

  toastEl.textContent = message;
  toastEl.classList.remove("hidden");
  void toastEl.offsetWidth;
  toastEl.classList.add("visible");

  toastTimer = setTimeout(function () {
    toastEl.classList.remove("visible");
    setTimeout(function () {
      toastEl.classList.add("hidden");
    }, 300);
    toastTimer = null;
  }, duration);
}

// ============================================================
// STATUS MESSAGE (error below input)
// ============================================================

function showStatusMessage(text, type) {
  if (errorTimer !== null) {
    clearTimeout(errorTimer);
    errorTimer = null;
  }

  statusMessageEl.textContent = text;
  statusMessageEl.className = "status-message " + type;

  if (type === "error") {
    errorTimer = setTimeout(function () {
      clearStatusMessage();
      errorTimer = null;
    }, 3000);
  }
}

function clearStatusMessage() {
  statusMessageEl.textContent = "";
  statusMessageEl.className = "status-message hidden";
  if (errorTimer !== null) {
    clearTimeout(errorTimer);
    errorTimer = null;
  }
}

// ============================================================
// CELEBRATION
// ============================================================

function trapFocusCelebration(e) {
  if (e.key === "Tab") {
    e.preventDefault();
    celebrationCloseEl.focus();
  }
  if (e.key === "Escape") {
    dismissCelebration();
  }
}

function showCelebration() {
  celebrationTitleEl.textContent = activeTab().celebrate;
  celebrationEl.classList.add("visible");
  document.body.classList.add("celebration-active");
  appEl.setAttribute("aria-hidden", "true");
  document.addEventListener("keydown", trapFocusCelebration);
  setTimeout(function () {
    celebrationCloseEl.focus();
  }, 300);
}

function dismissCelebration() {
  if (!celebrationEl.classList.contains("visible")) return;

  celebrationEl.classList.remove("visible");
  document.removeEventListener("keydown", trapFocusCelebration);

  setTimeout(function () {
    document.body.classList.remove("celebration-active");
    appEl.removeAttribute("aria-hidden");

    // Reshuffle local shapes for the new card (active tab only). Backend
    // only sees punches=0; shape arrangement is presentation, not synced.
    var newIndices = generateShapeIndices(activeTab().total);
    saveActiveState({ punches: 0, shapeIndices: newIndices });

    // Re-render SVG with new shapes
    renderSVGSlots(activeState().shapeIndices);

    quantity = 1;
    render();
    unlockUI();

    showToast("כרטיסיה חדשה :)");
  }, 300);
}

// ============================================================
// PUNCH LOGIC
// ============================================================

function lockUI() {
  isAnimating = true;
  punchBtnEl.disabled = true;
  stepperMinusEl.disabled = true;
  stepperPlusEl.disabled = true;
  codeInputEl.disabled = true;
}

function unlockUI() {
  isAnimating = false;
  codeInputEl.disabled = false;
  updatePunchButtonState();
  var maxQuantity = activeTab().total - activeState().punches;
  if (maxQuantity < MIN_QUANTITY) maxQuantity = MIN_QUANTITY;
  renderStepper(maxQuantity);
}

function handlePunch() {
  if (isAnimating) return;

  var tab = activeTab();
  var s = activeState();
  var enteredCode = codeInputEl.value.trim().toLowerCase();
  var correctCode = tab.code.toLowerCase();

  if (enteredCode === correctCode) {
    var oldPunches = s.punches;
    var awardedQuantity = quantity;
    var newPunches = oldPunches + awardedQuantity;

    if (newPunches > tab.total) {
      newPunches = tab.total;
      awardedQuantity = tab.total - oldPunches;
    }

    codeInputEl.value = "";
    quantity = 1;
    clearStatusMessage();
    lockUI();

    if (newPunches === tab.total) {
      saveActiveState({ punches: tab.total, shapeIndices: s.shapeIndices });

      animatePunches(oldPunches, awardedQuantity, function () {
        setTimeout(function () {
          showCelebration();
        }, 500);
      });
    } else {
      saveActiveState({ punches: newPunches, shapeIndices: s.shapeIndices });

      animatePunches(oldPunches, awardedQuantity, function () {
        unlockUI();

        if (awardedQuantity === 1) {
          showToast("ניקוב נוסף בהצלחה");
        } else {
          showToast(awardedQuantity + " ניקובים נוספו בהצלחה");
        }
      });
    }
  } else {
    codeInputEl.value = "";
    updatePunchButtonState();
    codeInputEl.classList.add("shake");
    showStatusMessage("קוד לא נכון, נסו שוב", "error");
  }
}

// ============================================================
// TABS
// ============================================================

function buildTabs() {
  var html = '';
  for (var i = 0; i < TABS.length; i++) {
    var t = TABS[i];
    var isActive = t.key === activeTabKey;
    html += '<button type="button" class="tab' + (isActive ? ' tab--active' : '') +
            '" data-tab="' + t.key + '" role="tab" aria-selected="' + (isActive ? 'true' : 'false') +
            '">' + t.label + '</button>';
  }
  tabsNavEl.innerHTML = html;

  var btns = tabsNavEl.querySelectorAll(".tab");
  for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener("click", function () {
      switchTab(this.getAttribute("data-tab"));
    });
  }
}

function updateTabButtons() {
  var btns = tabsNavEl.querySelectorAll(".tab");
  for (var i = 0; i < btns.length; i++) {
    var key = btns[i].getAttribute("data-tab");
    var isActive = key === activeTabKey;
    btns[i].classList.toggle("tab--active", isActive);
    btns[i].setAttribute("aria-selected", isActive ? "true" : "false");
  }
}

function switchTab(key) {
  if (key === activeTabKey) return;
  if (isAnimating) return;
  if (celebrationEl.classList.contains("visible")) return;
  if (!states[key]) return;

  activeTabKey = key;
  saveActiveTabKey();
  updateTabButtons();
  codeInputEl.value = "";
  clearStatusMessage();
  updatePunchButtonState();
  quantity = 1;

  renderSVGSlots(activeState().shapeIndices);
  render();

  // punches===total means the user completed this tab on another browser tab
  // (or device) and hasn't dismissed the celebration yet. render() already
  // filled the slots; just show the overlay.
  if (activeState().punches === activeTab().total) {
    lockUI();
    showCelebration();
  }
}

// ============================================================
// EVENT HANDLERS
// ============================================================

stepperMinusEl.addEventListener("click", function () {
  if (isAnimating) return;
  if (quantity > MIN_QUANTITY) {
    quantity--;
    var maxQuantity = activeTab().total - activeState().punches;
    if (maxQuantity < MIN_QUANTITY) maxQuantity = MIN_QUANTITY;
    renderStepper(maxQuantity);
  }
});

stepperPlusEl.addEventListener("click", function () {
  if (isAnimating) return;
  var maxQuantity = activeTab().total - activeState().punches;
  if (maxQuantity < MIN_QUANTITY) maxQuantity = MIN_QUANTITY;
  if (quantity < maxQuantity) {
    quantity++;
    renderStepper(maxQuantity);
  }
});

codeInputEl.addEventListener("input", function () {
  updatePunchButtonState();
  if (statusMessageEl.classList.contains("error")) {
    clearStatusMessage();
  }
});

punchBtnEl.addEventListener("click", function () {
  if (!punchBtnEl.disabled) handlePunch();
});

codeInputEl.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && codeInputEl.value.length > 0) {
    e.preventDefault();
    handlePunch();
  }
});

codeInputEl.addEventListener("animationend", function () {
  codeInputEl.classList.remove("shake");
});

celebrationCloseEl.addEventListener("click", function () {
  dismissCelebration();
});

// Cross-browser-tab sync via storage event. Updates any tab's state in
// the background; re-renders UI only if the active tab changed.
window.addEventListener("storage", function (e) {
  if (!e.key) return;

  for (var i = 0; i < TABS.length; i++) {
    var t = TABS[i];
    if (e.key !== t.storageKey) continue;

    var fresh = loadStateFor(t);
    states[t.key] = fresh;

    if (t.key === activeTabKey) {
      if (isAnimating || celebrationEl.classList.contains("visible")) return;
      renderSVGSlots(fresh.shapeIndices);
      quantity = 1;
      render();
      if (fresh.punches === t.total) {
        lockUI();
        showCelebration();
      }
    }
    return;
  }
});

// ============================================================
// USER CODE + BACKEND
// ============================================================

function generateCode() {
  var s = "";
  for (var i = 0; i < CODE_LENGTH; i++) {
    s += CODE_ALPHABET.charAt(Math.floor(Math.random() * CODE_ALPHABET.length));
  }
  return s;
}

var CODE_REGEX = /^[2-9A-HJ-NP-Z]{6}$/;

function loadUserCode() {
  try {
    var c = localStorage.getItem(USER_CODE_STORAGE_KEY);
    if (typeof c === "string" && CODE_REGEX.test(c)) return c;
  } catch (e) {}
  return null;
}

function persistUserCode(c) {
  try { localStorage.setItem(USER_CODE_STORAGE_KEY, c); } catch (e) {}
}

// Backend only sees punch counts. Shape arrangement is local presentation.
function backendStateBlob() {
  var s = {};
  for (var i = 0; i < TABS.length; i++) {
    s[TABS[i].key] = { punches: states[TABS[i].key].punches };
  }
  return s;
}

// Backend abstraction. With BACKEND_URL empty, "remote" is just another
// localStorage namespace — codes are still usable on this device, but
// can't reach another phone without a real backend deployed.
function backendGet(code) {
  if (!BACKEND_URL) {
    try {
      var raw = localStorage.getItem("niv_remote_" + code);
      return Promise.resolve(raw ? JSON.parse(raw) : null);
    } catch (e) { return Promise.resolve(null); }
  }
  return fetch(BACKEND_URL + "?action=get&code=" + encodeURIComponent(code))
    .then(function (r) { if (!r.ok) throw new Error("bad"); return r.json(); })
    .then(function (j) { return (j && j.ok) ? j.state : null; });
}

function backendSet(code, state) {
  if (!BACKEND_URL) {
    try { localStorage.setItem("niv_remote_" + code, JSON.stringify(state)); } catch (e) {}
    return;
  }
  // text/plain skips CORS preflight; Apps Script reads from postData.contents.
  fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "set", code: code, state: state })
  }).catch(function () { /* fire-and-forget; next state change will retry */ });
}

function syncToBackend() {
  if (!userCode) return;
  backendSet(userCode, backendStateBlob());
}

// Fire-and-forget analytics ping. Uses sendBeacon so the request survives
// the user immediately leaving for an external app (tel:, mailto:,
// target=_blank navigations).
function backendBeacon(payload) {
  if (!BACKEND_URL) return;
  var body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    try {
      navigator.sendBeacon(BACKEND_URL, new Blob([body], { type: "text/plain;charset=utf-8" }));
      return;
    } catch (e) { /* fall through to fetch */ }
  }
  fetch(BACKEND_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: body,
    keepalive: true
  }).catch(function () {});
}

function backendClick(value) { backendBeacon({ action: "click", value: value }); }
function backendScan()       { backendBeacon({ action: "scan" }); }

// If the URL carries ?ref=qr, the visitor arrived via a scanned QR code.
// Fire a single scan event and strip the param so reloads don't refire.
function detectQRScan() {
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get("ref") !== "qr") return;
    backendScan();
    params.delete("ref");
    var qs = params.toString();
    var url = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
    history.replaceState(null, "", url);
  } catch (e) {}
}

// ============================================================
// CODE MODAL (my-card / restore / override-confirm)
// ============================================================

function iconCopy() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
    '</svg>';
}

function iconCheck() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="20 6 9 17 4 12"/>' +
    '</svg>';
}

function openModal(state) {
  modalState = state;
  renderModal();
  modalEl.classList.add("visible");
  appEl.setAttribute("aria-hidden", "true");
  document.addEventListener("keydown", onModalKeydown);
}

function closeModal() {
  modalState = null;
  modalEl.classList.remove("visible");
  appEl.removeAttribute("aria-hidden");
  document.removeEventListener("keydown", onModalKeydown);
  restoreInputValue = "";
  pendingRestoreCode = null;
  pendingRestoreState = null;
}

// Escape mirrors the visible ביטול / סגור action for the current view.
function onModalKeydown(e) {
  if (e.key !== "Escape") return;
  if (modalState === "override-confirm") openModal("restore");
  else if (modalState === "restore") {
    if (userCode) openModal("my-card"); else closeModal();
  } else {
    closeModal();
  }
}

function renderModal() {
  var card = modalEl.querySelector(".modal-card");

  if (modalState === "my-card") {
    card.innerHTML =
      '<h2 id="modal-title" class="modal-title">הכרטיס שלי</h2>' +
      '<p class="modal-subtitle">הקוד האישי שלכם — שמרו אותו לשחזור בכל מכשיר</p>' +
      '<div class="code-display">' +
        '<button type="button" class="icon-btn" id="modal-copy-btn" aria-label="העתקה">' + iconCopy() + '</button>' +
        '<div class="code-display-value">' + userCode + '</div>' +
      '</div>' +
      '<button type="button" class="modal-primary-btn" id="modal-close-btn">סגור</button>' +
      '<button type="button" class="modal-link-btn" id="modal-restore-link">החלף כרטיס</button>';
    document.getElementById("modal-copy-btn").addEventListener("click", function () { handleCopyCode(this); });
    document.getElementById("modal-close-btn").addEventListener("click", closeModal);
    document.getElementById("modal-restore-link").addEventListener("click", function () { openModal("restore"); });
    setTimeout(function () { document.getElementById("modal-close-btn").focus(); }, 200);

  } else if (modalState === "restore") {
    card.innerHTML =
      '<h2 id="modal-title" class="modal-title">שחזור כרטיס</h2>' +
      '<p class="modal-subtitle">הזינו את הקוד שלכם</p>' +
      '<input type="text" id="modal-code-input" class="code-input-field" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="6" placeholder="AB34X7" value="' + restoreInputValue + '">' +
      '<div id="modal-status" class="modal-status"></div>' +
      '<button type="button" class="modal-primary-btn" id="modal-submit-btn">שחזור</button>' +
      '<button type="button" class="modal-link-btn" id="modal-cancel-link">ביטול</button>';
    var input = document.getElementById("modal-code-input");
    var submitBtn = document.getElementById("modal-submit-btn");
    var statusEl = document.getElementById("modal-status");

    function refreshSubmit() { submitBtn.disabled = input.value.length !== CODE_LENGTH; }
    refreshSubmit();

    input.addEventListener("input", function () {
      input.value = input.value.toUpperCase().replace(/[^2-9A-HJ-NP-Z]/g, "");
      restoreInputValue = input.value;
      statusEl.textContent = "";
      refreshSubmit();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !submitBtn.disabled) {
        e.preventDefault();
        handleRestoreSubmit();
      }
    });
    submitBtn.addEventListener("click", handleRestoreSubmit);
    document.getElementById("modal-cancel-link").addEventListener("click", function () {
      if (userCode) openModal("my-card"); else closeModal();
    });
    setTimeout(function () {
      input.focus();
      if (input.value) input.setSelectionRange(input.value.length, input.value.length);
    }, 200);

  } else if (modalState === "override-confirm") {
    card.innerHTML =
      '<h2 id="modal-title" class="modal-title">להחליף את הכרטיס הנוכחי?</h2>' +
      '<p class="modal-subtitle">הכרטיס הנוכחי יוחלף בכרטיס <strong dir="ltr" style="letter-spacing:0.15em">' + pendingRestoreCode + '</strong></p>' +
      '<button type="button" class="modal-primary-btn" id="modal-confirm-btn">החלף</button>' +
      '<button type="button" class="modal-link-btn" id="modal-back-link">ביטול</button>';
    document.getElementById("modal-confirm-btn").addEventListener("click", function () {
      applyRestoredCode(pendingRestoreCode);
    });
    document.getElementById("modal-back-link").addEventListener("click", function () {
      openModal("restore");
    });
    setTimeout(function () { document.getElementById("modal-confirm-btn").focus(); }, 200);
  }
}

function setBtnLoading(btn, isLoading) {
  if (isLoading) {
    btn._origHTML = btn.innerHTML;
    btn._origLabel = btn.getAttribute("aria-label");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.setAttribute("aria-label", "טוען");
    btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>';
  } else {
    btn.disabled = false;
    btn.removeAttribute("aria-busy");
    if (btn._origLabel) btn.setAttribute("aria-label", btn._origLabel);
    else btn.removeAttribute("aria-label");
    if (btn._origHTML != null) btn.innerHTML = btn._origHTML;
  }
}

function handleRestoreSubmit() {
  var input = document.getElementById("modal-code-input");
  var submitBtn = document.getElementById("modal-submit-btn");
  var statusEl = document.getElementById("modal-status");
  var code = input.value;
  if (code.length !== CODE_LENGTH) return;

  if (code === userCode) {
    statusEl.textContent = "זה כבר הכרטיס שלכם";
    return;
  }

  statusEl.textContent = "";
  setBtnLoading(submitBtn, true);
  input.disabled = true;

  function showError(msg) {
    statusEl.textContent = msg;
    setBtnLoading(submitBtn, false);
    input.disabled = false;
    input.focus();
    input.select();
  }

  backendGet(code).then(function (state) {
    // Bail if the user navigated away during the fetch (ביטול, escape, etc.).
    if (modalState !== "restore") return;
    if (!state) {
      showError("קוד לא נמצא");
      return;
    }
    pendingRestoreCode = code;
    pendingRestoreState = state;
    openModal("override-confirm");
  }).catch(function () {
    if (modalState !== "restore") return;
    showError("שגיאה — נסו שוב");
  });
}

function applyRestoredCode(code) {
  var state = pendingRestoreState;
  if (!state) {
    showToast("שגיאה בשחזור");
    closeModal();
    return;
  }
  for (var i = 0; i < TABS.length; i++) {
    var tab = TABS[i];
    var backendTab = state[tab.key];
    var punches = isValidBackendTab(backendTab, tab) ? backendTab.punches : 0;
    var fresh = { punches: punches, shapeIndices: generateShapeIndices(tab.total) };
    states[tab.key] = fresh;
    try { localStorage.setItem(tab.storageKey, JSON.stringify(fresh)); } catch (e) {}
  }
  userCode = code;
  persistUserCode(code);

  renderSVGSlots(activeState().shapeIndices);
  quantity = 1;
  render();
  updatePunchButtonState();

  closeModal();
  showToast("הכרטיס שוחזר");
}

function isValidBackendTab(s, tab) {
  if (!s || typeof s !== "object") return false;
  if (typeof s.punches !== "number" || !Number.isInteger(s.punches) || s.punches < 0 || s.punches > tab.total) return false;
  return true;
}

function handleCopyCode(btnEl) {
  if (!userCode) return;
  var p = (navigator.clipboard && navigator.clipboard.writeText)
    ? navigator.clipboard.writeText(userCode)
    : fallbackCopy(userCode);
  p.then(function () {
    var orig = btnEl.innerHTML;
    btnEl.innerHTML = iconCheck();
    setTimeout(function () { btnEl.innerHTML = orig; }, 1200);
    showToast("הקוד הועתק");
  }).catch(function () {
    showToast("שגיאה בהעתקה");
  });
}

function fallbackCopy(text) {
  try {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    var ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok ? Promise.resolve() : Promise.reject();
  } catch (e) { return Promise.reject(); }
}

// Click overlay backdrop to close (only on my-card — others have work in progress).
modalEl.addEventListener("click", function (e) {
  if (e.target === modalEl && modalState === "my-card") closeModal();
});

accountBtnEl.addEventListener("click", function () { openModal("my-card"); });

// Social-hub analytics. Wire one fire-and-forget click per icon. The link's
// own href (target=_blank, tel:) still navigates; sendBeacon ensures the
// analytics ping leaves before the page loses focus.
[
  { selector: ".social-link--facebook",  value: "facebook" },
  { selector: ".social-link--instagram", value: "instagram" },
  { selector: ".social-link--maps",      value: "maps" },
  { selector: ".social-link--phone",     value: "phone" }
].forEach(function (h) {
  var el = document.querySelector(h.selector);
  if (el) el.addEventListener("click", function () { backendClick(h.value); });
});

// ============================================================
// INITIALIZATION
// ============================================================

(function init() {
  codeInputEl.setAttribute("inputmode", INPUT_MODE);
  detectQRScan();

  if (!checkLocalStorageAvailable()) {
    appEl.classList.add("hidden");
    storageErrorEl.classList.remove("hidden");
    return;
  }

  // Load state for every tab
  for (var i = 0; i < TABS.length; i++) {
    states[TABS[i].key] = loadStateFor(TABS[i]);
  }

  // Restore last active tab
  activeTabKey = loadActiveTabKey();

  // Build tabs nav
  buildTabs();

  // Render active tab's card
  renderSVGSlots(activeState().shapeIndices);
  render();
  updatePunchButtonState();

  // Persist (in case shapes were freshly generated for any tab)
  for (var i = 0; i < TABS.length; i++) {
    try { localStorage.setItem(TABS[i].storageKey, JSON.stringify(states[TABS[i].key])); } catch (e) {}
  }

  // Load or create user code. First launch auto-shows the "my card" popup.
  userCode = loadUserCode();
  var isFirstLaunch = !userCode;
  if (isFirstLaunch) {
    userCode = generateCode();
    persistUserCode(userCode);
    // Seed backend with the starting blob (so a second device can restore later).
    syncToBackend();
  }

  // Pending celebration on active tab. render() above already filled the
  // slots and set the progress count; we just lock and show the overlay.
  if (activeState().punches === activeTab().total) {
    lockUI();
    showCelebration();
  } else if (isFirstLaunch) {
    openModal("my-card");
  }
})();
