/**
 * Niv Cafe — punch card backend (Google Apps Script).
 *
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
 *
 * API:
 *   GET  ?action=get&code=XXXXXX                       -> { ok, state }
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

var TAB_KEYS      = ['coffee', 'pizza', 'sandwich'];
var TAB_TOTALS    = { coffee: 10, pizza: 10, sandwich: 10 };
var SOCIAL_VALUES = ['facebook', 'instagram', 'maps', 'phone'];

var CODES_HEADER  = ['code'].concat(TAB_KEYS).concat(['updated_at']);
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

function handleSet_(body, now) {
  if (!body.code || !CODE_REGEX.test(body.code) || !body.state) {
    return json_({ ok: false, error: 'bad_request' });
  }
  var sheet = getCodesSheet_();
  var row = findCodeRow_(sheet, body.code);
  var oldPunches = (row === -1) ? {} : readCodePunches_(sheet, row);
  var newPunches = punchesFromState_(body.state);
  var rowData = stateToCodeRow_(body.code, body.state, now);
  if (row === -1) {
    sheet.appendRow(rowData);
  } else {
    sheet.getRange(row, 1, 1, CODES_HEADER.length).setValues([rowData]);
  }
  logPunchAndFreebieEvents_(oldPunches, newPunches, now);
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
    ['Coffee',   '=COUNTIFS(events!B:B,"punch",events!C:C,"coffee",  events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 12
    ['Pizza',    '=COUNTIFS(events!B:B,"punch",events!C:C,"pizza",   events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 13
    ['Sandwich', '=COUNTIFS(events!B:B,"punch",events!C:C,"sandwich",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 14
    ['', ''],                                                                        // 15
    ['FREEBIES (free items earned)', ''],                                            // 16
    ['Coffee',   '=COUNTIFS(events!B:B,"freebie",events!C:C,"coffee",  events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 17
    ['Pizza',    '=COUNTIFS(events!B:B,"freebie",events!C:C,"pizza",   events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 18
    ['Sandwich', '=COUNTIFS(events!B:B,"freebie",events!C:C,"sandwich",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 19
    ['', ''],                                                                        // 20
    ['SOCIAL TAPS', ''],                                                             // 21
    ['Facebook',  '=COUNTIFS(events!B:B,"social",events!C:C,"facebook", events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 22
    ['Instagram', '=COUNTIFS(events!B:B,"social",events!C:C,"instagram",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 23
    ['Maps',      '=COUNTIFS(events!B:B,"social",events!C:C,"maps",     events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 24
    ['Phone',     '=COUNTIFS(events!B:B,"social",events!C:C,"phone",    events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 25
    ['', ''],                                                                        // 26
    ['SCANS', ''],                                                                   // 27
    ['QR', '=COUNTIFS(events!B:B,"scan",events!C:C,"qr",events!A:A,">="&$B$8,events!A:A,"<"&$B$9)'], // 28
    ['', ''],                                                                        // 29
    ['DERIVED', ''],                                                                 // 30
    ['Coffee completion %',   '=IFERROR(B17*10/B12,0)'],                             // 31
    ['Pizza completion %',    '=IFERROR(B18*10/B13,0)'],                             // 32
    ['Sandwich completion %', '=IFERROR(B19*10/B14,0)'],                             // 33
    ['Total codes ever',      '=COUNTA(codes!A:A)-1']                                // 34
  ];

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);

  // Number formats
  sheet.getRange('B2:B3').setNumberFormat('yyyy-mm-dd');
  sheet.getRange('B8:B9').setNumberFormat('yyyy-mm-dd hh:mm');
  sheet.getRange('B31:B33').setNumberFormat('0%');

  // Visual cues: bold section headers, highlight input cells, subdue helpers
  var headerRows = [1, 7, 11, 16, 21, 27, 30];
  for (var i = 0; i < headerRows.length; i++) {
    sheet.getRange(headerRows[i], 1, 1, 2).setFontWeight('bold');
  }
  sheet.getRange('B2:B5').setBackground('#fff2cc'); // inputs — edit me
  sheet.getRange('B8:B9').setBackground('#f3f3f3'); // helpers — don't touch

  sheet.setColumnWidth(1, 260);
  sheet.setColumnWidth(2, 220);
  sheet.setFrozenRows(5);
}
