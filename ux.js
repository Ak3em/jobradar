// UX layer: loaded after app.js. Wraps render() so app.js stays untouched.
(() => {
  const baseRender = render, REDUCE = matchMedia("(prefers-reduced-motion: reduce)"), EASE = "cubic-bezier(0.23,1,0.32,1)";
  let built = false, lastKey = "";

  /* One-time: rescue v2 tracker ("jr2") statuses into v1 ("jr") shape. */
  try {
    const v2 = JSON.parse(localStorage.getItem("jr2") || "null");
    if (v2 && v2.schema === 2 && v2.jobs && typeof v2.jobs === "object") {
      const v1 = JSON.parse(localStorage.getItem("jr") || "{}");
      let changed = false;
      for (const [id, j] of Object.entries(v2.jobs)) {
        if (!j || typeof j !== "object" || j.custom) continue;
        const cur = v1[id] || {}, had = (j.history || []).length > 0;
        if (j.status) {
          if (cur.status !== j.status || (cur.missing || "") !== (j.missing || "")) {
            v1[id] = {status: j.status};
            if (j.missing) v1[id].missing = j.missing;
            changed = true;
          }
        } else if (had && v1[id]) { delete v1[id]; changed = true; }
      }
      if (changed) localStorage.setItem("jr", JSON.stringify(v1));
      localStorage.removeItem("jr2");
    }
  } catch {}
  const absDate = j => new Date(new Date(data.generated_at) - j.age_days * 864e5).toLocaleDateString(undefined, {month: "short", day: "numeric"});

  function build(){
    if (built) return; built = true;
    const seg = document.createElement("div"); seg.className = "seg"; seg.setAttribute("role", "radiogroup"); seg.setAttribute("aria-label", "Sponsorship filter");
    [["hide", "Yes + not stated"], ["yes", "Says it sponsors"], ["all", "Show all"]].forEach(([v, l]) => {
      const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "radio"); b.dataset.v = v; b.textContent = l;
      b.onclick = () => { $("sp").value = v; $("sp").dispatchEvent(new Event("change")); }; seg.append(b);
    });
    document.querySelector(".filters").before(seg);
    const pipe = document.createElement("div"); pipe.id = "pipe"; pipe.className = "pipe"; $("stats").after(pipe);
    const t = document.createElement("button"); t.id = "triageBtn"; t.innerHTML = ic("feed") + "Triage mode"; t.onclick = openTriage;
    const r = document.createElement("button"); r.id = "refreshBtn"; r.type = "button";
    r.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg><span>Refresh</span>';
    r.setAttribute("aria-label", "Refresh job listings"); r.onclick = doRefresh;
    const s = document.createElement("a"); s.className = "btn"; s.target = "_blank"; s.rel = "noopener";
    s.href = "https://github.com/Ak3em/jobradar/actions/workflows/scan.yml";
    s.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Run scan</span>';
    s.setAttribute("aria-label", "Run a new scan (opens GitHub Actions)");
    $("export").before(r); $("export").before(s); $("export").before(t);
  }

  async function doRefresh(){
    const b = $("#refreshBtn"); if (!b || b.disabled) return; b.disabled = true; b.classList.add("spin");
    try {
      const d = await fetch(`data/jobs.json?t=${Date.now()}`, {cache: "no-store"}).then(x => { if (!x.ok) throw 0; return x.json(); });
      const old = new Set((data.jobs || []).map(j => j.id));
      data = d;
      $("sub").textContent = `Last scan ${new Date(d.generated_at).toLocaleString()}, ${d.jobs.length} jobs found`;
      $("banner").innerHTML = d.sample ? `<div class="banner">Sample data. Run the scan workflow to load real jobs.</div>` : "";
      $("min").innerHTML = [5, 4.5, 4, 3.5, 3, 2.5, 1].map(v => `<option ${v === (d.min_score || 3.5) ? "selected" : ""}>${v}</option>`).join("");
      render();
      const added = d.jobs.filter(j => !old.has(j.id)).length;
      toast(added ? `${added} new job${added > 1 ? "s" : ""} since last refresh` : "Already up to date");
    } catch { toast("Couldn't refresh. Check your connection and try again."); }
    finally { b.disabled = false; b.classList.remove("spin"); }
  }

  function enhance(){
    build();
    document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-checked", String($("sp").value === b.dataset.v)));
    const n = s => data.jobs.filter(j => status(j) === s).length, steps = [["saved", "Saved"], ["started", "Started"], ["applied", "Applied"]];
    const tot = Math.max(1, steps.reduce((a, [s]) => a + n(s), 0));
    $("pipe").innerHTML = steps.map(([s, l]) => `<button data-p="${s}" aria-label="${l}: ${n(s)}. Open tab"><b>${n(s)}</b><span>${l}</span><i style="--w:${Math.round(100 * n(s) / tot)}%"></i></button>`).join("");
    $("pipe").querySelectorAll("button").forEach(b => b.onclick = () => { tab = b.dataset.p; render(); scrollTo({top: 0}); });
    const key = tab + $("min").value + $("fam").value + $("sp").value;
    document.querySelectorAll(".card").forEach((c, i) => {
      const j = data.jobs.find(y => y.id === c.querySelector("[data-id]")?.dataset.id), t = c.querySelector(".tag");
      if (j && t && j.age_days > 7) t.textContent = "Posted " + absDate(j);
      if (key !== lastKey && i < 6 && !REDUCE.matches) { c.classList.add("enter"); c.style.animationDelay = i * 50 + "ms"; }
    });
    lastKey = key;
  }
  window.render = () => { baseRender(); enhance(); };

  function openTriage(){
    const q = data.jobs.filter(j => matches(j, "feed")); let i = 0;
    const o = document.createElement("div"); o.className = "triage"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true"); o.setAttribute("aria-label", "Triage mode");
    const bg = document.querySelectorAll(".wrap,nav"); bg.forEach(e => e.inert = true); document.body.style.overflow = "hidden"; document.body.append(o);
    function close(){ removeEventListener("keydown", onKey); o.remove(); bg.forEach(e => e.inert = false); document.body.style.overflow = ""; $("triageBtn").focus(); }
    function decide(act, card, dir){
      const j = q[i], go = () => { setStatus(j.id, act); i++; show(); };
      if (!card || REDUCE.matches) return go();   // keyboard and reduced motion: instant
      card.animate([{transform: card.style.transform || "none", opacity: 1}, {transform: `translateX(${dir * innerWidth}px) rotate(${dir * 12}deg)`, opacity: 0}], {duration: 220, easing: EASE, fill: "forwards"}).onfinish = go;
    }
    function onKey(e){
      if (e.key === "Escape") return close();
      if (i >= q.length) return;
      if (e.key === "ArrowRight") decide("saved"); else if (e.key === "ArrowLeft") decide("passed"); else if (e.key.toLowerCase() === "o") open(q[i].url, "_blank", "noopener");
    }
    addEventListener("keydown", onKey);
    function drag(card){
      let x0, t0, dx = 0, on = false, pid;
      card.onpointerdown = e => { if (on || e.target.closest("a,button")) return; on = true; pid = e.pointerId; card.setPointerCapture(pid); x0 = e.clientX; t0 = Date.now(); };
      card.onpointermove = e => {
        if (!on || e.pointerId !== pid) return; dx = e.clientX - x0;
        const d = Math.abs(dx) > 120 ? Math.sign(dx) * (120 + (Math.abs(dx) - 120) * .35) : dx;   // friction past 120px
        card.style.transform = `translateX(${d}px) rotate(${d / 18}deg)`; card.dataset.side = dx > 0 ? "r" : "l"; card.style.setProperty("--p", Math.min(Math.abs(dx) / 110, 1));
      };
      const end = e => {
        if (!on || e.pointerId !== pid) return; on = false;
        const v = Math.abs(dx) / (Date.now() - t0 || 1);
        if (Math.abs(dx) > 110 || (v > .11 && Math.abs(dx) > 30)) return decide(dx > 0 ? "saved" : "passed", card, Math.sign(dx));
        if (!REDUCE.matches) card.animate([{transform: card.style.transform}, {transform: "none"}], {duration: 300, easing: "cubic-bezier(0.32,0.72,0,1)"});
        card.style.transform = ""; card.style.setProperty("--p", 0); dx = 0;
      };
      card.onpointerup = end; card.onpointercancel = end;
    }
    function show(){
      if (i >= q.length){
        o.innerHTML = `<div class="tri-empty"><b>${q.length ? "Inbox zero" : "Nothing to triage"}</b><span>${q.length ? "You went through every match." : "No matches in your feed with the current filters."}</span><button data-c>Back to feed</button></div>`;
        o.querySelector("[data-c]").onclick = close; o.querySelector("[data-c]").focus(); return;
      }
      const j = q[i], sp = j.sponsorship;
      o.innerHTML = `<header><button data-c aria-label="Close triage">${ic("passed")}</button><span class="cnt">${i + 1} of ${q.length}</span><span style="width:44px"></span></header>
       <div class="stage"><article class="tcard" style="--c:var(--${sp.status})"><span class="hint l">Pass</span><span class="hint r">Save</span>
        <div class="row"><div><div><span class="co">${esc(j.company)}</span><span class="loc">${esc(j.location)}</span></div><h2 class="ti">${esc(j.title)}</h2></div>${ring(j.score)}</div>
        <div class="spon">${ic(sp.status, 20)}<div><b>${SP[sp.status]}</b><span class="why">${esc(sp.reason)}</span></div></div>
        <ul>${j.matches.slice(0, 2).map(m => `<li>${esc(m)}</li>`).join("")}${j.gaps.slice(0, 2).map(g => `<li class="gap">Gap: ${esc(g)}</li>`).join("")}</ul>
        <div class="meta"><span class="tag">${j.grad_year === "2027" ? "Class of 2027" : "Grad year not stated"}</span><span class="tag">${FAM[j.family]}</span>${j.flags.map(f => `<span class="tag warn">${ic("warn", 14)}${esc(f)}</span>`).join("")}</div></article></div>
       <footer><button data-a="passed">${ic("passed")}Pass</button><a class="btn" href="${esc(j.url)}" target="_blank" rel="noopener">Open${ic("out")}</a><button data-a="saved">${ic("save")}Save</button></footer>
       <p class="keys">Left arrow to pass, right arrow to save, O to open, Esc to close</p>`;
      const card = o.querySelector(".tcard");
      o.querySelectorAll("[data-a]").forEach(b => b.onclick = () => decide(b.dataset.a, card, b.dataset.a === "saved" ? 1 : -1));
      o.querySelector("[data-c]").onclick = close; o.querySelector("footer button").focus(); drag(card);
    }
    show();
  }
})();
