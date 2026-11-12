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
# Negative wording always wins over positive wording
NEG = re.compile(r"(no|not|unable to|cannot|can't|won't|will not|does not|do not|doesn't|don't)\s+(currently\s+)?(offer\s+|provide\s+|be able to\s+|able to\s+|support\s+)?(any\s+)?(visa\s+|immigration\s+|employment\s+)?sponsor\w*"
                 r"|not eligible for (visa |immigration )?sponsorship|sponsorship (is )?not (available|offered|provided)"
                 r"|without (the need for )?(current or future |present or future )?(visa |immigration |employer )?sponsorship"
                 r"|u\.?s\.? citizens? only|security clearance|must be a (u\.?s\.? )?citizen|(f-?1|opt|cpt)\s+(candidates|students|holders)?\s*(are )?not eligible", re.I)
# Each type needs visa context so "CPT codes" (medical billing) or "opt in" never count
SPONSOR_TYPES = {
    "h1b": re.compile(r"\bh-?1-?b\b", re.I),
    "stem_opt": re.compile(r"\bstem[\s-]+opt\b", re.I),
    "opt": re.compile(r"\bOPT\b|(?i:optional practical training)"),
    "cpt": re.compile(r"\bCPT\b|(?i:curricular practical training)"),
    "general": re.compile(r"(visa|immigration|work) sponsorship (is )?(available|provided|offered)|will (provide |offer )?(visa |immigration )?sponsor|we (do )?sponsor (work )?visas|we do sponsor|sponsor(s|ship)? (work |employment )?visas|offers? (visa |immigration )?sponsorship", re.I),
}
# Positive mention with a hedge ("not for every role") still counts, but gets a caveat
VISA_CTX = re.compile(r"f-?1|visa|practical training|work authori|student|sponsor|international", re.I)
def visa_hit(rx, text):
    """First match whose surrounding 80 chars talk about visas. Skips CPT codes, opt-in, etc."""
    for m in rx.finditer(text):
        if len(m.group(0)) > 4: return m  # spelled-out phrase is already specific
        if VISA_CTX.search(text[max(0, m.start() - 80): m.end() + 80].replace(m.group(0), " ")): return m
    return None
HEDGE = re.compile(r"not (able to )?(successfully )?sponsor\w* (visas )?for every|aren't able to (successfully )?sponsor\w* (visas )?for every|case[- ]by[- ]case|depending on (the )?role|may not be able to sponsor", re.I)

def sponsorship(text):
    m = NEG.search(text)
    # "aren't able to sponsor for every role" is a hedge, not a no
    if m and not HEDGE.search(text[max(0, m.start() - 60): m.end() + 60]):
        return {"status": "no", "types": [], "quote": m.group(0), "caveat": None, "reason": f"Posting says: \"{m.group(0)}\""}
    types, quote = [], None
    for k, rx in SPONSOR_TYPES.items():
        hit = visa_hit(rx, text) if k in ("opt", "cpt") else rx.search(text)
        if hit:
            types.append(k)
            if not quote:
                s, e = max(0, hit.start() - 60), min(len(text), hit.end() + 80)
                quote = ("..." if s else "") + text[s:e].strip() + ("..." if e < len(text) else "")
    if not types: return {"status": "unstated", "types": [], "quote": None, "caveat": None, "reason": "Not stated in posting."}
    h = HEDGE.search(text)
    return {"status": "yes", "types": types, "quote": quote, "caveat": "Not guaranteed for every role" if h else None,
            "reason": f"Posting says: \"{quote}\""}  # reason kept for the current UI

