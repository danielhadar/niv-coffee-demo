/**
 * Niv Cafe — punch card backend (Google Apps Script).
 *
 * Three sheets in the spreadsheet:
 *
 *   "codes" sheet (current punch state per code):
 *     A: code | B: bundle | C: pack6_active | D: pack6_punches | E: updated_at
 *     (bundle = כריך+קפה punches; pack6_* = the prepaid 6-pack מבצע שש. Legacy
 *      per-tab columns, if present, are left orphaned — the header self-heals.)
 *
 *   "events" sheet (auto-created on first event, append-only):
 *     A: ts | B: type | C: value
 *     type ∈ {punch, freebie, social, scan, deal_activate, deal_redeem, deal_lock,
 *             deal6_purchase, deal6_punch, deal6_complete}
 *     value: tab key for punch/freebie ("bundle"),
 *            icon key for social ("facebook"/"instagram"/"maps"/"phone"),
 *            source for scan ("qr"),
 *            first 6 chars of session_id for deal_* events.
 *     The deal6_* types are emitted by logPack6Events_ for the prepaid 6-pack
 *     (מבצע שש); the report counts them for the dashboard.
 *
 *   "deal_sessions" sheet (auto-created on first deal interaction):
 *     A: session_id | B: activated_at | C: redeemed_at | D: failed_pin_count | E: locked
 *
 * API:
 *   GET  ?action=get&code=XXXXXX                       -> { ok, state }
 *   GET  ?action=report&from=YYYY-MM-DD&to=YYYY-MM-DD  -> { ok, range, scans, punches, freebies, deal, deal6 }
 *   GET  ?action=deal_status&session_id=ZZ...          -> { ok, activated, redeemed, expired, locked, expires_at }
 *   POST {action:"set",   code, state}                 -> { ok };   server diffs old→new and logs punch/freebie events.
 *   POST {action:"click", value}                       -> { ok };   logs a social event.
 *   POST {action:"scan"}                               -> { ok };   logs a qr scan event.
 *   POST {action:"deal_activate", session_id, pin}     -> { ok, expires_at } | { ok:false, error:"locked"|"wrong_pin", attempts_left? }
 *   POST {action:"deal_redeem",   session_id, pin}     -> { ok, redeemed_at } | { ok:false, error:"locked"|"wrong_pin"|"expired"|"already_redeemed"|"not_activated", attempts_left?, redeemed_at? }
 *
 * Frontend uses Content-Type: text/plain to skip CORS preflight; we read the
 * body from e.postData.contents.
 *
 * Keep TAB_KEYS in sync with TABS in src/app.js. TAB_TOTALS must match the
 * `total` on each tab — it's how the server detects freebie events.
 *
 * Schema self-heal: on every invocation, the script renames the first sheet
 * to "codes" if needed, ensures the "events" sheet exists, and rewrites
 * either header if it doesn't exactly match what the script expects.
 */

var TAB_KEYS      = ['bundle'];
var TAB_TOTALS    = { bundle: 6 };
var SOCIAL_VALUES = ['facebook', 'instagram', 'maps', 'phone'];

var CODES_HEADER  = ['code'].concat(TAB_KEYS).concat(['pack6_active', 'pack6_punches', 'updated_at']);
var EVENTS_HEADER = ['ts', 'type', 'value'];
var CODE_REGEX    = /^[2-9A-HJ-NP-Z]{6}$/;

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

// ---------- sheet accessors ----------

function getCodesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('codes');
  if (!sheet) {
    // First-time migration: rename the original first sheet to "codes".
    sheet = ss.getSheets()[0];
    if (sheet.getName() !== 'codes') sheet.setName('codes');
  }
  ensureHeader_(sheet, CODES_HEADER);
  return sheet;
}

function getEventsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('events');
  if (!sheet) sheet = ss.insertSheet('events');
  ensureHeader_(sheet, EVENTS_HEADER);
  return sheet;
}

function getDealSessionsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('deal_sessions');
  if (!sheet) sheet = ss.insertSheet('deal_sessions');
  ensureHeader_(sheet, DEAL_SESSIONS_HEADER);
  return sheet;
}

// Rewrite row 1 if it doesn't exactly match what the script expects. Lets
// schema changes self-heal on the next write — the operator only needs to
// clear stale data rows, not also fix the header by hand.
function ensureHeader_(sheet, expected) {
  var current = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
  for (var i = 0; i < expected.length; i++) {
    if (current[i] !== expected[i]) {
      sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
      sheet.setFrozenRows(1);
      return;
    }
  }
}

