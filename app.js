(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    data: Array.isArray(window.COUSIN_DATA) ? window.COUSIN_DATA : [],
    showDeceased: true,
    sortOldestFirst: true, // true = oldest DOB first
    q: ""
  };

  function normalize(s) {
    return (s || "").toString().toLowerCase().trim();
  }

  // Always return a LOCAL date (midnight local) to avoid UTC day-shift
  function localDateFromYMD(y, m, d) {
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  function parseISODate(v) {
    if (v == null || v === "") return null;

    // Already a Date
    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }

    // "YYYY-MM-DD" -> local
    if (typeof v === "string") {
      const s = v.trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return localDateFromYMD(m[1], m[2], m[3]);

      // Fallback parse: normalize to local Y/M/D
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      return null;
    }

    return null;
  }

  function todayLocal() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  // Calendar-accurate Y/M/D difference
  function diffYMD(from, to) {
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

  function fmtYMD(o) {
    if (!o) return "—";
    return [
      `${o.y} year${o.y === 1 ? "" : "s"}`,
      `${o.m} month${o.m === 1 ? "" : "s"}`,
      `${o.d} day${o.d === 1 ? "" : "s"}`
    ].join(", ");
  }

  function fmtDate(d) {
    if (!d) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (s) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[s]));
  }

  function photoUrl(r) {
    const p = r?.photo;
    if (!p) return null;
    const s = String(p).trim();
    if (!s) return null;
    // allow either "photos/..." or full https URL
    if (/^https?:\/\//i.test(s)) return s;
    return s;
  }

  function computeRow(r) {
    const birth = parseISODate(r.birthdate);
    const passed = parseISODate(r.passed);

    // If passed is in the future (data entry error), treat as not passed yet
    const passedEffective = (passed && passed.getTime() <= todayLocal().getTime()) ? passed : null;

    const ref = passedEffective ?? todayLocal();
    const ageObj = birth ? diffYMD(birth, ref) : null;

    return {
      ...r,
      name: (r?.name ?? "").toString(),
      photo: r?.photo ?? null,
      _birth: birth,
      _passed: passedEffective,
      ageText: birth ? fmtYMD(ageObj) : "—",
      status: passedEffective ? "deceased" : "alive"
    };
  }

  function filterSort(rows) {
    let out = Array.isArray(rows) ? rows : [];

    if (!state.showDeceased) {
      out = out.filter((r) => r.status !== "deceased");
    }

    const q = normalize(state.q);
    if (q) {
      out = out.filter((r) => normalize(r.name).includes(q));
    }

    // Sort strictly by DOB (birth order). Missing DOB goes last.
    out = out.slice().sort((a, b) => {
      const aT = a._birth ? a._birth.getTime() : Number.POSITIVE_INFINITY;
      const bT = b._birth ? b._birth.getTime() : Number.POSITIVE_INFINITY;

      if (aT !== bT) {
        return state.sortOldestFirst ? (aT - bT) : (bT - aT);
      }

      // Tie-breaker: name
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return out;
  }

  function render() {
    const cards = $("cards");
    const empty = $("empty");
    const asOf = $("asOf");
    const count = $("count");

    if (!cards || !empty || !asOf || !count) {
      console.error("Missing required DOM elements (cards, empty, asOf, count).");
      return;
    }

    const computed = state.data.map(computeRow);
    const filtered = filterSort(computed);

    asOf.textContent = `As of: ${todayLocal().toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric"
    })}`;
    count.textContent = `Shown: ${filtered.length} / ${computed.length}`;

    cards.innerHTML = "";
    if (filtered.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    for (const r of filtered) {
      const badgeClass = r.status === "deceased" ? "badge deceased" : "badge alive";
      const badgeText = r.status === "deceased" ? "Deceased" : "Living";

      const img = photoUrl(r);
      const photoHtml = img
        ? `<img class="avatar" src="${escapeHtml(img)}" alt="${escapeHtml(r.name || "Photo")}" loading="lazy" />`
        : `<div class="avatar placeholder" aria-hidden="true">No photo</div>`;

      const card = document.createElement("section");
      card.className = "card";
      card.innerHTML = `
        <div class="cardTop">
          ${photoHtml}
          <div class="cardTopText">
            <h2 class="name">${escapeHtml(r.name || "Unnamed")}</h2>
            <div class="${badgeClass}">${badgeText}</div>
          </div>
        </div>

        <div class="row"><span>Birthdate</span><span class="value">${fmtDate(r._birth)}</span></div>
        <div class="row"><span>${r.status === "deceased" ? "Age at death" : "Current age"}</span><span class="value">${escapeHtml(r.ageText)}</span></div>
        <div class="row"><span>Passed</span><span class="value">${fmtDate(r._passed)}</span></div>
      `;
      cards.appendChild(card);
    }
  }

  function toISODateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  // Handles ISO strings, JS Dates, or Excel serial numbers (no timezone shift)
  function excelDateToISO(v) {
    if (v == null || v === "") return null;

    // Already a Date
    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
      return toISODateLocal(v);
    }

    // YYYY-MM-DD (force local)
    if (typeof v === "string") {
      const s = v.trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const d = localDateFromYMD(m[1], m[2], m[3]);
        return d ? toISODateLocal(d) : null;
      }

      // Fallback parse
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return toISODateLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      }
      return null;
    }

    // Excel serial number (days since 1899-12-30)
    // Use LOCAL base date, ignore fractional day.
    if (typeof v === "number" && isFinite(v)) {
      const wholeDays = Math.floor(v);
      const base = new Date(1899, 11, 30); // local
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + wholeDays);
      return isNaN(d.getTime()) ? null : toISODateLocal(d);
    }

    return null;
  }

  function hookUI() {
    const searchEl = $("search");
    const showDeceasedEl = $("showDeceased");
    const sortBtn = $("sortBtn");

    if (searchEl) {
      searchEl.addEventListener("input", (e) => {
        state.q = e.target.value;
        render();
      });
    }

    if (showDeceasedEl) {
      showDeceasedEl.addEventListener("change", (e) => {
        state.showDeceased = e.target.checked;
        render();
      });
    }

    if (sortBtn) {
      sortBtn.addEventListener("click", () => {
        state.sortOldestFirst = !state.sortOldestFirst;
        sortBtn.textContent = state.sortOldestFirst ? "Sort: Oldest → Youngest" : "Sort: Youngest → Oldest";
        render();
      });
    }

    const fileInput = $("fileInput");
    if (fileInput) {
      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        try {
          if (typeof XLSX === "undefined") {
            alert("Excel import library (XLSX) is not loaded on this page.");
            return;
          }

          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array" });
          const firstSheetName = wb.SheetNames[0];
          const ws = wb.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

          // Expect columns: NAME, BIRTHDATE, PASSED, PHOTO (case-insensitive)
          const mapped = rows.map((r) => {
            const keys = Object.keys(r);
            const get = (k) => r[keys.find((x) => String(x).toLowerCase().trim() === k)] ?? null;

            const name = get("name");
            const birth = get("birthdate");
            const passed = get("passed");
            const photo = get("photo");

            return {
              name: name ? String(name).trim() : "",
              birthdate: excelDateToISO(birth),
              passed: excelDateToISO(passed),
              photo: photo ? String(photo).trim() : null
            };
          }).filter((x) => x.name || x.birthdate || x.passed || x.photo);

          state.data = mapped;
          render();
        } catch (err) {
          alert("Could not read that Excel file. Please confirm it has columns like NAME, BIRTHDATE, PASSED (and optional PHOTO).");
          console.error(err);
        } finally {
          e.target.value = "";
        }
      });
    }
  }

  hookUI();
  render();
})();
