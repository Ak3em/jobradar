const P = {
 feed:'<path d="M4 6h16M4 12h16M4 18h10"/>', save:'<path d="M6 3h12v18l-6-4-6 4z"/>', started:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 applied:'<path d="m22 2-11 11M22 2l-7 20-4-9-9-4z"/>', passed:'<path d="M18 6 6 18M6 6l12 12"/>',
 yes:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-5"/>', likely:'<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>',
 unclear:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>', no:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
 out:'<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>', dl:'<path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/>', pulse:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
 warn:'<path d="M12 3 2 21h20zM12 10v5M12 18h.01"/>'};
const ic = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n]}</svg>`;
const SP = {yes:"Sponsors", likely:"Likely sponsors", unclear:"Sponsorship unclear", no:"Does not sponsor"};
const FAM = {swe:"Software", pm:"Product / Program", ops:"Operations"};
const TABS = [["feed","Feed","feed"],["saved","Saved","save"],["started","Started","started"],["applied","Applied","applied"],["passed","Passed","passed"]];
const NOTE = {saved:"Saved for later", started:"Marked as started", applied:"Marked as applied", passed:"Hidden from your feed"};
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store = {get(){try{return JSON.parse(localStorage.getItem("jr") || "{}")}catch{return {}}}, set(s){try{localStorage.setItem("jr", JSON.stringify(s))}catch{}}};
let data, state = store.get(), tab = "feed", tmr;

const status = j => (state[j.id] || {}).status || "feed";
function matches(j, t){
  if (status(j) !== t) return false;
  if (t === "feed" && j.score < +$("min").value) return false;
  if ($("fam").value && j.family !== $("fam").value) return false;
  const sp = $("sp").value;
  if (sp === "hide" && j.sponsorship.status === "no") return false;
  if (sp === "yes" && !["yes","likely"].includes(j.sponsorship.status)) return false;
  return true;
}
function toast(msg, undo){
  $("tmsg").textContent = msg; $("toast").classList.add("on"); $("undo").onclick = () => { undo(); $("toast").classList.remove("on"); };
  clearTimeout(tmr); tmr = setTimeout(() => $("toast").classList.remove("on"), 6000);
}
function setStatus(id, next, missing){
  const prev = JSON.parse(JSON.stringify(state[id] || {})), cur = state[id] = {...(state[id] || {})};
  if (cur.status === next) delete cur.status; else cur.status = next;
  if (missing !== undefined) cur.missing = missing;
  store.set(state); render();
  toast(cur.status ? NOTE[next] : "Back in your feed", () => { state[id] = prev; store.set(state); render(); });
}
function dialog(html, onSave){
  const d = $("dlg"); d.innerHTML = html; d.showModal();
  d.querySelector("[data-x]").onclick = () => d.close();
  const s = d.querySelector("[data-ok]"); if (s) s.onclick = () => { onSave(d); d.close(); };
}
function startedDialog(j){
  dialog(`<h2>What are you still missing?</h2><label for="m">Cover letter, referral, transcript, anything blocking you</label>
   <textarea id="m">${esc((state[j.id] || {}).missing || "")}</textarea>
   <div class="dact"><button data-x>Cancel</button><button class="p" data-ok>Save</button></div>`, d => setStatus(j.id, "started", d.querySelector("#m").value.trim()));
}
function healthDialog(){
  const h = Object.entries(data.health || {});
  dialog(`<h2>Last scan</h2>${h.length ? `<ul class="hl">${h.map(([k, v]) => v.error
    ? `<li class="bad">${ic("no")}<span><b>${esc(k)}</b> failed: ${esc(v.error)}. Check its slug in config/companies.json.</span></li>`
    : `<li class="ok">${ic("yes")}<span><b>${esc(k)}</b>: ${v.kept} kept of ${v.fetched} fetched</span></li>`).join("")}</ul>` : "<p>No scan has run yet. Run the scan workflow in GitHub Actions.</p>"}
   <div class="dact"><button data-x>Close</button></div>`);
}
function ring(score){
  const c = 2 * Math.PI * 22, d = (score / 5) * c;
  return `<div class="ring" role="img" aria-label="Match score ${score.toFixed(1)} out of 5"><svg width="52" height="52" viewBox="0 0 52 52"><circle cx="26" cy="26" r="22" fill="none" stroke="var(--soft)" stroke-width="5"/><circle cx="26" cy="26" r="22" fill="none" stroke="var(--primary)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${d} ${c}"/></svg><b>${score.toFixed(1)}</b></div>`;
}
function card(j){
  const s = state[j.id] || {}, sp = j.sponsorship;
  const age = j.age_days == null ? "Age unknown" : j.age_days === 0 ? "Posted today" : `Posted ${j.age_days} days ago`;
  const b = (k, l, i) => `<button data-id="${esc(j.id)}" data-s="${k}" aria-pressed="${s.status === k}">${ic(i)}${l}</button>`;
  return `<article class="card" style="--c:var(--${sp.status})">
   <div class="row"><div><div><span class="co">${esc(j.company)}</span><span class="loc">${esc(j.location)}</span></div><h2 class="ti">${esc(j.title)}</h2>
   <div class="spon">${ic(sp.status, 20)}<div><b>${SP[sp.status]}</b><span class="why">${esc(sp.reason)}</span></div></div></div>${ring(j.score)}</div>
   <div class="meta"><span class="tag">${age}</span><span class="tag">${j.grad_year === "2027" ? "Class of 2027" : "Grad year not stated"}</span><span class="tag">${FAM[j.family]}</span>${j.flags.map(f => `<span class="tag warn">${ic("warn", 14)}${esc(f)}</span>`).join("")}</div>
   <details><summary>Why it matches, and the gaps</summary><ul>${j.matches.map(m => `<li>${esc(m)}</li>`).join("")}${j.gaps.map(g => `<li class="gap">Gap: ${esc(g)}</li>`).join("")}</ul></details>
   ${s.missing ? `<div class="miss"><b>Still missing:</b> ${esc(s.missing)}</div>` : ""}
   <div class="act">${b("saved","Save","save")}${b("started","Started","started")}${b("applied","Applied","applied")}${b("passed","Not interested","passed")}
   <a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener">Open posting${ic("out")}</a></div></article>`;
}
const EMPTY = {feed:["No matches right now","Try a lower minimum match or show all sponsorship types. New jobs land after each daily scan."], saved:["Nothing saved yet","Tap Save on a job you want to come back to."],
 started:["No applications in progress","Use Started when you begin an application but are missing something."], applied:["No applications yet","Mark a job as Applied and it will show up here."], passed:["Nothing hidden","Jobs you mark Not interested go here."]};