// ---------- helpers ----------

function findCodeRow_(sheet, code) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var codes = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < codes.length; i++) {
    if (codes[i][0] === code) return i + 2;
  }
  return -1;
}

function toInt_(v) {
  var n = (typeof v === 'number') ? v : Number(v);
  if (!isFinite(n) || !Number.isInteger(n) || n < 0) return 0;
  return n;
}

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

function readCodePunches_(sheet, row) {
  var values = sheet.getRange(row, 1, 1, CODES_HEADER.length).getValues()[0];
  var out = {};
  for (var i = 0; i < TAB_KEYS.length; i++) {
    out[TAB_KEYS[i]] = toInt_(values[CODES_HEADER.indexOf(TAB_KEYS[i])]);
  }
  return out;
}

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

function stateToCodeRow_(code, state, now) {
  var row = new Array(CODES_HEADER.length);
  for (var i = 0; i < row.length; i++) row[i] = '';
  row[CODES_HEADER.indexOf('code')] = code;
  row[CODES_HEADER.indexOf('updated_at')] = now;
  for (var i = 0; i < TAB_KEYS.length; i++) {
    var key = TAB_KEYS[i];
    var punches = (state[key] && typeof state[key].punches === 'number') ? state[key].punches : 0;
    row[CODES_HEADER.indexOf(key)] = toInt_(punches);
  }
  var pack6 = state.pack6 || {};
  row[CODES_HEADER.indexOf('pack6_active')]  = pack6.active ? true : false;
  row[CODES_HEADER.indexOf('pack6_punches')] = toInt_(pack6.punches);
  return row;
}

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

function punchesFromState_(state) {
  var out = {};
  for (var i = 0; i < TAB_KEYS.length; i++) {
    var key = TAB_KEYS[i];
    out[key] = (state[key] && typeof state[key].punches === 'number') ? toInt_(state[key].punches) : 0;
  }
  return out;
}

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
  if (newPack.active && newPack.punches >= 6 && oldPack.punches < 6) {
    rows.push([now, 'deal6_complete', '']);
  }
  if (rows.length === 0) return;
  var sheet = getEventsSheet_();
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, EVENTS_HEADER.length).setValues(rows);
}

// ---------- event logging ----------

/**
 * Compare old → new punches per tab. For each positive delta, write N punch
 * events. If a tab reaches its total this round (and wasn't there before),
 * write a freebie event. Decreases (e.g. 10→0 on celebration dismissal) emit
 * nothing.
 */
function logPunchAndFreebieEvents_(oldPunches, newPunches, now) {
  var rows = [];
  for (var i = 0; i < TAB_KEYS.length; i++) {
    var key = TAB_KEYS[i];
    var oldN = oldPunches[key] || 0;
    var newN = newPunches[key] || 0;
    if (newN <= oldN) continue;
    var delta = newN - oldN;
    for (var j = 0; j < delta; j++) {
      rows.push([now, 'punch', key]);
    }
    var total = TAB_TOTALS[key];
    if (typeof total === 'number' && newN === total && oldN < total) {
      rows.push([now, 'freebie', key]);
    }
  }
  if (rows.length === 0) return;
  var sheet = getEventsSheet_();
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, EVENTS_HEADER.length).setValues(rows);
}

function logSocialEvent_(value, now) {
  getEventsSheet_().appendRow([now, 'social', value]);
}

function logDealEvent_(type, sessionId, now) {
  // value is the first 6 chars of session_id — enough to disambiguate in the
  // log without leaking the full token.
  var shortId = (sessionId || '').slice(0, 6);
  getEventsSheet_().appendRow([now, type, shortId]);
}

// ---------- response ----------

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- handlers ----------

