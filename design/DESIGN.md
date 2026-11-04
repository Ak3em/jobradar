# JobRadar design system
Source of truth for tokens: `design/tokens-light.json` and `design/tokens-dark.json` (W3C DTCG). CSS variables in `index.html` must match them.

**Look:** flat, dense, no shadows except the selected segment ring. Fira Sans for text, Fira Code for numbers. One radius (10px) plus pills (99px).
**Color roles:** primary = actions and selection. Sponsorship colors (sponsors, likely, unclear, no-sponsor) are used only for sponsorship status and always paired with an icon and a text label.
**Motion:** ease-out `cubic-bezier(.23,1,.32,1)`. Press 160ms (scale .97). Card entrance 300ms, 50ms stagger, first 6 cards, only when the view changes. Drag settle 300ms `cubic-bezier(.32,.72,0,1)`. Keyboard actions never animate. Reduced motion removes all of it.
**Touch:** 44px minimum targets, hover styles only under `(hover:hover) and (pointer:fine)`, `touch-action: manipulation` on buttons, `100dvh` for full-screen layers, safe-area insets on fixed bars.
**Drift check:** run the `design-check` workflow after deploys. It compares rendered colors, radii and font sizes with the token files.