# ---------- US locations ----------
STATES = {"AL":"Alabama","AK":"Alaska","AZ":"Arizona","AR":"Arkansas","CA":"California","CO":"Colorado","CT":"Connecticut","DE":"Delaware",
          "DC":"District of Columbia","FL":"Florida","GA":"Georgia","HI":"Hawaii","ID":"Idaho","IL":"Illinois","IN":"Indiana","IA":"Iowa","KS":"Kansas",
          "KY":"Kentucky","LA":"Louisiana","ME":"Maine","MD":"Maryland","MA":"Massachusetts","MI":"Michigan","MN":"Minnesota","MS":"Mississippi",
          "MO":"Missouri","MT":"Montana","NE":"Nebraska","NV":"Nevada","NH":"New Hampshire","NJ":"New Jersey","NM":"New Mexico","NY":"New York",
          "NC":"North Carolina","ND":"North Dakota","OH":"Ohio","OK":"Oklahoma","OR":"Oregon","PA":"Pennsylvania","RI":"Rhode Island","SC":"South Carolina",
          "SD":"South Dakota","TN":"Tennessee","TX":"Texas","UT":"Utah","VT":"Vermont","VA":"Virginia","WA":"Washington","WV":"West Virginia",
          "WI":"Wisconsin","WY":"Wyoming"}
NAME2CODE = {v.lower(): k for k, v in STATES.items()}
CITIES = {"new york city":"NY","nyc":"NY","manhattan":"NY","brooklyn":"NY","san francisco":"CA","sf":"CA","bay area":"CA","los angeles":"CA","san jose":"CA",
          "palo alto":"CA","mountain view":"CA","menlo park":"CA","sunnyvale":"CA","san diego":"CA","oakland":"CA","seattle":"WA","bellevue":"WA",
          "redmond":"WA","austin":"TX","dallas":"TX","houston":"TX","plano":"TX","irving":"TX","san antonio":"TX","westlake":"TX","philadelphia":"PA",
          "pittsburgh":"PA","chicago":"IL","boston":"MA","cambridge":"MA","denver":"CO","atlanta":"GA","miami":"FL","washington dc":"DC","washington d.c.":"DC",
          "salt lake city":"UT","phoenix":"AZ","charlotte":"NC","raleigh":"NC","nashville":"TN","minneapolis":"MN","jersey city":"NJ","columbus":"OH"}
NYC = re.compile(r"new york city|\bnyc\b|manhattan|brooklyn|new york,?\s*(ny|new york)\b|^new york$", re.I)
def us_word(s): return bool(re.search(r"united states|\busa\b|\bu\.s\.", s, re.I) or re.search(r"\bUS\b", s))
NON_US = re.compile(r"\b(canada|uk|united kingdom|london|ireland|dublin|india|bangalore|bengaluru|singapore|germany|berlin|france|paris|poland|warsaw|"
                    r"japan|tokyo|australia|sydney|brazil|mexico|luxembourg|serbia|taiwan|netherlands|amsterdam|spain|israel|toronto|vancouver|emea|apac|latam|europe)\b", re.I)
TOP = S.get("region_order", ["TX", "CA", "WA", "NYC", "PA", "Remote US", "Other US"])

def parse_place(p, desc):
    """One location string -> (state or None, remote_us bool). (None, False) means no US state found."""
    low = p.lower().strip(" -()")
    if not low or NON_US.search(low): return None, False
    if "remote" in low or "anywhere" in low:
        rest = re.sub(r"(?i)remote|anywhere|[-(),:]", " ", p).strip()
        code = NAME2CODE.get(rest.lower()) or (rest.upper() if rest.upper() in STATES and len(rest) == 2 else None)
        if code or us_word(rest): return code, True
        # Bare "Remote": only US if the posting says so
        if not rest and re.search(r"(?i:united states)|\bU\.S\.|\bUSA\b", desc): return None, True
        return None, False
    if re.search(r"washington,?\s*d\.?c\.?|district of columbia", low): return "DC", False
    m = re.search(r",\s*([A-Za-z]{2})\b", p)
    if m and m.group(1).upper() in STATES: return m.group(1).upper(), False
    for name, code in NAME2CODE.items():
        if re.search(rf"\b{re.escape(name)}\b", low): return code, False
    for city, code in CITIES.items():
        if re.search(rf"\b{re.escape(city)}\b", low): return code, False
    return None, False

