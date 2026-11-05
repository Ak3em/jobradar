"""JobRadar scraper. Pulls postings from company boards, filters, flags, scores, writes data/jobs.json."""
import hashlib, html, json, os, re, sys, time
from datetime import datetime, timezone
from pathlib import Path
import requests

# Optional local .env (gitignored) so you can run without typing the key each time
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for _l in _env.read_text().splitlines():
        if "=" in _l and not _l.startswith("#"):
            _k, _v = _l.split("=", 1); os.environ.setdefault(_k.strip(), _v.strip())

ROOT = Path(__file__).resolve().parent.parent
CFG, DATA = ROOT / "config", ROOT / "data"
load = lambda p: json.loads(Path(p).read_text())
S, PROFILE, COMPANIES = load(CFG / "settings.json"), load(CFG / "profile.json"), load(CFG / "companies.json")
HDR = {"User-Agent": "JobRadar/1.0 (personal job search)"}
NOW = datetime.now(timezone.utc)

def clean(t): return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html.unescape(t or ""))).strip()
def get(url, **kw): r = requests.get(url, headers=HDR, timeout=30, **kw); r.raise_for_status(); return r

def fetch_greenhouse(slug):
    for j in get(f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true").json().get("jobs", []):
        yield dict(id=f"gh-{slug}-{j['id']}", title=j["title"], url=j["absolute_url"], location=(j.get("location") or {}).get("name", ""),
                   posted=j.get("first_published") or j.get("updated_at"), desc=clean(j.get("content")))

def fetch_lever(slug):
    for j in get(f"https://api.lever.co/v0/postings/{slug}?mode=json").json():
        ts = datetime.fromtimestamp(j["createdAt"] / 1000, timezone.utc).isoformat() if j.get("createdAt") else None
        yield dict(id=f"lv-{slug}-{j['id']}", title=j["text"], url=j["hostedUrl"], location=(j.get("categories") or {}).get("location", ""),
                   posted=ts, desc=clean((j.get("descriptionPlain") or "") + " " + (j.get("additionalPlain") or "")))

def fetch_ashby(slug):
    for j in get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}").json().get("jobs", []):
        yield dict(id=f"ab-{slug}-{j['id']}", title=j["title"], url=j.get("jobUrl", ""), location=j.get("location", ""),
                   posted=j.get("publishedAt"), desc=clean(j.get("descriptionPlain") or j.get("descriptionHtml")))

FETCH = {"greenhouse": fetch_greenhouse, "lever": fetch_lever, "ashby": fetch_ashby}

# ---------- filters ----------
EXCL_TITLE = re.compile(r"\b(intern|internship|senior|sr\.?|staff|principal|lead|director|vp|vice president|head of|manager ii|iii|iv)\b", re.I)
FAMILIES = {
    "swe": re.compile(r"software|developer|backend|frontend|full.?stack|machine learning|data engineer|\bsde\b|engineer", re.I),
    "pm": re.compile(r"product manager|program manager|technical program|\btpm\b|product management", re.I),
    "ops": re.compile(r"operations|operational|analyst|underwriting|claims|business analyst", re.I),
}
ENTRY = re.compile(r"new grad|new graduate|university grad|graduate program|early career|early talent|entry.?level|class of 2027|2027|recent graduate|associate|analyst|engineer (i|1)\b|rotational", re.I)
OTHER_YEAR = re.compile(r"(class of|graduat\w*( in| by)?|summer|fall)\s*(2025|2026|2028)", re.I)
YEARS = re.compile(r"(\d+)\+?\s*(?:-\s*\d+\s*)?years?[^.]{0,40}experience", re.I)
NEG = re.compile(r"(no|not|unable to|cannot|can't|won't|will not)\s+(offer\s+|provide\s+|able to\s+)?(visa\s+)?sponsor\w*|without (the need for )?(current or future )?(visa )?sponsorship|u\.?s\.? citizens? only|security clearance|must be a (u\.?s\.? )?citizen", re.I)
POS = re.compile(r"(visa|h-?1b|work) sponsorship (is )?(available|provided|offered)|will (provide )?sponsor|we (do )?sponsor|sponsor(s)? (work )?visas|\bf-?1\b|stem opt", re.I)
EVERGREEN = re.compile(r"talent (community|pool|network)|future opportunities|general application|evergreen|pipeline of", re.I)

