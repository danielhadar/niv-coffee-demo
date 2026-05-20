# Store-deal redemption — design spec

**Date:** 2026-05-20
**Status:** Approved for implementation
**Location:** New page `/deal/` inside the existing niv-cafe repo

## Summary

A second mini-app inside niv-cafe that lets a customer at the cafe-adjacent store
redeem promotional deals at Niv Cafe. The neighboring store has a static printed
QR poster; scanning opens a deal page on the customer's phone. The customer
hands their phone to the store cashier (gate 1, store-PIN), then later to Niv
(gate 2, Niv-PIN). Each session is single-use, time-limited, and tracked
server-side. The customer's phone is the only device involved.

## Goals

- Drive foot traffic from the neighboring store to Niv via time-limited deals
- Make casual fraud (screenshot reuse, share-with-friends, scan-without-buying) not work
- Stay stupid simple — one device (the customer's phone), no staff hardware
- Reuse the existing niv-cafe stack (static HTML on GH Pages + Apps Script on a Google Sheet)
- Keep deal definitions and PINs in a single config block at the top of `deal/app.js`

## Non-goals

- Per-deal redemption tracking. One PIN press marks the whole session redeemed; deals are display-only offers
- Per-deal expiry. One global expiry constant governs all deals
- Staff-side hardware or a separate operator URL. Niv types on the customer's phone
- Defending against a determined developer-attacker who builds a phishing clone of the page. Mitigation is operational (Niv glances at the URL bar before typing the PIN)
- Configurable deals via the sheet. Deals are hardcoded in JS for v1; revisit only if the operator finds editing-and-shipping painful

## User flows

### Customer

1. Buys ≥ X NIS at the neighboring store. Cashier points at the QR poster.
2. Scans → lands on `https://niv-cafe.com/deal/`. Page mints a new 16-char `session_id`, parks it in the URL hash (`#s=…`), and shows the "show this screen to the cashier" view with a 4-digit PIN field.
3. Hands phone to cashier. Cashier types `STORE_PIN`. Page flips to the "deals + redeem" view, listing all current deals plus a 4-digit PIN field for Niv.
4. Walks to Niv. Hands phone to Niv. Niv types `NIV_PIN`. Page flips to "נוצל ✓" with a timestamp.

### Cashier (neighboring store)

- Types four digits when the customer presents a phone. That's it. Memorizes one number forever.

### Niv

- Glances at the URL bar (must say `niv-cafe.com/deal/…`), confirms the customer's deal view looks like the real page, types `NIV_PIN`. Memorizes one number forever.

## Threat model

| Threat | Mitigation |
|---|---|
| Photograph the poster, scan from home | Land on the page but can't activate — no store-PIN |
| Activate, screenshot, share URL | Server enforces single redemption per session_id; only one recipient can redeem |
| Alter URL hash to a guessed ID | No `activated` row → page sits on "show to cashier" forever |
| Brute-force PINs | Per-session lock after 5 wrong attempts; per-IP global rate limit; session dies, customer must re-scan |
| Activate today, redeem tomorrow | Server stamps `activated_at` and refuses redemption past `expires_at` |
| PIN leak via overheard typing | Operational fix: rotate the constants in `deal/app.js` and ship. If routine, upgrade to rotating PINs (deferred) |
| Sophisticated customer fakes a clone of the deal page | **Accepted residual risk.** Niv's URL-bar glance is the only check. Cost of one combo ≪ cost of bulletproofing |

The URL-bar check is load-bearing. The staff one-liner: **"before typing the code, check the address says niv-cafe.com."**

## Components

```
niv-cafe/
├── deal/
│   ├── index.html       three-screen single-page app
│   ├── app.js           config + state machine + server calls
│   └── style.css        reuses --green/--cream/--coral from src/style.css
├── deal-qr.html         printable QR poster (sibling of qr-code.html)
└── backend/Code.gs      extended with deal_activate / deal_redeem / deal_status actions
```

### `deal/index.html`

Three `<section>`s stacked, JS toggles `.hidden`:

- `#screen-activate` — "הראו למוכר/ת בחנות" + PIN field
- `#screen-deals` — deals list + "תנו לניב להזין קוד" + PIN field
- `#screen-done` — confetti burst + "נוצל ✓" + the deal text + redemption timestamp. Confetti fires on transition and plays out before the screen settles.
- `#screen-error` — fallback for `locked` / `expired` / unrecoverable states

All sections share the niv-cafe header (logo + Alef font), and the page loads the Negishut accessibility widget with the same `NegishutConfig` as `index.html`. PIN inputs are `inputmode="numeric"`, `maxlength="4"`, render dots like an iOS passcode, auto-focus on screen entry, and have large tap targets.

### `deal/app.js`

Top-of-file config block:

```js
var STORE_PIN = "1234";
var NIV_PIN   = "5678";
var DEAL_EXPIRY = "today";   // "today" | "+24h" | "+7d"
var DAY_CUTOFF_HOUR = 23;    // wall-clock cutoff when DEAL_EXPIRY === "today"
var DEALS = [
  { title: "קפה + כריך", price: 35, note: "" },
  { title: "4+1 על הכריכים", price: null, note: "חמישי על חשבון הבית" },
];
```

Rest of the file (in the vanilla-JS style of `src/app.js`): session_id generator (16 base32 chars), URL-hash sync, screen-state machine, `fetch` wrappers for the three backend actions, error toasts, and a confetti burst when `deal_redeem` succeeds. The confetti fires once on transition to `#screen-done` and plays before the screen settles into its final "נוצל ✓" state. Reuses the existing `.confetti-*` classes and animation from `src/style.css` / `src/app.js` (the punch-card celebration overlay) — same shapes, same palette, same timing.

### `deal-qr.html`

Copy of `qr-code.html` retargeted at `https://niv-cafe.com/deal/`. Same niv logo, same Alef font, same `--coral` hairline accent. Hebrew copy: title "קוד הטבה", subtitle "סרקו כאן".

### `backend/Code.gs`

Extends the existing dispatcher. New actions plus one new sheet.

## Data model

New `deal_sessions` sheet in the same spreadsheet:

| Col | Field | Type | Notes |
|---|---|---|---|
| A | `session_id` | string | 16-char base32 from client |
| B | `activated_at` | Date | Set by `deal_activate` |
| C | `redeemed_at` | Date | Set by `deal_redeem` |
| D | `failed_pin_count` | int | Increments on wrong PIN attempts |
| E | `locked` | bool | True after 5 wrong attempts |

Header self-heals on first invocation (mirrors the pattern in `getCodesSheet_` / `getEventsSheet_` for the punch-card backend).

The existing `events` sheet gains two new types:

| ts | type | value |
|---|---|---|
| ... | `deal_activate` | first 6 chars of session_id |
| ... | `deal_redeem` | first 6 chars of session_id |
| ... | `deal_lock` | first 6 chars of session_id |

Lock events are logged once per session (rare, interesting). PIN failures themselves aren't logged — typos would dominate the noise.

## API

All three actions hit the existing Apps Script web app URL. JSON in, JSON out. Same pattern as the punch-card actions.

### `deal_activate`

**Request** (POST)
```json
{ "action": "deal_activate", "session_id": "...", "pin": "1234" }
```

**Logic**
- If `session_id` row doesn't exist → create with `failed_pin_count=0`, `locked=false`
- If `locked` → return `{ ok: false, error: "locked" }`
- If `pin !== STORE_PIN` → increment `failed_pin_count`; at 5, set `locked=true` and log `deal_lock`; return `{ ok: false, error: "wrong_pin", attempts_left }`
- If correct + already activated → idempotent: return `{ ok: true, expires_at }`
- If correct + first time → stamp `activated_at = now`, compute `expires_at` from `DEAL_EXPIRY`, log `deal_activate`, return `{ ok: true, expires_at }`

### `deal_redeem`

**Request** (POST)
```json
{ "action": "deal_redeem", "session_id": "...", "pin": "5678" }
```

**Logic**
- If row missing or not `activated` → `{ ok: false, error: "not_activated" }`
- If `now > expires_at` → `{ ok: false, error: "expired" }`
- If already redeemed → `{ ok: false, error: "already_redeemed", redeemed_at }`
- If `locked` → `{ ok: false, error: "locked" }`
- Wrong PIN → same lock-counter logic as activate
- Correct → stamp `redeemed_at = now`, log `deal_redeem`, return `{ ok: true, redeemed_at }`

### `deal_status`

**Request** (GET)
```
?action=deal_status&session_id=...
```

**Response**
```json
{
  "activated": true,
  "redeemed": false,
  "expired": false,
  "locked": false,
  "expires_at": "2026-05-20T22:59:59.999Z"
}
```

No PIN required — nothing mutates. Used on page load / refresh to land on the right screen.

### Expiry computation

The backend resolves `DEAL_EXPIRY` server-side (so a customer with a fast clock can't grant themselves extra time):

| Value | `expires_at` |
|---|---|
| `"today"` | The last second of hour `DAY_CUTOFF_HOUR` today, in `Spreadsheet.getSpreadsheetTimeZone()` (Asia/Jerusalem). I.e. `DAY_CUTOFF_HOUR = 23` → today at `23:59:59`; `DAY_CUTOFF_HOUR = 22` → today at `22:59:59` |
| `"+24h"` | `activated_at + 24h` |
| `"+7d"` | `activated_at + 7d` |

Constant lives in `deal/app.js` AND is mirrored in `Code.gs`. (Two-way config — pragmatic for v1; if it drifts we'll surface it via a `deal_config` action later.)

## Client state machine

```
load
  ↓
ensure session_id in URL hash; if missing, mint one
  ↓
deal_status
  ↓
┌──────────────┬──────────────┬───────────────┬──────────────┐
↓              ↓              ↓               ↓              ↓
not activated  activated      redeemed        expired        locked
↓              ↓              ↓               ↓              ↓
screen-activate screen-deals  screen-done    screen-error  screen-error
```

After a successful POST, the client transitions directly to the next screen using the response payload — no extra `deal_status` round-trip.

## Edge cases

- **Refresh / reopen**: `session_id` lives in the URL hash; `deal_status` on load restores the right screen
- **Network drop mid-submit**: client shows "נסו שוב"; both write actions are idempotent (`deal_activate` returns the same `expires_at`; `deal_redeem` returns `already_redeemed`)
- **Second scan during flow**: each fresh scan mints a new `session_id`; the old session is abandoned (and times out at end of day per `expires_at`)
- **Multi-tab on same phone**: same session_id, same server state — both tabs see the same screen
- **Time zone**: Apps Script resolves `now` and `today` in the spreadsheet TZ (already Asia/Jerusalem). Customer device clock is irrelevant

## Observability

Reuses the existing `events` sheet and the dashboard pivot already built for the punch card. New event types: `deal_activate`, `deal_redeem`, `deal_lock`. Sufficient to answer:

- How many activations per day?
- Redemption rate (redeems ÷ activations)?
- Drop-off (activations that expire without redemption)?
- Lock rate (signal for PIN leakage or harassment)?

The `report` sheet's `setupReport()` will need a small extension to surface these — included in the implementation plan.

## Accessibility

- Page is Hebrew/RTL throughout (matches the rest of niv-cafe)
- Negishut widget injected with the same `NegishutConfig` as `index.html`
- PIN fields announce as numeric, render passcode-dot style, focus on screen entry
- Large tap targets and high contrast (reuse existing palette and spacing)

## Testing

No automated tests — same convention as the punch-card app. Manual matrix before first ship:

- Happy path: scan → wrong PIN → wrong PIN → correct → see deals → wrong Niv-PIN → correct → see "redeemed"
- Replay: redeemed session, refresh → "redeemed" screen
- Lockout: 5 wrong PINs → "locked" screen → fresh scan creates a new session
- Expiry: edit a row's `activated_at` to yesterday in the sheet, refresh → "expired" screen
- Idempotency: trigger a network failure during PIN submit, retry → no double-stamp

## Configuration

Operator-tunable values live at the top of `deal/app.js`, with a small mirror in `Code.gs` (see `DEAL_EXPIRY` / `DAY_CUTOFF_HOUR` note below):

| Constant | Default | Purpose |
|---|---|---|
| `STORE_PIN` | `"1234"` | Activation PIN (cashier) |
| `NIV_PIN` | `"5678"` | Redemption PIN (Niv) |
| `DEAL_EXPIRY` | `"today"` | Time horizon (`"today"` / `"+24h"` / `"+7d"`) |
| `DAY_CUTOFF_HOUR` | `23` | Cutoff hour when `DEAL_EXPIRY === "today"` |
| `DEALS` | (see file) | Hardcoded list rendered on `#screen-deals` |

`Code.gs` reads `DEAL_EXPIRY` and `DAY_CUTOFF_HOUR` from constants near the top of the script (must be kept in sync with `deal/app.js` until a future iteration moves them to a shared config endpoint).

## Future iterations (deferred)

- **Rotating PINs** if static PINs leak in practice
- **Per-deal redemption** + analytics if a customer pattern of "use one now, come back for another" emerges
- **Sheet-driven deals** if editing-and-shipping the JS becomes painful
- **Daily-reset metrics** card on the existing `report` sheet for the deal app
- **Customer-side deal selection UI** (checkbox per deal) if Niv wants the customer to commit to a specific deal before redemption

## Open items resolved in this spec

- PINs: `STORE_PIN=1234`, `NIV_PIN=5678` (committed; rotate when leaked)
- Visual treatment for `deal-qr.html`: clone of existing `qr-code.html`, retargeted URL only
