# JobRadar features and data contract
The design phase reads this file. Each feature: what it does, fields, edge cases, status.

## Free AI scoring (Groq)
- Groq `openai/gpt-oss-120b` scores 1 to 5. Gemini is the backup. No key means keyword scores.
- Top-level `scoring`: `{scorer, scored, errors, last_error, note}`. UI should show a warning when `errors > 0` or `scorer == "keywords"`.
- Per job: `score`, `score_method` (`groq` | `gemini` | `keywords`), `score_stale` (true = resume or posting changed, re-score pending).
- Status: backend done.

## Explicit sponsorship only
- The scraper drops every job that doesn't explicitly mention H-1B, OPT, STEM OPT, CPT or visa sponsorship. Any negative wording ("without sponsorship", "not eligible", "security clearance") drops it too, even if it also says it sponsors.
- Per job `sponsorship`: `{status: "yes", types: ["h1b"|"opt"|"stem_opt"|"cpt"|"general"], quote, caveat}`. `quote` is the text around the match, for showing proof. `caveat` is set when the posting hedges ("not for every role"), and is also copied into `flags`.
- `company_h1b` is the old company hint, display only.
- Health per company adds `dropped_no_sponsor` and `dropped_not_us`.
- Edge cases: "CPT codes" (medical billing) and "opt in" don't count. OPT/CPT need visa words within 80 chars.
- Expect low volume. Most postings say nothing about sponsorship. More companies in `config/companies.json` = more jobs.
- UI impact: the old sponsorship segmented control (Hide no-sponsor / Sponsors + likely / Show all) has no purpose now. Replace with a type filter (H-1B, OPT/STEM OPT, CPT, General) and show `quote` on the card.
- Status: backend done.

## US only, region filter
- Non-US jobs are dropped. Multi-location jobs stay if any location is in the US.
- Top-level `regions`: order of filter chips, from `settings.region_order`: TX, CA, WA, NYC, PA, Remote US, Other US.
- Per job `location_info`: `{us: true, states: ["TX"], remote_us: bool, regions: ["TX", "Remote US"]}`. A job can be in several regions. NYC means New York City only. Other NY state goes to Other US. DC goes to Other US.
- Bare "Remote" counts as Remote US only if the description mentions the United States.
- UI: multi-select chips in that order, with counts. Default all on. Sort feed by first matching top region, then score.
- Status: backend done.

## Resumes page (one per track)
- Files: `config/resumes/swe.md`, `pm.md`, `ops.md`, plain text, up to 4000 chars used. Missing track falls back to `config/profile.json`.
- Each job is scored against the resume for its `family`. Per job `resume_track`: `swe` | `pm` | `ops` | `profile`.
- Top-level `resumes`: `{swe: {present, chars}, pm: {...}, ops: {...}}`.
- Pushing a resume triggers the scan workflow, which re-scores that track (capped by `max_new_scores_per_run`; the rest stay `score_stale` until the next run).
- Privacy: repo must be private. Pages deploys only `*.html, *.js, *.css, data/jobs.json` (pages.yml), so `config/` is never served.
- Page flow (to design): pick track > drop PDF/DOCX or paste text > text is extracted in the browser > editable preview > strip email, phone, address > Save commits the file via the GitHub contents API.
- Auth: fine-grained personal access token, this repo only, Contents read/write. Stored in the browser's localStorage, entered once on the page.
- Page shows per track: present or missing, last saved, char count, and "Scan running" after saving.
- Status: backend done, page not built.
