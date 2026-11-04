# JobRadar
Static site plus a scheduled scraper. No server.

## Setup
1. Push this folder to a GitHub repo.
2. Settings > Secrets and variables > Actions > New secret: `GEMINI_API_KEY` (free key from Google AI Studio).
3. Settings > Pages > Deploy from branch `main`, folder `/ (root)`.
4. Actions tab > scan > Run workflow. First run replaces the sample data.
5. Check the "Run health" button in the app. Any company with an ERROR has a wrong slug in `config/companies.json`.

## Edit without touching code
- `config/companies.json`: add companies (`ats` is greenhouse, lever, or ashby; `slug` is the name in their board URL).
- `config/profile.json`: your resume summary. It is public if the repo is public. Keep contact info out.
- `config/settings.json`: score threshold, age limits, Gemini model name, scoring cap per run.

## Notes
- Scoring uses Gemini when the key is set, keyword overlap otherwise. Scores are cached in `data/scores.json`.
- Statuses and notes live in your browser (localStorage). Use Export tracker to back them up.
