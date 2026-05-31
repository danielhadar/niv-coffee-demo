---
description: Ship Niv Cafe (punch card + deal redemption) to prod — commit pending work, push to origin/main, and verify the live site picks up the change
---

You are shipping the Niv Cafe site to production. "Prod" means `origin/main` on GitHub — pushing there triggers a GitHub Pages rebuild. The site hosts **two** apps:

- **Punch card** (the original `/` landing page) at <https://niv-coffee-deal.danielhadar.com>
- **Store-deal redemption** at <https://niv-coffee-deal.danielhadar.com/deal/>

Both share the same Apps Script backend (the `BACKEND_URL` in `src/app.js` and `deal/app.js`), the same `assets/`, and the same accessibility widget under `vendor/negishut/`.

## Goal

Get everything the user is working on onto `origin/main`, safely, with a sensible commit message. Finish with a clean working tree, local in sync with origin, and the live site serving the new build.

## Steps

**1. Survey state.** Run `git status` and `git log origin/main..HEAD --oneline` and `git fetch origin` in parallel.

**2. Handle stale locks.** If any git command fails with `Unable to create '.git/*.lock': File exists` and no git processes are running (`ps aux | grep -v grep | grep -i git`), the lock is stale — remove and retry.

**3. Decide what to commit.**
- Modified tracked files → stage with explicit paths (not `git add -A`).
- New untracked files → only stage things that are clearly part of the project (HTML/CSS/JS/images, manifest changes). Be cautious about ad-hoc files like scratch demos (`*-demo.html`), local notes, scripts, screenshots. When in doubt, ask.
- **Never** stage anything containing secrets. The `PUNCH_CODE` in `app.js` is by design ("private" means not on the public GitHub UI; it is necessarily visible in the deployed JS bundle to anyone visiting the site). Don't add server-side secrets or `.env`-style files to the repo without asking.

**4. Cache-bust changed assets.** This is non-negotiable. Browsers can serve a stale `style.css` / `app.js` / `logo.png` for many minutes after the file actually changes on the server, and visitors hit a half-broken UI (e.g. social hub fell back to default `<a>` styling because the new CSS rules weren't loaded — happened once, never again). Before committing:

- For each file in the staged diff that is referenced from HTML by a query-versioned URL — i.e. `src/style.css`, `src/app.js`, `deal/style.css`, `deal/app.js`, `assets/manifest.json`, `assets/logo.png`, `assets/favicon.png`, `assets/apple-touch-icon.png`, `assets/icon-192.png`, `assets/icon-512.png` — bump the `?v=N` query string everywhere it's referenced in HTML.
- The convention here is one shared integer (`?v=3`, `?v=4`, …) bumped each time *any* of those files change. Don't try to track per-file versions; it's not worth the bookkeeping.
- Fast way to find the references: `grep -rn '?v=' *.html deal/*.html`. Bump them all in lockstep with `sed` or one Edit `replace_all`. Re-grep after to confirm zero stragglers.
- New asset added with no query string yet? Add `?v=<current-N>` to its reference at the same time.
- Stage the bumped HTML files alongside the asset change in the same commit. The whole point is that the version bump and the asset change land together.

If a commit only touches files that are not query-versioned (e.g. `README.md`, `.claude/commands/*`, `CNAME`), skip this step.

**5. Write the commit message.**
- Match the repo's existing style: lowercase, short subject, no trailing period. Multiple concerns separated by semicolons or commas.
- Use a body (HEREDOC) only when there are multiple distinct changes worth itemizing.
- Examples of the style:
  - `palette: switch to olive grove (green #3F5C38)`
  - `mobile: remove top white padding under header`
  - `qr: point card to live url; bump theme color`

**6. Handle divergence.** If push is rejected because remote has commits you don't:
- Show the user what's on the other side (`git log HEAD..origin/main --oneline`, `git diff --name-only HEAD...origin/main`).
- If it's clean (no conflict overlap) → `git pull --rebase origin main` and push.
- If there are real conflicting edits → stop and show the user before doing anything.

**7. Push.** `git push origin main`. Then `git status` to confirm clean + tracking up to date.

**8. Verify the live site.** After push, give GitHub Pages ~60–90s to rebuild, then probe both apps:
- Punch card: `curl -sI https://niv-coffee-deal.danielhadar.com/ -o /dev/null -w "%{http_code}\n"` — should be `200`.
- Deal app: `curl -sI https://niv-coffee-deal.danielhadar.com/deal/ -o /dev/null -w "%{http_code}\n"` — should be `200`.
- Optionally fetch a known string from the latest change to confirm content swapped (e.g. `curl -s https://niv-coffee-deal.danielhadar.com/src/style.css | grep -m1 "<some new selector>"`, or for deal changes `curl -s https://niv-coffee-deal.danielhadar.com/deal/style.css | grep -m1 "..."`). If you cache-busted in step 4, also fetch the asset with the new version string and confirm it serves: `curl -sI 'https://niv-coffee-deal.danielhadar.com/src/style.css?v=N' -o /dev/null -w "%{http_code}\n"` should be `200`.
- If it's still serving the old build, wait another 30–60s and re-probe. The build status itself can also be checked with `gh api repos/danielhadar/niv-coffee-demo/pages/builds/latest --jq '.status'` — `built` means the new version is live.

**9. Report.** Tell the user:
- Which commits went to origin (SHA range, one-line subjects).
- Confirmation the live URL is serving the new build (or the latest probe status if still building).

## Guardrails

- **Never** `--force` push. If something seems off, stop and explain.
- **Never** skip hooks (`--no-verify`) unless the user explicitly asks.
- **Don't** stage `.DS_Store`, `node_modules/`, or anything ignored — they're already in `.gitignore`, but new patterns may appear.
- **Don't** run destructive operations (`reset --hard`, `clean -f`, branch deletions) without explicit confirmation. If the working tree looks unexpectedly dirty, investigate — could be in-progress work.
- If the user has unpushed local commits unrelated to the current intent, flag before pushing.
- If there's no work to ship (nothing staged, nothing unpushed), say so and stop. Don't create empty commits or fake activity.

## Scope notes

- This is a static site (vanilla HTML/CSS/JS, no build step). Pushing to `main` is enough to trigger a deploy — there's nothing to compile, install, or test before the push.
- The repo is **public** — same arrangement as `matkonim`. The punch-card `PUNCH_CODE` in `src/app.js` is necessarily visible to anyone who visits the live site (client-side code), so private-repo'ing it would not actually hide the secret. The **deal app's** `STORE_PIN` / `NIV_PIN` are NOT in the JS bundle — they live only in `backend/Code.gs` (server-side validation), so they don't leak from the client.
- DNS lives in Cloudflare. `niv-coffee-deal.danielhadar.com` is a CNAME record pointing to `danielhadar.github.io`. Pages reads the domain from the `CNAME` file in the repo root.
- The two **QR poster** pages (`qr-code.html` for the punch card, `deal-qr.html` for the deal app) encode hardcoded full URLs (`https://niv-coffee-deal.danielhadar.com/` and `.../deal/`). If the domain ever changes, both must be updated alongside `CNAME`.
- Backend changes to `backend/Code.gs` are **not** picked up by `git push` — Apps Script is deployed separately. After committing/pushing a `backend/Code.gs` change, paste the file into the Apps Script editor and run `Deploy → Manage deployments → New version`. The web app URL stays the same.
