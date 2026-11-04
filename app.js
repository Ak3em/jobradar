import {migrate} from "./state.js";
import {fixture} from "./fixtures.js";
const KEY = "jr2", DAY = 864e5, TABS = [["today","Today","today"],["feed","Feed","feed"],["pipeline","Pipeline","pipe"],["sources","Sources","pulse"]];
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const P = {today:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>', feed:'<path d="M4 6h16M4 12h16M4 18h10"/>', pipe:'<path d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z"/>',
 pulse:'<path d="M3 12h4l3-8 4 16 3-8h4"/>', save:'<path d="M6 3h12v18l-6-4-6 4z"/>', started:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', applied:'<path d="m22 2-11 11M22 2l-7 20-4-9-9-4z"/>',
 passed:'<path d="M18 6 6 18M6 6l12 12"/>', yes:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-5"/>', likely:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-5"/>',
 unclear:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>', no:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
 out:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', dl:'<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>', ul:'<path d="M12 15V4m0 0-4 4m4-4 4 4M5 20h14"/>',
 warn:'<path d="M12 3 2 21h20zM12 10v5M12 18h.01"/>', add:'<path d="M12 5v14M5 12h14"/>', refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>'};
const ic = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const SP = {yes:"Sponsors", likely:"Likely sponsors", unclear:"Sponsorship unclear", no:"Does not sponsor"};
const FAM = {swe:"Software", pm:"Product / Program", ops:"Operations"};
const ST = [["saved","Saved"],["started","Started"],["applied","Applied"],["interview","Interview"],["offer","Offer"],["closed","Closed"]];
const STATUSES = [...ST.map(x => x[0]), "passed"];
const NOTE = {saved:"Saved", started:"Marked started", applied:"Marked applied", interview:"Moved to Interview", offer:"Moved to Offer", closed:"Closed", passed:"Hidden from your feed"};

/* State v2. Migrates v1 ("jr": {id: {status, missing}}) without touching the old key. */
function load(){
  try { const s = localStorage.getItem(KEY); if (s) return migrate(JSON.parse(s)); } catch {}
  try { return migrate(JSON.parse(localStorage.getItem("jr") || "{}")); } catch { return migrate({}); }
}
let data, cfg = {needs_sponsorship:true, grad_year:"2027"}, S = load(), sel = null, tmr;
const prevVisit = S.meta.lastVisit;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const jobs = () => [...(data?.jobs || []), ...S.custom];
const rec = id => S.jobs[id] || {};
const st = j => rec(j.id).status || "new";
const days = iso => Math.floor((Date.now() - new Date(iso)) / DAY);
const lastAt = id => (rec(id).history || []).at(-1)?.at || new Date().toISOString();
const view = () => ({fit: data?.min_score || 3.5, fam: "", mode: "list", ...S.meta.view});
const setView = o => { S.meta.view = {...view(), ...o}; save(); location.hash === "#feed" ? render() : (location.hash = "feed"); };
const tab = () => TABS.some(t => t[0] === location.hash.slice(1)) ? location.hash.slice(1) : "today";

/* Gate (pass/fail) then rank (fit x freshness). */
function gate(j){
  if (cfg.needs_sponsorship !== false && j.sponsorship?.status === "no") return "Does not sponsor: " + (j.sponsorship.reason || "stated in posting");
  if (/^\d{4}$/.test(j.grad_year) && j.grad_year !== String(cfg.grad_year)) return `Targets class of ${j.grad_year}`;
  return null;
}
const fresh = j => j.age_days == null ? .8 : j.age_days <= 7 ? 1 : j.age_days >= 30 ? .6 : 1 - (j.age_days - 7) / 23 * .4;
const prio = j => (+j.score || 0) * fresh(j);
const isNew = j => prevVisit ? new Date(j.first_seen) > new Date(prevVisit) : j.age_days != null && j.age_days <= 3;
function ageText(j){
  if (j.age_days == null) return "Age unknown";
  if (j.age_days === 0) return "Posted today";
  if (j.age_days > 7) return "Posted " + new Date(Date.now() - j.age_days * DAY).toLocaleDateString(undefined, {month:"short", day:"numeric"});
  return `Posted ${j.age_days} day${j.age_days > 1 ? "s" : ""} ago`;
}
function ago(iso){
  const m = Math.round((Date.now() - new Date(iso)) / 6e4);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}

/* Actions */
function toast(msg, undo){
  $("#tmsg").textContent = msg; const u = $("#undo"); u.hidden = !undo; u.onclick = () => { undo(); $("#toast").classList.remove("on"); };
  $("#toast").classList.add("on"); clearTimeout(tmr); tmr = setTimeout(() => $("#toast").classList.remove("on"), 6000);
}
function setStatus(id, next, extra){
  const prev = S.jobs[id] ? structuredClone(S.jobs[id]) : null, cur = S.jobs[id] = {history:[], ...S.jobs[id], ...extra};
  if (next === "applied" && cur.status !== "applied") cur.nextFollowUpAt = new Date(Date.now() + 7 * DAY).toISOString();
  if (cur.status === next && !extra) delete cur.status;
  else if (cur.status !== next) { cur.status = next; cur.history = [...(cur.history || []), {status:next, at:new Date().toISOString()}]; }
  save(); render();
  toast(cur.status ? NOTE[next] : "Back in your feed", () => { prev ? S.jobs[id] = prev : delete S.jobs[id]; save(); render(); });
}
function missingDialog(id){
  const d = $("#dlg");
  d.innerHTML = `<h2>What are you still missing?</h2><label for="m">Cover letter, referral, transcript, anything blocking you</label><textarea id="m">${esc(rec(id).missing || "")}</textarea><div class="dact"><button class="btn" id="no">Cancel</button><button class="btn p" id="ok">Save</button></div>`;
  d.showModal(); $("#no").onclick = () => d.close(); $("#ok").onclick = () => { setStatus(id, "started", {missing: $("#m").value.trim()}); d.close(); };
}
async function refresh(manual){
  const b = $("#refresh"); b.disabled = true; b.classList.add("spin");
  try {
    const get = u => fetch(`${u}?t=${Date.now()}`, {cache:"no-store"}).then(r => { if (!r.ok) throw 0; return r.json(); });
    const q = new URLSearchParams(location.search).get("data"), d = q ? fixture(q) : await get("data/jobs.json"), old = new Set((data?.jobs || []).map(j => j.id));
    try { cfg = {...cfg, ...await get("config/settings.json")}; } catch {}
    const added = data ? d.jobs.filter(j => !old.has(j.id)).length : 0; data = d;
    if (manual) toast(added ? `${added} new job${added > 1 ? "s" : ""} since your last refresh` : `Up to date. Last scan ${ago(d.generated_at)}`);
  } catch { if (manual || !data) toast("Couldn't load jobs. Check your connection, then refresh."); }
  finally { b.disabled = false; b.classList.remove("spin"); render(); }
}
function exportState(){
  S.meta.lastBackup = new Date().toISOString(); save();
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], {type:"application/json"})); a.download = "jobradar-tracker.json"; a.click(); render();
}
async function importState(f){
  try { const n = migrate(JSON.parse(await f.text())); if (!confirm(`Replace your tracker with this file (${Object.keys(n.jobs).length} tracked jobs)?`)) return; S = n; save(); render(); toast("Tracker imported"); }
  catch { toast("That file isn't a JobRadar export."); }
}