function render(){
  $("tabs").innerHTML = TABS.map(([k, l, i]) => `<button data-t="${k}" ${k === tab ? 'aria-current="page"' : ""}>${ic(i, 20)}<span>${l}</span><span class="n">${data.jobs.filter(j => matches(j, k)).length}</span></button>`).join("");
  $("tabs").querySelectorAll("button").forEach(x => x.onclick = () => { tab = x.dataset.t; render(); scrollTo({top: 0}); });
  const rows = data.jobs.filter(j => matches(j, tab));
  const feed = data.jobs.filter(j => matches(j, "feed"));
  $("stats").innerHTML = [[feed.length, "new matches"], [feed.filter(j => ["yes","likely"].includes(j.sponsorship.status)).length, "that sponsor or likely sponsor"], [data.jobs.filter(j => status(j) === "applied").length, "applied"]]
    .map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("");
  $("list").innerHTML = rows.length ? rows.map(card).join("") : `<div class="empty"><b>${EMPTY[tab][0]}</b>${EMPTY[tab][1]}</div>`;
  $("list").querySelectorAll("[data-s]").forEach(x => x.onclick = () => {
    const j = data.jobs.find(y => y.id === x.dataset.id);
    x.dataset.s === "started" && status(j) !== "started" ? startedDialog(j) : setStatus(j.id, x.dataset.s);
  });
}
fetch("data/jobs.json").then(r => r.json()).then(d => {
  data = d;
  $("sub").textContent = `Last scan ${new Date(d.generated_at).toLocaleString()}, ${d.jobs.length} jobs found`;
  if (d.sample) $("banner").innerHTML = `<div class="banner">Sample data. Run the scan workflow to load real jobs.</div>`;
  $("min").innerHTML = [5,4.5,4,3.5,3,2.5,1].map(v => `<option ${v === (d.min_score || 3.5) ? "selected" : ""}>${v}</option>`).join("");
  ["min","fam","sp"].forEach(id => $(id).onchange = render);
  $("export").innerHTML = ic("dl") + "Export tracker"; $("health").innerHTML = ic("pulse") + "Scan health";
  $("export").onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 1)], {type: "application/json"})); a.download = "jobradar-tracker.json"; a.click(); };
  $("health").onclick = healthDialog;
  render();
}).catch(() => { $("sub").textContent = ""; $("list").innerHTML = `<div class="empty"><b>Could not load job data</b>Open this through a web server or GitHub Pages, not as a local file. Run python -m http.server 8000 and visit localhost:8000.</div>`; });