function doGet(e) {
  try {
    var action = (e && e.parameter) ? e.parameter.action : null;
    if (action === 'report') return handleReport_(e.parameter || {});
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
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Inclusive [from, to] date window (local script tz). Returns counts off the
// events sheet — no dependency on the report sheet's stateful B2/B3 inputs.
// Powers the web dashboard at /dashboard/. The deal6_* buckets are reserved
// for the prepaid 6-pack (מבצע שש) and stay at 0 until that feature emits them.
function handleReport_(params) {
  var fromStr = params.from;
  var toStr   = params.to;
  if (!fromStr || !toStr || !/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
    return json_({ ok: false, error: 'bad_request' });
  }
  var fromParts = fromStr.split('-').map(Number);
  var toParts   = toStr.split('-').map(Number);
  var start   = new Date(fromParts[0], fromParts[1] - 1, fromParts[2], 0, 0, 0);
  var endExcl = new Date(toParts[0], toParts[1] - 1, toParts[2] + 1, 0, 0, 0);

  var counts = {
    scans:    0,
    punches:  { bundle: 0 },
    freebies: { bundle: 0 },
    deal:     { activations: 0, redemptions: 0, locks: 0 },
    deal6:    { purchases: 0, punches: 0, completions: 0 }
  };

  var events = getEventsSheet_();
  var last = events.getLastRow();
  if (last >= 2) {
    var rows = events.getRange(2, 1, last - 1, EVENTS_HEADER.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      var ts = rows[i][0];
      if (!(ts instanceof Date)) continue;
      if (ts < start || ts >= endExcl) continue;
      var type = rows[i][1];
      var value = rows[i][2];
      if      (type === 'scan'    && value === 'qr')                counts.scans++;
      else if (type === 'punch'   && counts.punches[value]  !== undefined) counts.punches[value]++;
      else if (type === 'freebie' && counts.freebies[value] !== undefined) counts.freebies[value]++;
      else if (type === 'deal_activate')  counts.deal.activations++;
      else if (type === 'deal_redeem')    counts.deal.redemptions++;
      else if (type === 'deal_lock')      counts.deal.locks++;
      else if (type === 'deal6_purchase') counts.deal6.purchases++;
      else if (type === 'deal6_punch')    counts.deal6.punches++;
      else if (type === 'deal6_complete') counts.deal6.completions++;
    }
  }

  return json_({
    ok: true,
    range:    { from: fromStr, to: toStr },
    scans:    counts.scans,
    punches:  counts.punches,
    freebies: counts.freebies,
    deal:     counts.deal,
    deal6:    counts.deal6
  });
}

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

function handleClick_(body, now) {
  if (!body.value || SOCIAL_VALUES.indexOf(body.value) === -1) {
    return json_({ ok: false, error: 'bad_request' });
  }
  logSocialEvent_(body.value, now);
  return json_({ ok: true });
}

function handleScan_(body, now) {
  // Single scan source for now (qr). Add to an allowlist when more arrive.
  getEventsSheet_().appendRow([now, 'scan', 'qr']);
  return json_({ ok: true });
}

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

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    // Native Date object so Sheets stores as datetime (not text). Enables
    // numeric date comparisons in the report dashboard.
    var now = new Date();
    if (body.action === 'set')           return handleSet_(body, now);
    if (body.action === 'click')         return handleClick_(body, now);
    if (body.action === 'scan')          return handleScan_(body, now);
    if (body.action === 'deal_activate') return handleDealActivate_(body, now);
    if (body.action === 'deal_redeem')   return handleDealRedeem_(body, now);
    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------- dashboard setup ----------

/**
 * One-time migration. Converts any string ISO timestamps in events!A to
 * native Date objects so date comparisons in the dashboard work. Idempotent
 * — only touches cells that are still strings. Also normalizes codes!E
 * (updated_at) the same way.
 */
function migrateTimestampsToDates_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // events!A
  var events = ss.getSheetByName('events');
  if (events && events.getLastRow() >= 2) {
    var range = events.getRange(2, 1, events.getLastRow() - 1, 1);
    var values = range.getValues();
    var changed = false;
    for (var i = 0; i < values.length; i++) {
      var v = values[i][0];
      if (typeof v === 'string' && v) {
        var d = new Date(v);
        if (!isNaN(d.getTime())) { values[i][0] = d; changed = true; }
      }
    }
    if (changed) range.setValues(values);
  }

  // codes!E (updated_at column)
  var codes = ss.getSheetByName('codes');
  if (codes && codes.getLastRow() >= 2) {
    var col = CODES_HEADER.indexOf('updated_at') + 1; // 1-indexed
    var range2 = codes.getRange(2, col, codes.getLastRow() - 1, 1);
    var values2 = range2.getValues();
    var changed2 = false;
    for (var j = 0; j < values2.length; j++) {
      var w = values2[j][0];
      if (typeof w === 'string' && w) {
        var d2 = new Date(w);
        if (!isNaN(d2.getTime())) { values2[j][0] = d2; changed2 = true; }
      }
    }
    if (changed2) range2.setValues(values2);
  }
}

/**
 * Builds (or rebuilds) the "report" sheet — a date+hour-filtered dashboard
 * pulling counts off the events and codes sheets. Run once from the Apps
 * Script editor: select `setupReport` in the function dropdown, click Run.
 *
 * Idempotent: re-running clears the sheet, normalizes any legacy string
 * timestamps to Date objects, and rebuilds. Safe after schema changes.
 */
function setupReport() {
  migrateTimestampsToDates_();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('report');
  if (!sheet) sheet = ss.insertSheet('report');
  else sheet.clear();

  var today = new Date();
  var firstOfYear = new Date(today.getFullYear(), 0, 1);

  // Each entry is [label, value-or-formula]. Row index = array index + 1.
  // Helper cells reference $B$8 (start) and $B$9 (end) — keep row numbers stable.
  var rows = [
    ['INPUTS', ''],                                                                  //  1
    ['From date', firstOfYear],                                                      //  2
    ['To date', today],                                                              //  3
    ['From hour (0–23)', 0],                                                         //  4
    ['To hour (0–23)', 23],                                                          //  5
    ['', ''],                                                                        //  6
    ['(helpers — auto)', ''],                                                        //  7
    ['Start datetime', '=B2+B4/24'],                                                 //  8
    ['End datetime (excl)', '=B3+(B5+1)/24'],                                        //  9
    ['', ''],                                                                        // 10
    ['PUNCHES', ''],                                                                 // 11
    ['כריך + קפה', '=COUNTIFS(events!B:B,"punch",events!C:C,"bundle",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 12
    ['', ''],                                                                        // 13
    ['FREEBIES (half-price items earned)', ''],                                      // 14
    ['כריך + קפה', '=COUNTIFS(events!B:B,"freebie",events!C:C,"bundle",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 15
    ['', ''],                                                                        // 16
    ['SOCIAL TAPS', ''],                                                             // 17
    ['Facebook',  '=COUNTIFS(events!B:B,"social",events!C:C,"facebook", events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 18
    ['Instagram', '=COUNTIFS(events!B:B,"social",events!C:C,"instagram",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 19
    ['Maps',      '=COUNTIFS(events!B:B,"social",events!C:C,"maps",     events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 20
    ['Phone',     '=COUNTIFS(events!B:B,"social",events!C:C,"phone",    events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 21
    ['', ''],                                                                        // 22
    ['SCANS', ''],                                                                   // 23
    ['QR', '=COUNTIFS(events!B:B,"scan",events!C:C,"qr",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 24
    ['', ''],                                                                        // 25
    ['DEAL (one-time)', ''],                                                         // 26
    ['Activations', '=COUNTIFS(events!B:B,"deal_activate",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 27
    ['Redemptions', '=COUNTIFS(events!B:B,"deal_redeem",  events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 28
    ['Locks',       '=COUNTIFS(events!B:B,"deal_lock",    events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 29
    ['', ''],                                                                        // 30
    ['DEAL-6 (prepaid pack — מבצע שש)', ''],                                          // 31
    ['Purchases',   '=COUNTIFS(events!B:B,"deal6_purchase",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 32
    ['Punches',     '=COUNTIFS(events!B:B,"deal6_punch",   events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 33
    ['Completions', '=COUNTIFS(events!B:B,"deal6_complete",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 34
    ['', ''],                                                                        // 35
    ['DERIVED', ''],                                                                 // 36
    ['כריך + קפה completion %', '=IFERROR(B15*6/B12,0)'],                             // 37
    ['Deal redemption rate %',  '=IFERROR(B28/B27,0)'],                              // 38
    ['Total codes ever',        '=COUNTA(codes!A:A)-1'],                             // 39
    ['Total deal sessions ever', '=COUNTA(deal_sessions!A:A)-1']                     // 40
  ];

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);

  // Number formats
  sheet.getRange('B2:B3').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('B8:B9').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange('B37:B38').setNumberFormat('0%');

  // Visual cues: bold section headers, highlight input cells, subdue helpers
  var headerRows = [1, 7, 11, 14, 17, 23, 26, 31, 36];
  for (var i = 0; i < headerRows.length; i++) {
    sheet.getRange(headerRows[i], 1, 1, 2).setFontWeight('bold');
  }
  sheet.getRange('B2:B5').setBackground('#fff2cc'); // inputs — edit me
  sheet.getRange('B8:B9').setBackground('#f3f3f3'); // helpers — don't touch

  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 220);
  sheet.setFrozenRows(5);
}
