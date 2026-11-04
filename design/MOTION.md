# Motion
Only transform and opacity animate. No `transition: all`, no ease-in. Reduced motion removes movement and keeps opacity.
| Animation | Purpose | Frequency | Duration, easing | Reduced motion |
| --- | --- | --- | --- | --- |
| Button press scale(.97) | Confirms the tap | constant | 120ms ease-out | none |
| Toast in / out | Shows what changed, offers Undo | occasional | 300ms in, 160ms out, ease-out | opacity only |
| Deck card follow and snap-back | Direct manipulation of the swipe | tens per day | 1:1 while dragging, 300ms ease-out on release | n/a, buttons do the same |
| Refresh icon spin | Shows a fetch is running | occasional | 900ms linear, loops while loading | static, dimmed |
| Radar sweep and blip ping | Marks a new scan | once per scan | 900ms sweep, 40ms stagger | none |
| Row selection, keyboard triage, palette | Too frequent to animate | 100+ per day | instant | instant |
