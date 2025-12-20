
(function(){
  const $ = (id) => document.getElementById(id);

  const state = {
    data: Array.isArray(window.COUSIN_DATA) ? window.COUSIN_DATA : [],
    showDeceased: true,
    sortOldestFirst: true,
    q: ""
  };

  function parseISODate(s){
    if(!s) return null;
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // Calendar-accurate Y/M/D difference.
  function diffYMD(from, to){
    let y = to.getFullYear() - from.getFullYear();
    let m = to.getMonth() - from.getMonth();
    let d = to.getDate() - from.getDate();

    if (d < 0) {
      m -= 1;
      const daysInPrevMonth = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
      d += daysInPrevMonth;
    }
    if (m < 0) {
      y -= 1;
      m += 12;
    }
    return { y, m, d };
  }

  function fmtYMD(o){
    if(!o) return "—";
    const parts = [
      `${o.y} year${o.y===1?"":"s"}`,
      `${o.m} month${o.m===1?"":"s"}`,
      `${o.d} day${o.d===1?"":"s"}`
    ];
    return parts.join(", ");
  }

  function todayLocal(){
    const now = new Date();
    // Use local date without time
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function computeRow(r){
    const birth = parseISODate(r.birthdate);
    const passed = parseISODate(r.passed);
    const ref = passed ?? todayLocal();

    const ageObj = birth ? diffYMD(birth, ref) : null;
    return {
      ...r,
      _birth: birth,
      _passed: passed,
      _ageObj: ageObj,
      ageText: birth ? fmtYMD(ageObj) : "—",
      status: passed ? "deceased" : "alive",
      sortKeyDays: birth ? (ref.getTime() - birth.getTime()) : -1
    };
  }

  function normalize(s){ return (s||"").toLowerCase().trim(); }

  function filterSort(rows){
    let out = rows;

    if(!state.showDeceased){
      out = out.filter(r => r.status !== "deceased");
    }

    if(state.q){
      const q = normalize(state.q);
      out = out.filter(r => normalize(r.name).includes(q));
    }

    out = out.slice().sort((a,b)=>{
      // Older = larger sortKeyDays
      return state.sortOldestFirst ? (b.sortKeyDays - a.sortKeyDays) : (a.sortKeyDays - b.sortKeyDays);
    });

    return out;
  }

  function fmtDate(d){
    if(!d) return "—";
    return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
  }

  function render(){
    const cards = $("cards");
    const empty = $("empty");
    const asOf = $("asOf");
    const count = $("count");

    const computed = state.data.map(computeRow);
    const filtered = filterSort(computed);

    asOf.textContent = `As of: ${todayLocal().toLocaleDateString(undefined, { weekday:"short", year:"numeric", month:"short", day:"numeric" })}`;
    count.textContent = `Shown: ${filtered.length} / ${computed.length}`;

    cards.innerHTML = "";
    if(filtered.length === 0){
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    for(const r of filtered){
      const card = document.createElement("section");
      card.className = "card";

      const badgeClass = r.status === "deceased" ? "badge deceased" : "badge alive";
      const badgeText = r.status === "deceased" ? "Deceased" : "Living";

      card.innerHTML = `
        <h2 class="name">${escapeHtml(r.name || "Unnamed")}</h2>
        <div class="row"><span>Birthdate</span><span class="value">${fmtDate(r._birth)}</span></div>
        <div class="row"><span>${r.status === "deceased" ? "Age at death" : "Current age"}</span><span class="value">${escapeHtml(r.ageText)}</span></div>
        <div class="row"><span>Passed</span><span class="value">${fmtDate(r._passed)}</span></div>
        <div class="${badgeClass}">${badgeText}</div>
      `;
      cards.appendChild(card);
    }
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>"']/g, s => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[s]));
  }

  function hookUI(){
    $("search").addEventListener("input", (e)=>{ state.q = e.target.value; render(); });
    $("showDeceased").addEventListener("change", (e)=>{ state.showDeceased = e.target.checked; render(); });
    $("sortBtn").addEventListener("click", ()=>{
      state.sortOldestFirst = !state.sortOldestFirst;
      $("sortBtn").textContent = state.sortOldestFirst ? "Sort: Oldest → Youngest" : "Sort: Youngest → Oldest";
      render();
    });

    const fileInput = $("fileInput");
    if(fileInput){
      fileInput.addEventListener("change", async (e)=>{
        const file = e.target.files && e.target.files[0];
        if(!file) return;

        try{
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const firstSheetName = wb.SheetNames[0];
          const ws = wb.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

          // Expect columns: NAME, BIRTHDATE, Passed (case-insensitive)
          const mapped = rows.map(r=>{
            const keys = Object.keys(r);
            const get = (k)=> r[keys.find(x=> String(x).toLowerCase().trim() === k)] ?? null;

            const name = get("name");
            const birth = get("birthdate");
            const passed = get("passed");

            return {
              name: name ? String(name).trim() : "",
              birthdate: excelDateToISO(birth),
              passed: excelDateToISO(passed)
            };
          }).filter(x => x.name || x.birthdate || x.passed);

          state.data = mapped;
          render();
        } catch(err){
          alert("Could not read that Excel file. Please confirm it has columns like NAME, BIRTHDATE, Passed.");
          console.error(err);
        } finally {
          e.target.value = "";
        }
      });
    }
  }

  // Handles ISO strings, JS Dates, or Excel serial numbers
  function excelDateToISO(v){
    if(v == null || v === "") return null;

    // Already a Date
    if(Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())){
      return v.toISOString().slice(0,10);
    }

    // ISO-ish string
    if(typeof v === "string"){
      const d = new Date(v);
      if(!isNaN(d.getTime())) return d.toISOString().slice(0,10);
      return null;
    }

    // Excel serial number (days since 1899-12-30)
    if(typeof v === "number" && isFinite(v)){
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const ms = v * 24 * 60 * 60 * 1000;
      const d = new Date(epoch.getTime() + ms);
      return d.toISOString().slice(0,10);
    }

    return null;
  }

  hookUI();
  render();
})();
