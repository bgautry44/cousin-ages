
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

  // Force YYYY-MM-DD to be interpreted as a LOCAL date (not UTC)
  if(typeof s === "string"){
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m){
      const y = Number(m[1]);
      const mo = Number(m[2]) - 1;
      const d = Number(m[3]);
      const dt = new Date(y, mo, d);
      return isNaN(dt.getTime()) ? null : dt;
    }
  }

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
function compareByBirthDateOnly(a, b){
  // Expect birthdate fields like a.birthdate or a.birth (string "YYYY-MM-DD")
  // If your data uses a different field name, adjust ONLY the two lines below.
  const aDob = a.birthdate ?? a.birth ?? null;
  const bDob = b.birthdate ?? b.birth ?? null;

  // Put missing DOBs at the bottom
  if(!aDob && !bDob) return 0;
  if(!aDob) return 1;
  if(!bDob) return -1;

  // String compare works for YYYY-MM-DD format
  if(aDob < bDob) return -1;   // earlier date first (older cousin first)
  if(aDob > bDob) return 1;

  // Tie-breaker for identical DOBs (stable, predictable)
  const aName = (a.name ?? "").toLowerCase();
  const bName = (b.name ?? "").toLowerCase();
  return aName.localeCompare(bName);
}
  function filterSort(rows){
  let out = Array.isArray(rows) ? rows : [];

  // Filter (optional): hide deceased
  if(!state.showDeceased){
    out = out.filter(r => (r?.status ?? "") !== "deceased");
  }

  // Sort: birth order only (oldest DOB first if sortOldestFirst === true)
  out = out.slice().sort((a, b) => {
    // Try several possible DOB field names safely
    const aDob = a?.birthdate ?? a?.birth ?? a?.dob ?? a?.dateOfBirth ?? null;
    const bDob = b?.birthdate ?? b?.birth ?? b?.dob ?? b?.dateOfBirth ?? null;

    // Missing DOBs go last
    if(!aDob && !bDob) return 0;
    if(!aDob) return 1;
    if(!bDob) return -1;

    // Works for "YYYY-MM-DD"
    if(aDob < bDob) return state.sortOldestFirst ? -1 : 1;
    if(aDob > bDob) return state.sortOldestFirst ? 1 : -1;

    // Tie-breaker: name
    return (a?.name ?? "").localeCompare(b?.name ?? "");
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
function toISODateLocal(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
  // Handles ISO strings, JS Dates, or Excel serial numbers
  function excelDateToISO(v){
    if(v == null || v === "") return null;

    // Already a Date
    if(Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())){
      return toISODateLocal(v);
    }

    // ISO-ish string
    // ISO-ish string
if(typeof v === "string"){
  // If it's YYYY-MM-DD, force LOCAL date parsing (prevents timezone day-shift)
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(m){
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    const d = new Date(y, mo, day);
    if(!isNaN(d.getTime())) return toISODateLocal(d);
    return null;
  }

  // Otherwise, fall back to Date parsing
  const d = new Date(v);
  if(!isNaN(d.getTime())) return toISODateLocal(d);
  return null;
}
    
    // Excel serial number (days since 1899-12-30)
    if(typeof v === "number" && isFinite(v)){
      const epoch = new Date(Date.UTC(1899, 11, 30));
      const ms = v * 24 * 60 * 60 * 1000;
      const d = new Date(epoch.getTime() + ms);
      return toISODateLocal(d);
    }

    return null;
  }

  hookUI();
  render();
})();