def us_location(loc, desc):
    """Returns {"us", "states", "remote_us", "regions"} where regions uses the settings.region_order buckets."""
    parts = [x for x in re.split(r"\s*(?:;|\||/|\bor\b|\n)\s*", loc or "") if x.strip()]
    states, remote, us_any = [], False, False
    for p in parts:
        st, rem = parse_place(p, desc)
        if st or rem: us_any = True
        elif us_word(p) and not NON_US.search(p): us_any = True  # "United States" with no state
        if st and st not in states: states.append(st)
        remote = remote or rem
    nyc = bool(NYC.search(loc or ""))
    regions = []
    for st in states:
        b = "NYC" if st == "NY" and nyc else st if st in TOP else "Other US"
        if b not in regions: regions.append(b)
    if remote: regions.append("Remote US")
    if us_any and not regions: regions.append("Other US")
    regions.sort(key=lambda r: TOP.index(r) if r in TOP else len(TOP))
    return {"us": us_any, "states": states, "remote_us": remote, "regions": regions}

EVERGREEN = re.compile(r"talent (community|pool|network)|future opportunities|general application|evergreen|pipeline of", re.I)

def family(title):
    for k, rx in FAMILIES.items():
        if rx.search(title): return k
def age_days(posted):
    try: return (NOW - datetime.fromisoformat(posted.replace("Z", "+00:00"))).days
    except Exception: return None

def keep(j, company):
    t, text = j["title"], j["title"] + " " + j["desc"]
    if EXCL_TITLE.search(t): return None
    geo = us_location(j["location"], j["desc"])
    if not geo["us"]: return "not_us"
    fam = family(t)
    if not fam or not ENTRY.search(t + " " + j["desc"][:1500]): return None
    if any(int(n) >= 3 for n in YEARS.findall(j["desc"])): return None
    if OTHER_YEAR.search(text) and "2027" not in text: return None
    a = age_days(j["posted"]) if j["posted"] else None
    if a is not None and a > S["max_age_days"]: return None
    sp = sponsorship(text)
    if sp["status"] != "yes": return "no_sponsor"
    flags = [sp["caveat"]] if sp["caveat"] else []
    if a is None: flags.append("Age unknown")
    elif a > S["flag_age_days"]: flags.append(f"Posted {a} days ago")
    if EVERGREEN.search(text): flags.append("Evergreen wording (possible ghost job)")
    return dict(j, company=company["name"], family=fam, age_days=a, grad_year="2027" if "2027" in text else "unspecified",
                sponsorship=sp, location_info=geo, company_h1b=company.get("h1b"), flags=flags, source=f"{company['ats']}:{company['slug']}")

def link_ok(url):
    try:
        r = requests.get(url, headers=HDR, timeout=20, stream=True); r.close(); return r.status_code < 400
    except Exception: return False

# ---------- scoring ----------
def fallback_score(desc):
    skills = [s.lower() for s in PROFILE["skills"]]
    hits = [s for s in skills if s in desc.lower()]
    return round((1 + 4 * min(len(hits) / 5, 1)) * 2) / 2, [f"Mentions {h}" for h in hits[:2]], []

# ---------- resumes ----------
# One plain-text resume per track in config/resumes/<track>.md (written by the Resumes page). profile.json is the fallback.
RESUME_DIR = CFG / "resumes"
TRACKS = ("swe", "pm", "ops")
def load_resumes():
    out = {}
    for tr in TRACKS:
        f = RESUME_DIR / f"{tr}.md"
        if f.exists() and f.read_text().strip(): out[tr] = f.read_text().strip()[:S.get("max_resume_chars", 4000)]
    return out
RESUMES = load_resumes()
def candidate_for(j):
    """(track used, candidate text) for this job's family."""
    if j["family"] in RESUMES: return j["family"], RESUMES[j["family"]]
    return "profile", json.dumps(PROFILE)
def md5(s): return hashlib.md5(s.encode()).hexdigest()

