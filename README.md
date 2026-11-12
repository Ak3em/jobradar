# JobRadar
Static site plus a scheduled scraper. No server.

## Setup
1. Push this folder to a **private** GitHub repo. Pages on a private repo needs GitHub Pro, which is free with the GitHub Student Developer Pack.
2. Get a free Groq key at console.groq.com > API Keys (no card needed).
3. Settings > Secrets and variables > Actions > New secret: `GROQ_API_KEY`. Optional backup: `GEMINI_API_KEY`.
4. Settings > Pages > Source: **GitHub Actions**. `pages.yml` publishes only the site files and `data/jobs.json`. `config/` (resumes, profile) is never served. The Pages URL itself is public even on a private repo, so this matters.
5. Actions tab > scan > Run workflow. First run replaces the sample data.
6. Check the Sources tab in the app. Any company with an ERROR has a wrong slug in `config/companies.json`.

## Edit without touching code
- `config/companies.json`: add companies (`ats` is greenhouse, lever, or ashby; `slug` is the name in their board URL).
- `config/profile.json`: your resume summary. It is public if the repo is public. Keep contact info out.
- `config/settings.json`: score threshold, age limits, scorer, model names, scoring cap per run, `region_order` for the filter chips.
- `config/resumes/swe.md`, `pm.md`, `ops.md`: one resume per track. Each job is scored against its track's resume, falling back to `profile.json`. Pushing a change here starts a scan.

## Filters (in the scraper)
- US only. Multi-location jobs stay if any location is in the US. Regions: TX, CA, WA, NYC, PA, Remote US, Other US.
- Explicit sponsorship only: the posting has to mention H-1B, OPT, STEM OPT, CPT or visa sponsorship, with no negative wording. Expect a small feed. Add companies to grow it.
- The Sources tab data (`health`) shows `dropped_no_sponsor` and `dropped_not_us` per company.

## Scoring
- `scorer` in settings picks the AI: `groq` (default, free) or `gemini`. If that key is missing, the other one is used. If neither is set, scores fall back to keyword overlap.
- Free Groq limits are roughly 30 requests/min, 8k tokens/min and 200k tokens/day. `seconds_between_scores: 20` and `max_new_scores_per_run: 40` keep a run inside that.
- Scores are cached in `data/scores.json`. Jobs scored by keywords get re-scored by AI on the next run with a working key.
- `data/jobs.json` has a `scoring` block (scorer, scored count, errors, last error). If AI scoring breaks, that's where it shows up. The Actions log prints it too.
- After 3 failed calls in a row, the run stops calling the AI and uses keyword scores for the rest.

## Run locally
1. Copy `.env.example` to `.env` and paste your key (`.env` is gitignored).
2. `pip install requests && python scraper/scrape.py`
3. Filter tests: `python tests/test_filters.py`

## Front end
- `index.html` + `app.js` is the base app. `ux.js` + `ux.css` layer on top: sponsorship control, pipeline strip, swipe Triage mode.
- Statuses and notes live in your browser (localStorage key `jr2`, migrated from `jr`). Use Export tracker to back them up. They do not sync across devices.
- Feature and data contract: `docs/FEATURES.md`.
- Design rules: `design/DESIGN.md` and the token files in `design/`. Build brief: `docs/UI-PROMPT.md`.