/* Views */
const gateChip = j => { const s = j.sponsorship?.status || "unclear"; return `<span class="gate g-${s}">${ic(s, 14)}${SP[s]}</span>`; };
const fit = n => `<span class="fit" role="img" aria-label="Fit ${n.toFixed(1)} of 5"><span class="pips">${[1,2,3,4,5].map(i => `<i class="${n >= i ? "f" : n >= i - .5 ? "h" : ""}"></i>`).join("")}</span><b>${n.toFixed(1)}</b></span>`;
function row(j, o = {}){
  const open = sel === j.id, r = rec(j.id), btn = (k, l) => `<button data-a="${k}" data-id="${esc(j.id)}" aria-pressed="${r.status === k}">${ic(k)}${l}</button>`;
  const gap = (j.gaps || [])[0], next = (j.actions || [])[0];
  return `<article class="job${open ? " open" : ""}${o.blocked ? " blk" : ""}" data-row="${esc(j.id)}">
  <button class="head" data-a="sel" data-id="${esc(j.id)}" aria-expanded="${open}">
   <span class="dot${isNew(j) ? " on" : ""}">${isNew(j) ? '<span class="vh">New</span>' : ""}</span>
   <span class="main"><span class="co">${esc(j.company)}<span class="loc">${esc(j.location)}</span></span><span class="ti">${esc(j.title)}</span>
    <span class="line">${gateChip(j)}<span class="age">${ageText(j)}</span></span>
    ${o.blocked ? `<span class="why">${esc(o.blocked)}</span>` : ""}${o.note ? `<span class="note${o.due ? " due" : ""}">${o.due ? ic("warn", 14) : ""}${esc(o.note)}</span>` : ""}</span>
   ${o.blocked ? "" : fit(+j.score || 0)}</button>
  ${open ? `<div class="detail"><p><b>${SP[j.sponsorship?.status] || "Sponsorship unclear"}.</b> ${esc(j.sponsorship?.reason)}</p>
   ${gap ? `<p><b>Top gap:</b> ${esc(gap)}${next ? `. <b>Next step:</b> ${esc(next)}` : ""}</p>` : ""}
   ${(j.matches || []).length ? `<ul>${j.matches.map(m => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}
   ${(j.flags || []).length ? `<div class="flags">${j.flags.map(f => `<span class="flag">${ic("warn", 14)}${esc(f)}</span>`).join("")}</div>` : ""}
   ${st(j) === "started" ? checklist(j) : ""}
   ${r.missing ? `<p><b>Still missing:</b> ${esc(r.missing)} <button class="btn" data-a="note" data-id="${esc(j.id)}">Edit</button></p>` : ""}
   <div class="acts">${btn("saved","Save")}${btn("started","Started")}${btn("applied","Applied")}${btn("passed","Not interested")}
   ${j.url ? `<a class="btn p" href="${esc(j.url)}" target="_blank" rel="noopener">Open posting${ic("out", 16)}</a>` : ""}</div></div>` : ""}
  ${o.stage ? `<div class="extra"><label class="muted">Stage <select data-stage="${esc(j.id)}">${ST.map(([k, l]) => `<option value="${k}"${st(j) === k ? " selected" : ""}>${l}</option>`).join("")}</select></label></div>` : ""}</article>`;
}
const sec = (t, n, body) => `<h2>${t}<span class="n">${n}</span></h2>${body}`;
const empty = (t, d) => `<div class="empty"><b>${t}</b>${d}</div>`;
const sample = () => data?.sample ? `<div class="box">${ic("warn")}Sample data. Run the scan workflow to load real jobs.</div>` : "";

function today(){
  const all = jobs(), ok = j => st(j) === "new" && !gate(j), floor = data.min_score || 3.5;
  const due = all.filter(j => st(j) === "applied" && days(lastAt(j.id)) >= 7);
  const started = all.filter(j => st(j) === "started");
  const next = all.filter(j => ok(j) && (+j.score || 0) >= floor).sort((a, b) => prio(b) - prio(a)).slice(0, 3);
  const added = prevVisit ? all.filter(j => ok(j) && isNew(j)) : [];
  const line = due.length ? `${due.length} follow-up${due.length > 1 ? "s" : ""} due.` : next.length ? "Nothing overdue. Apply next is below." : "You're caught up.";
  return `<h1 class="display">Today</h1><p class="muted">${new Date().toLocaleDateString(undefined, {weekday:"long", month:"long", day:"numeric"})}. ${line}</p>${sample()}
  ${due.length ? sec("Follow-ups due", due.length, due.map(j => { const n = days(lastAt(j.id)); return row(j, {due:1, note:`Applied ${n} days ago. ${n >= 14 ? "Second" : "First"} nudge: send a follow-up.`}); }).join("")) : ""}
  ${started.length ? sec("Finish what you started", started.length, started.map(j => row(j, {note: rec(j.id).missing ? "Missing: " + rec(j.id).missing : "Add what's still missing"})).join("")) : ""}
  ${sec("Apply next", next.length, next.length ? next.map(j => row(j, {note:`Why first: ${(+j.score).toFixed(1)} fit, ${ageText(j).toLowerCase()}, ${(SP[j.sponsorship?.status] || "").toLowerCase()}`})).join("") : empty("Nothing to apply to", "New jobs land after each daily scan. Use Refresh to check now."))}
  ${added.length ? `<details class="shelf"><summary>New since your last visit (${added.length})</summary>${added.map(j => row(j)).join("")}</details>` : ""}`;
}
function feed(){
  const v = view(), all = jobs(), mine = all.filter(j => st(j) === "new" && (!v.fam || j.family === v.fam));
  const list = mine.filter(j => !gate(j) && (+j.score || 0) >= v.fit).sort((a, b) => prio(b) - prio(a));
  const blk = mine.filter(gate), hid = all.filter(j => st(j) === "passed");
  const chip = (k, val, l) => `<button data-a="f-${k}" data-v="${val}" aria-pressed="${String(v[k]) === String(val)}">${l}</button>`;
  return `<h1 class="display">Feed</h1>${sample()}
  <div class="chips" role="group" aria-label="Filters">${chip("fit",0,"Any fit")}${chip("fit",3.5,"Fit 3.5+")}${chip("fit",4,"Fit 4+")}</div>
  <div class="chips" role="group" aria-label="Role">${chip("fam","","All roles")}${Object.entries(FAM).map(([k, l]) => chip("fam", k, l)).join("")}</div>
  <div class="chips" role="group" aria-label="View">${chip("mode","list","List")}${chip("mode","deck","Deck")}${chip("mode","radar","Radar")}</div>
  <p class="muted">${list.length} eligible, best first. Keys: j/k move, s save, p pass, a applied, o open.</p>
  ${!list.length ? empty("No eligible matches", "Lower the fit filter or check Blocked below.") : v.mode === "deck" ? deck(list) : (v.mode === "radar" ? radar(list) : "") + list.map(j => row(j)).join("")}
  ${blk.length ? `<details class="shelf"><summary>Blocked (${blk.length})</summary>${blk.map(j => row(j, {blocked:gate(j)})).join("")}</details>` : ""}
  ${hid.length ? `<details class="shelf"><summary>Hidden (${hid.length})</summary>${hid.map(j => row(j)).join("")}</details>` : ""}`;
}
const CHK = [["resume","Resume tailored"],["cover","Cover letter"],["referral","Referral asked"],["transcript","Transcript"],["portfolio","Portfolio link"]];
function checklist(j){
  const c = rec(j.id).checklist || {}, n = CHK.filter(x => c[x[0]]).length, R = 11, L = 2 * Math.PI * R;
  return `<fieldset class="chk"><legend><svg width="28" height="28" viewBox="0 0 28 28" role="img" aria-label="${n} of 5 ready"><circle cx="14" cy="14" r="${R}" fill="none" stroke="var(--hair)" stroke-width="3"/><circle cx="14" cy="14" r="${R}" fill="none" stroke="var(--eligible)" stroke-width="3" stroke-dasharray="${n / 5 * L} ${L}" transform="rotate(-90 14 14)"/></svg>Ready ${n}/5</legend>${CHK.map(([k, l]) => `<label class="ck"><input type="checkbox" data-chk="${k}" data-id="${esc(j.id)}"${c[k] ? " checked" : ""}>${l}</label>`).join("")}</fieldset>`;
}
function deck(list){
  const j = list[0], gap = (j.gaps || [])[0], next = (j.actions || [])[0], id = esc(j.id);
  return `<div class="dcard" data-swipe="${id}"><div class="co">${esc(j.company)}<span class="loc">${esc(j.location)}</span></div><h3 class="dti">${esc(j.title)}</h3>
   <div class="line">${gateChip(j)}${fit(+j.score || 0)}<span class="age">${ageText(j)}</span></div><p>${esc(j.sponsorship?.reason)}</p>
   ${gap ? `<p><b>Top gap:</b> ${esc(gap)}${next ? `. <b>Next step:</b> ${esc(next)}` : ""}</p>` : ""}${(j.matches || []).length ? `<ul>${j.matches.map(m => `<li>${esc(m)}</li>`).join("")}</ul>` : ""}</div>
   <div class="acts"><button data-a="passed" data-id="${id}">${ic("passed")}Pass</button><button data-a="applied" data-id="${id}">${ic("applied")}Applied</button>${j.url ? `<a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener">Open${ic("out", 16)}</a>` : ""}<button class="btn p" data-a="saved" data-id="${id}">${ic("save")}Save</button></div>
   <p class="muted">${list.length} left. Swipe right to save, left to pass, up to open. The buttons do the same.</p>`;
}
function radar(list){
  const max = cfg.max_age_days || 60, c = 150, fam = Object.keys(FAM), play = S.meta.sweep !== data.generated_at && !matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (play) { S.meta.sweep = data.generated_at; save(); }
  const hash = s => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const dots = list.slice(0, 200).map((j, i) => {
    const a = (-90 + Math.max(0, fam.indexOf(j.family)) * 120 + 12 + hash(j.id) % 96) * Math.PI / 180, r = 22 + Math.min(j.age_days ?? max, max) / max * 108, z = 3 + Math.sqrt(+j.score || 0) * 2.6;
    return `<circle class="blip${play ? " ping" : ""}" style="--i:${Math.min(i, 12)}" cx="${(c + r * Math.cos(a)).toFixed(1)}" cy="${(c + r * Math.sin(a)).toFixed(1)}" r="${z.toFixed(1)}" fill="var(--eligible)" fill-opacity=".18" stroke="${j.sponsorship?.status === "unclear" ? "var(--unclear)" : "var(--eligible)"}" stroke-width="2"${j.sponsorship?.status === "likely" ? ' stroke-dasharray="3 2"' : ""} data-a="sel" data-id="${esc(j.id)}" tabindex="0" role="button" aria-label="${esc(j.company)}, ${esc(j.title)}, fit ${(+j.score || 0).toFixed(1)}, ${ageText(j)}"/>`;
  }).join("");
  return `<svg class="radar" viewBox="0 0 300 300" role="group" aria-label="Radar of eligible jobs. Angle is role family, distance from the center is age, dot size is fit. The list below has the same jobs."><g fill="none" stroke="var(--hair)"><circle cx="150" cy="150" r="130"/><circle cx="150" cy="150" r="76"/><circle cx="150" cy="150" r="22"/><path d="M150 150V20M150 150l112.6 65M150 150l-112.6 65"/></g>
   <g font-size="11" fill="var(--ink2)" text-anchor="middle"><text x="215" y="16">Software</text><text x="268" y="262">Product</text><text x="32" y="262">Operations</text></g>
   ${play ? '<line class="sweepline" x1="150" y1="150" x2="150" y2="20" stroke="var(--signal)" stroke-width="2"/>' : ""}${dots}</svg><p class="muted">Center is today, rim is ${max} days old. Dashed outline means likely sponsor.</p>`;
}
function addDialog(){
  const d = $("#dlg");
  d.innerHTML = `<h2>Add a job</h2><label for="u">Posting URL</label><input id="u" type="url" placeholder="https://" autocomplete="off"><label for="c">Company</label><input id="c" autocomplete="off"><label for="t">Title</label><input id="t" autocomplete="off">
   <label for="f">Role</label><select id="f">${Object.entries(FAM).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select><div class="dact"><button class="btn" id="no">Cancel</button><button class="btn p" id="ok">Add to Saved</button></div>`;
  d.showModal(); $("#no").onclick = () => d.close();
  $("#ok").onclick = () => {
    const url = $("#u").value.trim(); let host = ""; try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { $("#u").focus(); return toast("Enter a full link starting with https://"); }
    const id = "c" + Date.now(); S.custom.push({id, company:$("#c").value.trim() || host, title:$("#t").value.trim() || "Job posting", url, location:"", family:$("#f").value, age_days:0, grad_year:"unspecified", sponsorship:{status:"unclear", reason:"Added by you. Check the posting."}, flags:[], score:3, matches:[], gaps:[], first_seen:new Date().toISOString(), custom:true});
    d.close(); setStatus(id, "saved");
  };
}
function palette(){
  const d = $("#dlg"), cmds = [...TABS.map(([k, l]) => [`Go to ${l}`, () => { location.hash = k; }]), ["Filter: all roles", () => setView({fam:""})], ...Object.entries(FAM).map(([k, l]) => [`Filter: ${l}`, () => setView({fam:k})]),
    ["Filter: fit 4+", () => setView({fit:4})], ["Filter: any fit", () => setView({fit:0})], ["View: List", () => setView({mode:"list"})], ["View: Deck", () => setView({mode:"deck"})], ["View: Radar", () => setView({mode:"radar"})],
    ["Refresh jobs", () => refresh(true)], ["Add job", addDialog], ["Export tracker", exportState], ...(sel ? STATUSES.map(s => [`Selected job: ${NOTE[s]}`, () => setStatus(sel, s)]) : [])];
  d.innerHTML = `<h2>Command palette</h2><input id="q" aria-label="Command" autocomplete="off" placeholder="Type a command"><ul class="hl" id="cl"></ul>`; d.showModal();
  const draw = () => { const q = $("#q").value.toLowerCase(), m = cmds.filter(c => c[0].toLowerCase().includes(q));
    $("#cl").innerHTML = m.map((c, i) => `<li><button class="btn" data-i="${i}" style="width:100%;justify-content:flex-start">${c[0]}</button></li>`).join("");
    $("#cl").onclick = e => { const b = e.target.closest("[data-i]"); if (b) { d.close(); m[b.dataset.i][1](); } };
    $("#q").onkeydown = e => { if (e.key === "Enter" && m[0]) { d.close(); m[0][1](); } }; };
  $("#q").oninput = draw; draw();
}
function pipeline(){
  const all = jobs();
  return `<h1 class="display">Pipeline</h1>${sample()}` + ST.map(([k, l]) => {
    const rows = all.filter(j => st(j) === k);
    return sec(l, rows.length, rows.length ? rows.map(j => { const n = days(lastAt(j.id)); return row(j, {stage:1, due:k === "applied" && n >= 7, note:`${l} ${n === 0 ? "today" : n + " day" + (n > 1 ? "s" : "")}${k === "applied" && n >= 14 ? ". Second nudge due" : k === "applied" && n >= 7 ? ". First nudge due" : ""}`}); }).join("") : `<p class="muted">Empty</p>`);
  }).join("");
}
function sources(){
  const h = Object.entries(data.health || {}), b = S.meta.lastBackup;
  return `<h1 class="display">Sources</h1>${sample()}<p class="muted">Last scan ${new Date(data.generated_at).toLocaleString()}. Sponsorship required: ${cfg.needs_sponsorship !== false ? "yes" : "no"} (set in config/settings.json).</p>
  ${sec("Companies", h.length, h.length ? `<ul class="hl">${h.map(([k, v]) => v.error ? `<li class="bad">${ic("no")}<span><b>${esc(k)}</b> failed: ${esc(v.error)}. Check its slug in config/companies.json.</span></li>` : `<li class="ok">${ic("yes")}<span><b>${esc(k)}</b>: ${v.kept} kept of ${v.fetched} fetched</span></li>`).join("")}</ul>` : `<p class="muted">No scan has run yet. Run the scan workflow in GitHub Actions.</p>`)}
  ${sec("Your tracker", Object.keys(S.jobs).length, `<p class="muted">${b ? `Last backup ${days(b)} days ago.` : "Never backed up."} Data lives in this browser only.</p>
   <div class="acts"><button class="btn" data-a="export">${ic("dl")}Export</button><label class="btn" tabindex="0">${ic("ul")}Import<input id="imp" type="file" accept=".json,application/json" hidden></label></div>`)}`;
}

function render(){
  const t = tab(), nav = $("#nav"), all = data ? jobs() : [], v = data ? view() : {};
  const counts = {feed: all.filter(j => st(j) === "new" && !gate(j) && (+j.score || 0) >= v.fit && (!v.fam || j.family === v.fam)).length, pipeline: all.filter(j => ST.some(s => s[0] === st(j))).length};
  nav.innerHTML = TABS.map(([k, l, i]) => `<a href="#${k}" ${k === t ? 'aria-current="page"' : ""}>${ic(i, 20)}<span>${l}</span>${counts[k] != null && data ? `<span class="n">${counts[k]}</span>` : ""}</a>`).join("");
  $("#refresh").innerHTML = ic("refresh", 18) + "<span>Refresh</span>";
  const f = document.activeElement, k = f && $("#app").contains(f) && f.dataset.a ? `[data-a="${f.dataset.a}"][data-id="${CSS.escape(f.dataset.id || "")}"]` : null;
  $("#scan").textContent = data ? ` Scan ${ago(data.generated_at)}` : "";
  $("#app").innerHTML = !data ? empty("Loading jobs", "One moment.") : {today, feed, pipeline, sources}[t]();
  if (k) $("#app").querySelector(k)?.focus();
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-a]"); if (!t) return;
  const {a, id, v} = t.dataset;
  if (a === "sel") { sel = sel === id ? null : id; render(); }
  else if (a === "refresh") refresh(true);
  else if (a === "add") addDialog();
  else if (a === "export") exportState();
  else if (a === "note") missingDialog(id);
  else if (a.startsWith("f-")) { S.meta.view = {...view(), [a.slice(2)]: a === "f-fit" ? +v : v}; save(); render(); }
  else if (a === "started" && st(jobs().find(j => j.id === id)) !== "started") missingDialog(id);
  else if (STATUSES.includes(a)) setStatus(id, a);
});
document.addEventListener("change", e => {
  if (e.target.dataset.chk) { const id = e.target.dataset.id; S.jobs[id] = {history:[], ...S.jobs[id], checklist:{...rec(id).checklist, [e.target.dataset.chk]:e.target.checked}}; save(); render(); return; }
  if (e.target.dataset.stage) setStatus(e.target.dataset.stage, e.target.value);
  else if (e.target.id === "imp" && e.target.files[0]) importState(e.target.files[0]);
});
document.addEventListener("keydown", e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); return palette(); }
  if (e.target.matches?.("circle[data-a]") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); return e.target.dispatchEvent(new MouseEvent("click", {bubbles:true})); }
  if (e.metaKey || e.ctrlKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || $("#dlg").open) return;
  const ids = [...document.querySelectorAll("[data-row]")].map(x => x.dataset.row), k = e.key;
  if (k === "j" || k === "k") {
    sel = ids[Math.max(0, Math.min(ids.length - 1, ids.indexOf(sel) + (k === "j" ? 1 : -1)))] ?? null; render();
    if (sel) $(`[data-row="${CSS.escape(sel)}"]`)?.scrollIntoView({block:"nearest"}); return;
  }
  const m = {s:"saved", p:"passed", a:"applied"}[k]; if (m && sel) setStatus(sel, m);
  if (k === "o" && sel) { const j = jobs().find(x => x.id === sel); if (j?.url) open(j.url, "_blank", "noopener"); }
});
addEventListener("hashchange", () => { sel = null; render(); scrollTo({top:0}); });
render();
refresh(false).then(() => { S.meta.lastVisit = new Date().toISOString(); save(); });

/* Deck swipe: 1:1 tracking, pointer capture, one pointer at a time, commit on distance or velocity above 0.11 px/ms. */
let sw = null;
document.addEventListener("pointerdown", e => { const c = e.target.closest("[data-swipe]"); if (!c || sw) return; sw = {c, id:e.pointerId, x:e.clientX, y:e.clientY, t:e.timeStamp, dx:0, dy:0}; c.setPointerCapture(e.pointerId); });
document.addEventListener("pointermove", e => { if (!sw || e.pointerId !== sw.id) return; sw.dx = e.clientX - sw.x; sw.dy = e.clientY - sw.y; sw.c.style.transition = "none"; sw.c.style.transform = `translate(${sw.dx}px,${Math.min(0, sw.dy)}px) rotate(${Math.max(-6, Math.min(6, sw.dx / 20))}deg)`; });
document.addEventListener("pointerup", e => {
  if (!sw || e.pointerId !== sw.id) return;
  const {c, dx, dy} = sw, dist = Math.hypot(dx, dy), v = dist / Math.max(1, e.timeStamp - sw.t), id = c.dataset.swipe; sw = null;
  const go = dist > 90 || (v > .11 && dist > 24), up = Math.abs(dy) > Math.abs(dx) && dy < 0;
  if (!go || (Math.abs(dy) > Math.abs(dx) && !up)) { c.style.transition = "transform .3s var(--ease-out)"; c.style.transform = ""; return; }
  if (up) { c.style.transform = ""; const j = jobs().find(x => x.id === id); if (j?.url) open(j.url, "_blank", "noopener"); } else setStatus(id, dx > 0 ? "saved" : "passed");
});
document.addEventListener("pointercancel", () => { if (sw) { sw.c.style.transform = ""; sw = null; } });