def score_prompt(j, max_desc=6000):
    return ("Score how well this candidate fits this job from 1 to 5 in 0.5 steps. Be strict and honest. "
            "Return JSON only, no prose: {\"score\": number, \"matches\": [two short strings], \"gaps\": [up to three short strings], \"actions\": [one concrete next step per gap, same order]}.\n\n"
            f"CANDIDATE:\n{candidate_for(j)[1]}\n\nJOB: {j['title']} at {j['company']}\n{j['desc'][:max_desc]}")

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
            kept, drops = [], {"not_us": 0, "no_sponsor": 0}
            for j in raw:
                k = keep(j, c)
                if isinstance(k, str): drops[k] += 1
                elif k and k["id"] not in seen: kept.append(k)
            health[c["name"]] = {"fetched": len(raw), "kept": len(kept), "dropped_not_us": drops["not_us"],
                                 "dropped_no_sponsor": drops["no_sponsor"], "error": None}
            for k in kept: seen.add(k["id"]); jobs.append(k)
        except Exception as e:
            health[c["name"]] = {"fetched": 0, "kept": 0, "error": str(e)[:160]}
        time.sleep(1)

    if S["verify_links"]: jobs = [j for j in jobs if link_ok(j["url"])]

    new_scores, fails_in_row = 0, 0
    for j in jobs:
        h = md5(j["title"] + j["desc"])
        track, cand = candidate_for(j)
        rh = md5(cand)
        c = cache.get(j["id"])
        fresh = c and c["hash"] == h and c.get("rhash") == rh
        # Re-score when the job or its resume changed, or to upgrade a keyword score
        needs_ai = not fresh or c.get("method") == "keywords"
        if needs_ai and key and new_scores < S["max_new_scores_per_run"] and fails_in_row < 3:
            try:
                s, m, g, a = score_fn(j, key); new_scores += 1; fails_in_row = 0
                c = {"hash": h, "rhash": rh, "score": s, "matches": m, "gaps": g, "actions": a, "method": scorer}
                fresh = True
                time.sleep(S["seconds_between_scores"])
            except Exception as e:
                fails_in_row += 1; scoring["errors"] += 1; scoring["last_error"] = str(e)[:240]
                print("Scoring error:", e, file=sys.stderr)
        if not fresh and not (c and c.get("method") not in (None, "keywords")):
            # No usable AI score: keyword fallback
            s, m, g = fallback_score(j["desc"]); c = {"hash": h, "rhash": rh, "score": s, "matches": m, "gaps": g, "method": "keywords"}
            fresh = True
        # else: keep the older AI score until the next run can refresh it
        cache[j["id"]] = c
        j.update(score=c["score"], matches=c["matches"], gaps=c["gaps"], actions=c.get("actions", []), score_method=c["method"],
                 resume_track=track, score_stale=not fresh)
        j["first_seen"] = first_seen.get(j["id"]) or NOW.isoformat()
        j["last_seen"] = NOW.isoformat()
        j["desc"] = j["desc"][:3000]

    jobs.sort(key=lambda j: (-j["score"], j["age_days"] if j["age_days"] is not None else 999))
    scoring["scored"] = new_scores
    cache = {k: v for k, v in cache.items() if k in seen}
    DATA.mkdir(exist_ok=True)
    cache_path.write_text(json.dumps(cache))
    (DATA / "jobs.json").write_text(json.dumps({"generated_at": NOW.isoformat(), "min_score": S["min_score"], "health": health, "scoring": scoring,
        "resumes": {tr: {"present": tr in RESUMES, "chars": len(RESUMES.get(tr, ""))} for tr in TRACKS},
        "regions": TOP, "jobs": jobs}, indent=1))
    print(f"Wrote {len(jobs)} jobs. Scorer: {scoring['scorer']}, AI-scored this run: {new_scores}, errors: {scoring['errors']}. "
          f"Sources with errors: {[k for k, v in health.items() if v['error']]}")
    if scoring["last_error"]: print("Last scoring error:", scoring["last_error"])

if __name__ == "__main__": main()
