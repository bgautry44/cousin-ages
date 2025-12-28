(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    data: Array.isArray(window.COUSIN_DATA) ? window.COUSIN_DATA : [],
    showDeceased: true,
    sortOldestFirst: true,
    q: ""
  };

  // --- helpers ---
  function normalize(s) { return (s || "").toString().toLowerCase().trim(); }

  function localDateFromYMD(y, m, d) {
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  function parseISODate(v) {
    if (v == null || v === "") return null;

    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }

    if (typeof v === "string") {
      const s = v.trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return localDateFromYMD(m[1], m[2], m[3]);

      const d = new Date(s);
      if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return null;
    }

    return null;
  }

  function todayLocal() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

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
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[s]));
  }

  // Normalize photos:
  // - prefer r.photos (array)
  // - else fall back to r.photo (single)
  function photoList(r) {
    const arr = Array.isArray(r?.photos) ? r.photos : null;
    if (arr && arr.length) return arr.map(x => String(x).trim()).filter(Boolean);
    const single = r?.photo ? String(r.photo).trim() : "";
    return single ? [single] : [];
  }

  function computeRow(r) {
    const birth = parseISODate(r.birthdate);
    const passed = parseISODate(r.passed);

    const today = todayLocal();
    const passedEffective = (passed && passed.getTime() <= today.getTime()) ? passed : null;

    const ref = passedEffective ?? today;
    const ageObj = birth ? diffYMD(birth, ref) : null;

    return {
      ...r,
      name: (r?.name ?? "").toString(),
      tribute: (r?.tribute ?? "").toString(),
      _birth: birth,
      _passed: passedEffective,
      ageText: birth ? fmtYMD(ageObj) : "—",
      status: passedEffective ? "deceased" : "alive",
      _photos: photoList(r)
    };
  }

  function filterSort(rows) {
    let out = Array.isArray(rows) ? rows : [];

    if (!state.showDeceased) out = out.filter(r => r.status !== "deceased");

    const q = normalize(state.q);
    if (q) out = out.filter(r => normalize(r.name).includes(q));

    out = out.slice().sort((a, b) => {
      const aT = a._birth ? a._birth.getTime() : Number.POSITIVE_INFINITY;
      const bT = b._birth ? b._birth.getTime() : Number.POSITIVE_INFINITY;
      if (aT !== bT) return state.sortOldestFirst ? (aT - bT) : (bT - aT);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return out;
  }

  // --- carousel engine ---
  // We keep timers so re-renders do not leak intervals
  const carouselTimers = new Map();

  function stopCarouselFor(imgEl) {
    const t = carouselTimers.get(imgEl);
    if (t) clearInterval(t);
    carouselTimers.delete(imgEl);
  }

  function startCarousel(imgEl, photos) {
    stopCarouselFor(imgEl);

    if (!imgEl || !Array.isArray(photos) || photos.length === 0) return;

    let idx = 0;
    imgEl.src = photos[0];

    // If only one photo, no need to rotate
    if (photos.length === 1) return;

    const tickMs = 2600; // smooth but not frantic on phones

    const timer = setInterval(() => {
      idx = (idx + 1) % photos.length;
      imgEl.classList.remove("fadeIn");
      // force reflow to restart animation
      void imgEl.offsetWidth;
      imgEl.src = photos[idx];
      imgEl.classList.add("fadeIn");
    }, tickMs);

    carouselTimers.set(imgEl, timer);

    // Tap to advance immediately (nice on mobile)
    imgEl.addEventListener("click", () => {
      idx = (idx + 1) % photos.length;
      imgEl.classList.remove("fadeIn");
      void imgEl.offsetWidth;
      imgEl.src = photos[idx];
      imgEl.classList.add("fadeIn");
    }, { once: false });
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

    // stop all existing carousels before rebuild
    for (const [imgEl] of carouselTimers) stopCarouselFor(imgEl);

    const computed = state.data.map(computeRow);
    const filtered = filterSort(computed);

    asOf.textContent = `As of: ${todayLocal().toLocaleDateString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric"
    })}`;
    count.textContent = `Shown: ${filtered.length} / ${computed.length}`;

    cards.innerHTML = "";
    if (filtered.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    for (const r of filtered) {
      const isMemorial = r.status === "deceased";
      const badgeClass = isMemorial ? "badge deceased" : "badge alive";
      const badgeText = isMemorial ? "In Memoriam" : "Living";

      const years = (r._birth || r._passed)
        ? `${r._birth ? r._birth.getFullYear() : "—"} – ${r._passed ? r._passed.getFullYear() : "—"}`
        : "";

      const photos = r._photos;

      const card = document.createElement("section");
      card.className = "card" + (isMemorial ? " memorial" : "");

      // Avatar area: image if we have at least one photo, else placeholder
      const avatarHtml = photos.length
        ? `
          <div class="avatarWrap">
            <img class="avatar" alt="${escapeHtml(r.name || "Photo")}" loading="lazy" />
            ${photos.length > 1 ? `<div class="avatarDot" title="Multiple photos">↻</div>` : (isMemorial ? `<div class="avatarDot" title="In Memoriam">✦</div>` : ``)}
          </div>
        `
        : `
          <div class="avatarWrap">
            <div class="avatar placeholder" aria-hidden="true">No photo</div>
            ${isMemorial ? `<div class="avatarDot" title="In Memoriam">✦</div>` : ``}
          </div>
        `;

      const memorialLine = isMemorial
        ? `
          <div class="memorialMark">In loving memory</div>
          ${years ? `<div class="memorialYears">${escapeHtml(years)}</div>` : ``}
        `
        : ``;

      const tributeBlock = (isMemorial && r.tribute && r.tribute.trim())
        ? `<div class="tribute">“${escapeHtml(r.tribute.trim())}”</div>`
        : "";

      card.innerHTML = `
        <div class="cardTop">
          ${avatarHtml}
          <div class="cardTopText">
            <h2 class="name">${escapeHtml(r.name || "Unnamed")}</h2>
            <div class="${badgeClass}">${badgeText}</div>
            ${memorialLine}
          </div>
        </div>

        <div class="row"><span>Birthdate</span><span class="value">${fmtDate(r._birth)}</span></div>
        <div class="row"><span>${isMemorial ? "Age at passing" : "Current age"}</span><span class="value">${escapeHtml(r.ageText)}</span></div>
        <div class="row"><span>Passed</span><span class="value">${fmtDate(r._passed)}</span></div>
        ${tributeBlock}
      `;

      cards.appendChild(card);

      // Start carousel if there is an <img> avatar
      const imgEl = card.querySelector("img.avatar");
      if (imgEl && photos.length) startCarousel(imgEl, photos);
    }
  }

  function toISODateLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function excelDateToISO(v) {
    if (v == null || v === "") return null;

    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
      return toISODateLocal(v);
    }

    if (typeof v === "string") {
      const s = v.trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const d = localDateFromYMD(m[1], m[2], m[3]);
        return d ? toISODateLocal(d) : null;
      }

      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return toISODateLocal(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
      }
      return null;
    }

    if (typeof v === "number" && isFinite(v)) {
      const wholeDays = Math.floor(v);
      const base = new Date(1899, 11, 30);
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
      searchEl.addEventListener("input", (e) => { state.q = e.target.value; render(); });
    }
    if (showDeceasedEl) {
      showDeceasedEl.addEventListener("change", (e) => { state.showDeceased = e.target.checked; render(); });
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

          // Columns: NAME, BIRTHDATE, PASSED, PHOTO or PHOTOS, TRIBUTE (case-insensitive)
          const mapped = rows.map((r) => {
            const keys = Object.keys(r);
            const get = (k) => r[keys.find((x) => String(x).toLowerCase().trim() === k)] ?? null;

            const name = get("name");
            const birth = get("birthdate");
            const passed = get("passed");
            const photo = get("photo");
            const photos = get("photos");    // optional: comma-separated list
            const tribute = get("tribute");  // optional

            let photosArr = [];
            if (photos) {
              photosArr = String(photos).split(",").map(x => x.trim()).filter(Boolean);
            } else if (photo) {
              photosArr = [String(photo).trim()].filter(Boolean);
            }

            return {
              name: name ? String(name).trim() : "",
              birthdate: excelDateToISO(birth),
              passed: excelDateToISO(passed),
              photos: photosArr.length ? photosArr : undefined,
              tribute: tribute ? String(tribute).trim() : ""
            };
          }).filter((x) => x.name || x.birthdate || x.passed || (x.photos && x.photos.length) || x.tribute);

          state.data = mapped;
          render();
        } catch (err) {
          alert("Could not read that Excel file. Please confirm it has columns like NAME, BIRTHDATE, PASSED (optional: PHOTO/PHOTOS, TRIBUTE).");
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