def family(title):
    for k, rx in FAMILIES.items():
        if rx.search(title): return k
def sponsorship(text, h1b_hint):
    m = NEG.search(text)
    if m: return {"status": "no", "reason": f"Posting says: \"{m.group(0)}\""}
    m = POS.search(text) or re.search(r"\bOPT\b", text)
    if m: return {"status": "yes", "reason": f"Posting mentions: \"{m.group(0)}\""}
    if h1b_hint == "yes": return {"status": "likely", "reason": "Not stated in posting. Company has a history of H-1B filings (verify)."}
    return {"status": "unclear", "reason": "Not stated in posting."}
def age_days(posted):
    try: return (NOW - datetime.fromisoformat(posted.replace("Z", "+00:00"))).days
    except Exception: return None

def keep(j, company):
    t, text = j["title"], j["title"] + " " + j["desc"]
    if EXCL_TITLE.search(t) or any(x.lower() in j["location"].lower() for x in S["exclude_locations"]): return None
    fam = family(t)
    if not fam or not ENTRY.search(t + " " + j["desc"][:1500]): return None
    if any(int(n) >= 3 for n in YEARS.findall(j["desc"])): return None
    if OTHER_YEAR.search(text) and "2027" not in text: return None
    a = age_days(j["posted"]) if j["posted"] else None
    if a is not None and a > S["max_age_days"]: return None
    flags = []
    if a is None: flags.append("Age unknown")
    elif a > S["flag_age_days"]: flags.append(f"Posted {a} days ago")
    if EVERGREEN.search(text): flags.append("Evergreen wording (possible ghost job)")
    return dict(j, company=company["name"], family=fam, age_days=a, grad_year="2027" if "2027" in text else "unspecified",
                sponsorship=sponsorship(text, company.get("h1b")), flags=flags, source=f"{company['ats']}:{company['slug']}")

def link_ok(url):
    try:
        r = requests.get(url, headers=HDR, timeout=20, stream=True); r.close(); return r.status_code < 400
    except Exception: return False

# ---------- scoring ----------
def fallback_score(desc):
    skills = [s.lower() for s in PROFILE["skills"]]
    hits = [s for s in skills if s in desc.lower()]
    return round((1 + 4 * min(len(hits) / 5, 1)) * 2) / 2, [f"Mentions {h}" for h in hits[:2]], []

def score_prompt(j, max_desc=6000):
    return ("Score how well this candidate fits this job from 1 to 5 in 0.5 steps. Be strict and honest. "
            "Return JSON only, no prose: {\"score\": number, \"matches\": [two short strings], \"gaps\": [up to three short strings], \"actions\": [one concrete next step per gap, same order]}.\n\n"
            f"CANDIDATE:\n{json.dumps(PROFILE)}\n\nJOB: {j['title']} at {j['company']}\n{j['desc'][:max_desc]}")

def parse_score(text):
    m = re.search(r"\{.*\}", text, re.S)
    out = json.loads(m.group(0) if m else text)
    s = max(1.0, min(5.0, round(float(out["score"]) * 2) / 2))
    return s, out.get("matches", [])[:2], out.get("gaps", [])[:3], out.get("actions", [])[:3]

def groq_score(j, key):
    # Free tier is about 8k tokens/min and 200k/day, so the prompt stays short and calls are spaced out
    body = {"model": S.get("groq_model", "openai/gpt-oss-120b"), "temperature": 0.2, "max_completion_tokens": 1200,
            "reasoning_effort": "low", "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": score_prompt(j, 3500)}]}
    for attempt in range(3):
        r = requests.post("https://api.groq.com/openai/v1/chat/completions",
                          headers={"Authorization": f"Bearer {key}"}, json=body, timeout=60)
        if r.status_code == 429 and attempt < 2:
            time.sleep(min(float(r.headers.get("retry-after", 30)), 90)); continue
        if r.status_code >= 400: raise RuntimeError(f"Groq {r.status_code}: {r.text[:200]}")
        break
    return parse_score(r.json()["choices"][0]["message"]["content"])

