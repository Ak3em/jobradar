# Run: python tests/test_filters.py   (no network, no key needed)
import sys; import os; sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scraper")); import scrape as s
sp = [
 ("We sponsor H-1B visas for qualified candidates.", "yes", ["h1b"]),
 ("F-1 students on OPT and STEM OPT are welcome to apply.", "yes", ["stem_opt","opt"]),
 ("Experience with CPT codes and ICD-10 claims processing.", "unstated", []),
 ("Please opt in to SMS updates. OPT out anytime.", "unstated", []),
 ("We do sponsor visas! However, we aren't able to successfully sponsor visas for every role and every candidate.", "yes", ["general"]),
 ("Applicants must be authorized to work in the US without the need for current or future sponsorship.", "no", []),
 ("We do not currently offer visa sponsorship for this role.", "no", []),
 ("This role is not eligible for visa sponsorship.", "no", []),
 ("Great team, free lunch.", "unstated", []),
 ("Curricular Practical Training (CPT) available for F-1 students.", "yes", ["cpt"]),
 ("Candidates on OPT are not eligible for this position.", "no", []),
]
bad = 0
for txt, st, ty in sp:
    r = s.sponsorship(txt); ok = r["status"] == st and set(r["types"]) >= set(ty) and (st != "yes" or r["types"])
    bad += not ok; print("OK " if ok else "BAD", st, r["status"], r["types"], r["caveat"], "|", txt[:55])
loc = [
 ("Remote - USA", "", ["Remote US"]), ("Boston, MA; San Francisco, CA | Seattle,", "", ["CA","WA","Other US"]),
 ("New York, NY (HQ)", "", ["NYC"]), ("Remote - Luxembourg", "", []), ("Belgrade, Serbia", "", []), ("Taiwan", "", []),
 ("Denver, CO; Westlake, TX", "", ["TX","Other US"]), ("Washington, D.C.", "", ["Other US"]), ("Seattle, Washington", "", ["WA"]),
 ("Remote", "Open to candidates in the United States.", ["Remote US"]), ("Remote", "Anywhere in EMEA.", []),
 ("Austin, Texas or Pittsburgh, PA", "", ["TX","PA"]), ("Albany, NY", "", ["Other US"]), ("United States", "", ["Other US"]),
 ("London, UK; New York City", "", ["NYC"]), ("Remote (Texas)", "", ["TX","Remote US"]), ("Toronto, ON", "", []),
]
for l, d, want in loc:
    r = s.us_location(l, d); ok = r["regions"] == want and r["us"] == bool(want)
    bad += not ok; print("OK " if ok else "BAD", want, r["regions"], r["states"], "|", l)
print("FAILURES:", bad); sys.exit(1 if bad else 0)
