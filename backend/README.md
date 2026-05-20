# Backend setup (Google Sheet + Apps Script)

The punch card app stores per-user state in a single Google Sheet, with a tiny
Apps Script Web App in front of it for read/write.

Free, no servers, no auth tokens in client code. ~5 min to set up.

## One-time setup

1. **Create a sheet.** Go to <https://sheets.new>. Name it something like
   "Niv punch cards". Leave it empty — the script will populate it on first
   write.

2. **Open the script editor.** In the sheet: `Extensions` → `Apps Script`.

3. **Paste the script.** Copy the entire contents of `Code.gs` (this folder)
   into the editor, replacing whatever's there. Save (⌘S / Ctrl-S).

4. **Deploy as a Web App.**
   - Top right: `Deploy` → `New deployment`.
   - Click the gear icon next to "Select type" → choose `Web app`.
   - Description: anything (e.g. "niv v1").
   - Execute as: **Me** (your account).
   - Who has access: **Anyone**.
   - Click `Deploy`.
   - First time: Google will ask you to authorize the script. Approve.
     (The scary "unsafe" warning is normal for unverified personal scripts —
     it's your own script calling your own sheet.)
   - Copy the **Web app URL** that appears at the end. It looks like:
     `https://script.google.com/macros/s/AKfy.../exec`

5. **Wire the frontend to the URL.** In `src/app.js` near the top:

   ```js
   var BACKEND_URL = "https://script.google.com/macros/s/AKfy.../exec";
   ```

   Commit + ship. The next punch will write a row to the sheet.

## Verifying it works

After deploying, paste the URL into a browser with `?action=get&code=ABCDEF`
appended. You should get JSON: `{"ok":false}` (no such code yet — that's fine).

After punching once on the live site, open the sheet — there should be one row
with your 6-char code, the state JSON, and a timestamp.

## Updating the script later

If you edit `Code.gs`, you need to redeploy:
- `Deploy` → `Manage deployments` → pencil icon → `Version: New version` → `Deploy`.
- The URL stays the same. **Do not** create a new deployment — that gives you a
  new URL and would orphan existing user data references.

## Schema

### `codes` sheet — current punch state per code

One row per customer code, one column per tab. Flat shape — readable,
sortable, manually editable. The script renames the spreadsheet's first
sheet to `codes` on first invocation (auto-migration; nothing to click).

| A (code) | B (coffee) | C (pizza) | D (sandwich) | E (updated_at)             |
| -------- | ---------- | --------- | ------------ | -------------------------- |
| `Q8DR37` | 3          | 0         | 1            | `2026-05-18T20:13:42.123Z` |

Tab order is defined by `TAB_KEYS` at the top of `Code.gs` and must mirror
`TABS` in `src/app.js`. The header self-heals on every script invocation
(via `ensureHeader_`) — if you change the column set in code, the next API
hit rewrites the header to match.

The wire format with the client is still object-wrapped to leave room for
future per-tab fields:

```json
{ "coffee": { "punches": 3 }, "pizza": { "punches": 0 }, "sandwich": { "punches": 1 } }
```

Shape arrangements (the geometric layout on the card) are **not** stored
here — they're presentation, kept per-device in `localStorage`. The backend
only knows punch counts.

### `events` sheet — anonymous append-only event log

Auto-created the first time the script writes an event. One row per atomic
event. No customer code — events are aggregate-only by design.

| A (ts)                    | B (type)  | C (value)    |
| ------------------------- | --------- | ------------ |
| `2026-05-18T20:13:42.123Z` | `punch`   | `coffee`     |
| `2026-05-18T20:13:42.123Z` | `punch`   | `coffee`     |
| `2026-05-18T20:14:11.040Z` | `freebie` | `coffee`     |
| `2026-05-18T20:15:02.880Z` | `social`  | `instagram`  |

- `punch` / `freebie` rows are written **server-side** when the existing
  `set` action sees punches go up. Multi-punches emit one row each; freebies
  fire when a tab's punch count reaches `TAB_TOTALS[tab]` from below.
  Decreases (the 10→0 celebration reset) emit nothing.
- `social` rows are written by the `click` action, fired by the client
  whenever a customer taps an icon in the social hub.
- `scan` rows are written by the `scan` action, fired by the client on
  first load when the URL carries `?ref=qr` — i.e. the visitor arrived via
  a scanned QR code. The client strips the param after firing so reloads
  don't double-count.

All five of the dashboard questions you'd ask (punches per type per range,
freebies per type, social tap totals) are a single pivot over this log.

### `report` sheet — pre-built dashboard

Created by running `setupReport()` from the Apps Script editor (one-time).
The sheet has yellow-highlighted input cells at the top (`From date`, `To
date`, `From hour`, `To hour`) and computed metric rows below — punches /
freebies / social taps / scans, all filtered by the input range, plus
completion-rate derivations.

Re-running `setupReport()` is safe: it clears and rebuilds the sheet.
Useful after schema changes.

## Security & caveats

- The Apps Script URL is effectively a "key" — anyone who has it can read/write
  any user's state if they know (or can guess) a 6-char code. Code space is
  32^6 ≈ 1.07 billion (alphabet excludes 0/O and 1/I), so guessing is
  impractical, but it is not strong auth.
  Fine for a small-cafe loyalty card; not fine for anything sensitive.
- Apps Script free quota is plenty for this scale (thousands of requests/day).
- If you ever leak the URL and want to invalidate it, create a new deployment
  → update `BACKEND_URL` in `src/app.js` → ship. Old deployments keep serving
  unless you delete them from `Manage deployments`.