def gemini_score(j, key):
    prompt = score_prompt(j)
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{S['gemini_model']}:generateContent"
    body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2}}
    for attempt in range(2):
        r = requests.post(url, headers={"x-goog-api-key": key}, json=body, timeout=60)
        if r.status_code == 429 and attempt == 0: time.sleep(35); continue
        if r.status_code >= 400: raise RuntimeError(f"Gemini {r.status_code}: {r.text[:200]}")
        break
    return parse_score(r.json()["candidates"][0]["content"]["parts"][0]["text"])

def pick_scorer():
    """Returns (name, fn, key). Order follows settings.scorer, falls back to whichever key exists."""
    keys = {"groq": os.environ.get("GROQ_API_KEY"), "gemini": os.environ.get("GEMINI_API_KEY")}
    fns = {"groq": groq_score, "gemini": gemini_score}
    pref = S.get("scorer", "groq")
    for name in [pref] + [n for n in fns if n != pref]:
        if keys.get(name): return name, fns[name], keys[name]
    return None, None, None

def main():
    old = load(DATA / "jobs.json") if (DATA / "jobs.json").exists() else {"jobs": []}
    first_seen = {j["id"]: j.get("first_seen") for j in old.get("jobs", [])}
    cache_path = DATA / "scores.json"
    cache = load(cache_path) if cache_path.exists() else {}
    scorer, score_fn, key = pick_scorer()
    health, jobs, seen = {}, [], set()
    scoring = {"scorer": scorer or "keywords", "scored": 0, "errors": 0, "last_error": None,
               "note": None if scorer else "No GROQ_API_KEY or GEMINI_API_KEY set. Using keyword fallback."}

    for c in COMPANIES:
        try:
            raw = list(FETCH[c["ats"]](c["slug"]))
            kept = [k for j in raw if (k := keep(j, c)) and k["id"] not in seen]
            health[c["name"]] = {"fetched": len(raw), "kept": len(kept), "error": None}
            for k in kept: seen.add(k["id"]); jobs.append(k)
        except Exception as e:
            health[c["name"]] = {"fetched": 0, "kept": 0, "error": str(e)[:160]}
        time.sleep(1)

    if S["verify_links"]: jobs = [j for j in jobs if link_ok(j["url"])]

    new_scores, fails_in_row = 0, 0
    for j in jobs:
        h = hashlib.md5((j["title"] + j["desc"]).encode()).hexdigest()
        c = cache.get(j["id"])
        stale = not c or c["hash"] != h
        # Upgrade keyword scores once an AI scorer is available
        needs_ai = stale or (key and c.get("method") == "keywords")
        if needs_ai and key and new_scores < S["max_new_scores_per_run"] and fails_in_row < 3:
            try:
                s, m, g, a = score_fn(j, key); new_scores += 1; fails_in_row = 0
                c = {"hash": h, "score": s, "matches": m, "gaps": g, "actions": a, "method": scorer}
                time.sleep(S["seconds_between_scores"])
            except Exception as e:
                fails_in_row += 1; scoring["errors"] += 1; scoring["last_error"] = str(e)[:240]
                print("Scoring error:", e, file=sys.stderr)
        if not c or c["hash"] != h:
            s, m, g = fallback_score(j["desc"]); c = {"hash": h, "score": s, "matches": m, "gaps": g, "method": "keywords"}
        cache[j["id"]] = c
        j.update(score=c["score"], matches=c["matches"], gaps=c["gaps"], actions=c.get("actions", []), score_method=c["method"])
        j["first_seen"] = first_seen.get(j["id"]) or NOW.isoformat()
        j["last_seen"] = NOW.isoformat()
        j["desc"] = j["desc"][:3000]

    jobs.sort(key=lambda j: (-j["score"], j["age_days"] if j["age_days"] is not None else 999))
    scoring["scored"] = new_scores
    cache = {k: v for k, v in cache.items() if k in seen}
    DATA.mkdir(exist_ok=True)
    cache_path.write_text(json.dumps(cache))
    (DATA / "jobs.json").write_text(json.dumps({"generated_at": NOW.isoformat(), "min_score": S["min_score"], "health": health, "scoring": scoring, "jobs": jobs}, indent=1))
    print(f"Wrote {len(jobs)} jobs. Scorer: {scoring['scorer']}, AI-scored this run: {new_scores}, errors: {scoring['errors']}. "
          f"Sources with errors: {[k for k, v in health.items() if v['error']]}")
    if scoring["last_error"]: print("Last scoring error:", scoring["last_error"])

if __name__ == "__main__": main()
