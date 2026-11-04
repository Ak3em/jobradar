# Engineer prompt: JobRadar UI v2

## Role and context
You are a senior design engineer working in the JobRadar repo (static site: `index.html`, `app.js`, GitHub Actions scraper writes `data/jobs.json`). The user is a May 2027 CS graduate on an F-1 visa who needs entry-level SWE, PM/TPM, and operations roles. Work authorization is the product's headline value. Do not change the scraper or data shape.

## Product problem
Job hunting is a triage problem, not a browsing problem. The user opens the app for 2 minutes at a time, usually on a phone, and needs to (1) see only roles that can sponsor, (2) decide fast, (3) never lose track of where each application stands.

## Principles
1. Sponsorship status is the first thing read on every card, never color alone (icon + label + reason).
2. Fast decisions: one gesture or one key per decision.
3. Motion explains state change, never decorates. Anything repeated all day (keyboard actions, filter changes) does not animate.
4. Works on real phones: no sticky hover, no tap flash, no zoom on inputs, safe areas respected.
5. Survives bad data: very long titles, empty fields, 0 results, 500 jobs.

## Build (all in `ux.css` and `ux.js`, layered over `app.js`; do not rewrite `app.js`)
**A. Sponsorship segmented control** replaces the select. Options: Hide no-sponsor (default), Sponsors + likely, Show all. Radiogroup semantics, 44px targets, state mirrors the hidden select.
**B. Pipeline strip** under the stats: Saved, Started, Applied counts with a proportional bar. Each is a button that opens that tab.
**C. Triage mode** (button in tools row). Full-screen, one card at a time from the current filtered feed.
- Drag right = Save, left = Pass. Commit at 110px or velocity > 0.11 px/ms (with 30px minimum). Friction past 120px (35% rate). Pointer capture, ignore a second pointer.
- Release below threshold springs back, 300ms `cubic-bezier(.32,.72,0,1)`. Commit exit 220ms `cubic-bezier(.23,1,.32,1)`.
- Hint labels (Pass/Save) fade in with drag distance.
- Keyboard: Left = pass, Right = save, O = open, Esc = close. Keyboard decisions are instant, no animation.
- Footer buttons (Pass, Open, Save) for non-gesture users. Page behind is `inert`, focus returns to the Triage button on close.
- End state: "Inbox zero" or "Nothing to triage".
**D. Polish:** press feedback `scale(.97)` 160ms; hover only under `(hover:hover) and (pointer:fine)`; `-webkit-tap-highlight-color: transparent`; `touch-action: manipulation` on buttons; `tabular-nums` on all counts and scores; `overflow-wrap:anywhere` on titles and companies; posted dates older than 7 days show an absolute date ("Posted Oct 12"); card entrance stagger (300ms, 50ms steps, first 6 only, only when tab or filters change); `100dvh` and safe-area insets on the overlay; theme-color per color scheme.
**E. Reduced motion:** every animation off, gestures still work.

## Acceptance checks
- 375px wide: no horizontal scroll, all targets 44px or taller, bottom tab bar clear of the home indicator.
- Keyboard-only: filters, tabs, triage all reachable, visible focus ring.
- Contrast 4.5:1 for text in light and dark.
- Worst-case: 200-character title, empty `matches`, 0 jobs, 500 jobs render without layout breaks or jank.
- Status changes still offer Undo.

## Design system
Tokens live in `design/tokens-*.json` and `design/DESIGN.md`. New UI must use existing CSS variables. After deploy, run the `design-check` workflow to catch off-token colors, radii, and font sizes.
