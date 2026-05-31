# מבצע שש — prepaid 6-pack (deal-6) — design

**Date:** 2026-05-31
**Status:** approved (design); plan + implementation pending
**Surface:** punch-card app (`/`, `src/app.js` + `index.html` + `src/style.css`), backend (`backend/Code.gs`)

## Summary

Add a second tab — **"מבצע שש!"** — to the punch-card app, next to the existing
**"כריך + קפה"** tab. It sells a **prepaid 6-pack** of כריך+קפה: the customer pays
**225 ₪** (instead of 247.5 ₪) at the register, hands Niv the phone, Niv activates
the pack with the staff code, and the customer then has a 6-slot punch card that
fills as the prepaid items are consumed. When the pack is finished it resets so a
new pack can be bought.

This is the second of two sprints from the original request; Sprint A (single
כריך+קפה card, owner dashboard, report endpoint, onboarding strings) already shipped.

## Decisions (locked)

- **Pack identity code:** reuse the existing **6-char identity code** (the one shown
  in "הכרטיס שלי"). It's displayed persistently in the pack tab with a copy button.
  The pack is tracked against this code, so restoring it on another device restores
  the remaining pack. No separate pack code.
- **Approval code:** the **staff punch code (2552)** — same code used to punch.
  Accepted trade-off: 2552 lives in the client JS, so a determined customer could
  self-activate a free pack. For a small cafe where staff hold the phone at the
  register the practical risk is low, and it keeps one code for everything. Swapping
  to a server-side PIN later is a localized change (validate in `handleSet_`/a new
  endpoint instead of client-side).
- **Final state (6/6):** brief celebration + "החבילה הסתיימה, תודה! 🎉", then the tab
  reverts to the pre-purchase state (cyclic — buy another pack).
- **Punch direction:** card **fills up 0 → 6** (same as the normal card); the
  confirmation text shows remaining = `6 − punches`.
- **Tab label:** "מבצע שש!" with an emoji on its own row (🎟️ unless changed).

## Tab structure

Extend the `TABS` config with a `type` field:

- `type: "punch"` — the existing כריך+קפה tab (unchanged behaviour).
- `type: "pack"` — the new deal-6 tab. Config carries: label, emoji, `code: "2552"`,
  `total: 6`, `storageKey` (e.g. `niv_pack6`), and pricing strings (225 / 247.5).

The tab nav already supports N tabs. The content area renders by the active tab's
`type`: a `punch` tab renders today's card; a `pack` tab renders one of three
sub-states.

## Pack sub-states

State is `{ active: bool, punches: int (0..6), shapeIndices }` for the pack tab,
persisted in localStorage under its `storageKey` and synced to the backend (carried
in the state blob). `active === false` ⇒ pre-purchase; `active === true` ⇒ eligible.
Reaching `punches === 6` triggers completion → reset to `active: false, punches: 0`.

**1. Pre-purchase** (`active === false`)
- Explainer text with the offer and price: **225 ₪** with ~~247.5 ₪~~ struck through
  (mirrors the deal-screen price styling), plus the saving (22.5 ₪).
- A CTA **"הפעלת חבילה"** that opens an activation popup.
- The punch card / stepper / code input are hidden in this state.

**2. Active / eligible** (`active === true`, `punches < 6`)
- Green-check confirmation: "החבילה פעילה ✓ — נותרו לך X מתוך 6" (X = 6 − punches).
- The customer's 6-char identity code shown persistently with a copy button (reuses
  `iconCopy()` / `handleCopyCode()`).
- The 6-slot punch card (`renderSVGSlots`), the +/- stepper, the code input, and the
  punch CTA — identical to the normal tab. Staff enters 2552 to add punches.
- **No "חצי מחיר" reward banner** on the pack card — that banner is specific to the
  punch tab's half-price reward slot. `renderSVGSlots` must gate the reward banner on
  tab type (`punch` only); the pack card renders plain slots.

**3. Done** (`punches` reaches 6)
- Reuse the celebration overlay with pack copy ("החבילה הסתיימה, תודה! 🎉" — carried
  on the pack tab's own `celebrate` field). On dismiss, the reset must be tab-aware:
  the punch tab resets to `{ punches: 0 }` (fresh card), while the pack tab resets to
  `{ active: false, punches: 0, shapeIndices: new }` and re-renders to pre-purchase.

## Activation flow

- "הפעלת חבילה" CTA → popup (reuses the modal infra) with a code input.
- Niv types **2552**. On match: set pack `active: true, punches: 0`, persist + sync,
  close popup, re-render to the **active** state. On mismatch: shake + error message.
- The sync (`set`) carries the new pack state; the backend diff logs `deal6_purchase`.

## Punch + completion flow

- In the active state, punching reuses `handlePunch` semantics: staff enters 2552,
  picks a quantity with the stepper, punches fill slots toward 6.
- On each successful sync the backend diffs `pack6_punches` old→new and logs one
  `deal6_punch` per increment.
- When `punches` reaches 6: backend logs `deal6_complete`; client shows the
  completion celebration, then resets to pre-purchase.

## Backend changes (`backend/Code.gs`)

Keeps the fire-and-forget `set` / `get` model — **no new endpoints**.

- `codes` sheet gains two columns: `pack6_active`, `pack6_punches`. Update
  `CODES_HEADER`; the existing `ensureHeader_` self-heal rewrites the header on the
  next write. Legacy rows without the columns read as inactive / 0.
- `rowToState_` / `stateToCodeRow_`: include `pack6: { active, punches }` so `get`
  returns it and `set` writes it (restore carries the pack across devices).
- New `logPack6Events_(old, new, now)` called from `handleSet_`:
  - `active` false→true ⇒ `deal6_purchase`
  - `pack6_punches` increase ⇒ one `deal6_punch` per increment
  - `pack6_punches` reaches 6 (was < 6) ⇒ `deal6_complete`
- The report endpoint, `/dashboard/`, and `setupReport` already count
  `deal6_purchase` / `deal6_punch` / `deal6_complete` — so the מבצע שש cards populate
  automatically once events start flowing. No changes there.
- **Deploy:** as with all `Code.gs` changes, redeploy in Apps Script (paste → Manage
  deployments → New version). The `/exec` URL is unchanged.

## Client changes

- `src/app.js`: add the `pack` tab to `TABS` with `type`; add pack-state load/save;
  render the pack-header region (text / checkmark / persistent code + copy / activate
  CTA) and toggle the card+stepper+code by sub-state; activation popup handler;
  completion→reset. Reuse `renderSVGSlots`, the stepper, `handlePunch`,
  celebration overlay, `handleCopyCode`, `backendStateBlob`/sync.
- `index.html`: add the pack-header region markup (hidden by default; shown on the
  pack tab) and the activation popup markup (or render it via the existing modal).
- `src/style.css`: styles for the pack header, price/strikethrough, green check,
  persistent code display.

## Analytics

`deal6_purchase` (packs sold), `deal6_punch` (items consumed), `deal6_complete`
(packs finished) flow into the existing report endpoint → owner dashboard "מבצע שש"
section and the `setupReport` spreadsheet section.

## Cache-busting / ship

`src/app.js`, `src/style.css`, `index.html` change ⇒ bump `?v=20 → v=21` across all
HTML in lockstep at ship time (per the shipit convention). Backend redeploy is a
separate manual step after the push.

## Out of scope

- Server-side approval PIN (decided against for now; 2552 client-side).
- Counting-down display (chose fill-up to match the normal card).
- Partial refunds / pack expiry / multiple concurrent packs per code (a code holds at
  most one active pack at a time).
