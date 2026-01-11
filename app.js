(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    data: Array.isArray(window.COUSIN_DATA) ? window.COUSIN_DATA : [],
    announcements: [],
    showDeceased: true,
    sortOldestFirst: true,
    q: ""
  };

  // -----------------------
  // Helpers
  // -----------------------
  function normalize(s) {
    return (s || "").toString().toLowerCase().trim();
  }

  function localDateFromYMD(y, m, d) {
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Parse as LOCAL date to avoid 1-day shifts
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

  function sameMonthDay(a, b) {
    return a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function nextBirthdayDate(birth, today) {
    if (!birth) return null;
    const d = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    if (d < today) return new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
    return d;
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

  function fmtFullDate(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
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

  // -----------------------
  // Contact helpers
  // -----------------------
  function normalizeEmail(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
    return ok ? s : "";
  }

  function phoneToTelHref(raw) {
    const s = String(raw || "").trim();
    if (!s) return "";
    const hasPlus = /^\s*\+/.test(s);
    const digits = s.replace(/[^\d]/g, "");
    if (!digits || digits.length < 7) return "";
    return "tel:" + ((hasPlus ? "+" : "") + digits);
  }

  // Photos:
  // - prefer r.photos (array)
  // - else fall back to r.photo (single string)
  function photoList(r) {
    const arr = Array.isArray(r?.photos) ? r.photos : null;
    if (arr && arr.length) return arr.map(x => String(x).trim()).filter(Boolean);

    const single = (typeof r?.photo === "string") ? String(r.photo).trim() : "";
    return single ? [single] : [];
  }

  // -----------------------
  // Announcements (GLOBAL)
  // -----------------------
  function normalizeAnnouncements(v, maxItems = 10) {
    const arr = Array.isArray(v) ? v : [];
    const out = [];

    for (const item of arr) {
      if (!item || typeof item !== "object") continue;

      const text = String(item.text ?? item.message ?? "").replace(/\s+/g, " ").trim();
      if (!text) continue;

      const dateObj = parseISODate(item.date);
      const location = String(item.location ?? "").replace(/\s+/g, " ").trim();
      const pinned = !!item.pinned;

      out.push({
        text,
        date: dateObj || null,
        dateRaw: item.date || "",
        location,
        pinned
      });

      if (out.length >= maxItems) break;
    }

    // Sort: pinned first, then newest date first (if present), then text
    out.sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;

      const at = a.date instanceof Date ? a.date.getTime() : NaN;
      const bt = b.date instanceof Date ? b.date.getTime() : NaN;

      const aValid = Number.isFinite(at);
      const bValid = Number.isFinite(bt);

      if (aValid && bValid && at !== bt) return bt - at; // newest first
      if (aValid && !bValid) return -1;
      if (!aValid && bValid) return 1;

      return a.text.localeCompare(b.text);
    });

    return out;
  }

  async function loadAnnouncementsOnce() {
    // GitHub Pages-safe. File path is relative to index.html.
    // If you put announcements.json in a folder, update the path here.
    const url = "announcements.json";

    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      state.announcements = normalizeAnnouncements(json, 10);
    } catch (e) {
      console.warn("Announcements load failed:", e?.message || e);
      state.announcements = [];
    }
  }

  function upsertAnnouncementsHost(cardsEl) {
    let host = $("announcements");
    if (!host) {
      host = document.createElement("div");
      host.id = "announcements";

      // Insert above the cards container
      const parent = cardsEl.parentNode;
      parent.insertBefore(host, cardsEl);
    }
    return host;
  }

  function makeAnnouncementsBlock(posts) {
    const list = Array.isArray(posts) ? posts : [];
    if (!list.length) return null;

    const wrap = document.createElement("section");
    wrap.className = "annPanel";

    const title = document.createElement("div");
    title.className = "annTitle";
    title.textContent = "Announcements";
    wrap.appendChild(title);

    const ul = document.createElement("ul");
    ul.className = "annList";

    for (const p of list) {
      const li = document.createElement("li");
      li.className = "annItem";

      if (p.pinned) {
        const pin = document.createElement("div");
        pin.className = "annPinned";
        pin.textContent = "Pinned";
        li.appendChild(pin);
      }

      if (p.date instanceof Date && !Number.isNaN(p.date.getTime())) {
        const d = document.createElement("div");
        d.className = "annDate";
        d.textContent = fmtFullDate(p.date);
        li.appendChild(d);
      }

      const body = document.createElement("div");
      body.className = "annText";
      body.textContent = p.text;
      li.appendChild(body);

      const loc = String(p.location || "").trim();
      if (loc) {
        const l = document.createElement("div");
        l.className = "annLocation";
        l.textContent = `Location: ${loc}`;
        li.appendChild(l);
      }

      ul.appendChild(li);
    }

    if (!ul.children.length) return null;

    wrap.appendChild(ul);
    return wrap;
  }

  // -----------------------
  // Data computation
  // -----------------------
  function computeRow(r) {
    const birth = parseISODate(r.birthdate);
    const passed = parseISODate(r.passed);

    const today = todayLocal();
    const passedEffective = (passed && passed.getTime() <= today.getTime()) ? passed : null;

    const ref = passedEffective ?? today;
    const ageObj = birth ? diffYMD(birth, ref) : null;

    const isBirthdayToday = !!(birth && !passedEffective && sameMonthDay(birth, today));

    const wouldHaveTurned = (birth && passedEffective && sameMonthDay(birth, today))
      ? (today.getFullYear() - birth.getFullYear())
      : null;

    const nextBirthday = birth ? nextBirthdayDate(birth, today) : null;

    const phoneRaw = (r?.phone ?? "").toString().trim();
    const emailClean = normalizeEmail(r?.email);

    return {
      ...r,
      name: (r?.name ?? "").toString(),
      tribute: (r?.tribute ?? "").toString(),
      _birth: birth,
      _passed: passedEffective,
      ageText: birth ? fmtYMD(ageObj) : "—",
      status: passedEffective ? "deceased" : "alive",
      _photos: photoList(r),
      isBirthdayToday,
      nextBirthday,
      wouldHaveTurned,

      _phoneDisplay: phoneRaw,
      _phoneHref: phoneToTelHref(phoneRaw),
      _email: emailClean
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

  // -----------------------
  // Carousel engine
  // -----------------------
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

    const setSrc = () => {
      imgEl.classList.remove("fadeIn");
      void imgEl.offsetWidth;
      imgEl.src = photos[idx];
      imgEl.classList.add("fadeIn");
    };

    imgEl.onerror = () => {
      if (photos.length <= 1) return;
      idx = (idx + 1) % photos.length;
      setSrc();
    };

    setSrc();

    if (photos.length === 1) return;

    const tickMs = 2600;
    const timer = setInterval(() => {
      idx = (idx + 1) % photos.length;
      setSrc();
    }, tickMs);

    carouselTimers.set(imgEl, timer);

    imgEl.onclick = () => {
      idx = (idx + 1) % photos.length;
      setSrc();
    };
  }

  // -----------------------
  // Render
  // -----------------------
  function render() {
    const cards = $("cards");
    const empty = $("empty");
    const asOf = $("asOf");
    const count = $("count");
    const birthdayLine = $("birthdayLine");

    if (!cards || !empty || !asOf || !count) {
      console.error("Missing required DOM elements (cards, empty, asOf, count).");
      return;
    }

    // stop carousels
    for (const [imgEl] of carouselTimers) stopCarouselFor(imgEl);

    const computed = state.data.map(computeRow);
    const filtered = filterSort(computed);
    const today = todayLocal();

    asOf.textContent = `As of: ${today.toLocaleDateString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric"
    })}`;
    count.textContent = `Shown: ${filtered.length} / ${computed.length}`;

    // Upcoming birthdays line
    if (birthdayLine) {
      const soon = computed
        .filter(r => r.status === "alive" && r._birth && r.nextBirthday)
        .map(r => ({ name: r.name, date: r.nextBirthday }))
        .filter(x => {
          const diffDays = Math.ceil((x.date - today) / 86400000);
          return diffDays >= 0 && diffDays <= 30;
        })
        .sort((a, b) => a.date - b.date);

      if (soon.length) {
        birthdayLine.innerHTML =
          `📅 <strong>Upcoming birthdays (next 30 days):</strong> ` +
          soon.map(x =>
            `<span>${escapeHtml(x.name)} (${x.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })})</span>`
          ).join(" • ");
        birthdayLine.hidden = false;
      } else {
        birthdayLine.hidden = true;
      }
    }

    // --- Announcements (global) ---
    const annHost = upsertAnnouncementsHost(cards);
    annHost.innerHTML = "";
    const annBlock = makeAnnouncementsBlock(state.announcements);
    if (annBlock) annHost.appendChild(annBlock);

    // cards
    cards.innerHTML = "";
    if (filtered.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    for (const r of filtered) {
      const isMemorial = r.status === "deceased";
      const isBirthday = !!r.isBirthdayToday;

      let badgeClass = isMemorial ? "badge deceased" : "badge alive";
      let badgeText = isMemorial ? "In Memoriam" : "Living";

      if (isBirthday) {
        badgeClass = "badge birthday";
        badgeText = "🎂 Birthday Today";
      }

      const years = (r._birth || r._passed)
        ? `${r._birth ? r._birth.getFullYear() : "—"} – ${r._passed ? r._passed.getFullYear() : "—"}`
        : "";

      const photos = r._photos;

      const card = document.createElement("section");
      card.className =
        "card" +
        (isMemorial ? " memorial" : "") +
        (isBirthday ? " birthdayToday" : "");

      const avatarHtml = photos.length
        ? `
          <div class="avatarWrap">
            <img class="avatar" alt="${escapeHtml(r.name || "Photo")}" loading="lazy" />
            ${
              photos.length > 1
                ? `<div class="avatarDot" title="Multiple photos">↻</div>`
                : (isMemorial ? `<div class="avatarDot" title="In Memoriam">✦</div>` : ``)
            }
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

      const wouldHaveTurnedBlock =
        (isMemorial && r.wouldHaveTurned != null)
          ? `<div class="wouldHaveTurned">Remembering <strong>${escapeHtml(r.name)}</strong> today — would have turned <strong>${r.wouldHaveTurned}</strong>.</div>`
          : "";

      const phoneLink = (r._phoneDisplay && r._phoneHref)
        ? `<a class="contactLink" href="${escapeHtml(r._phoneHref)}">${escapeHtml(r._phoneDisplay)}</a>`
        : "";

      const emailLink = (r._email)
        ? `<a class="contactLink" href="mailto:${encodeURIComponent(r._email)}">${escapeHtml(r._email)}</a>`
        : "";

      const contactBlock = (phoneLink || emailLink)
        ? `
          <div class="row">
            <span>Contact</span>
            <span class="value contactValue">
              ${[phoneLink, emailLink].filter(Boolean).join(" · ")}
            </span>
          </div>
        `
        : ``;

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
        ${contactBlock}
        ${tributeBlock}
        ${wouldHaveTurnedBlock}
      `;

      cards.appendChild(card);

      const imgEl = card.querySelector("img.avatar");
      if (imgEl && photos.length) startCarousel(imgEl, photos);
    }
  }

  // -----------------------
  // UI hooks
  // -----------------------
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
  }

  // -----------------------
  // Bootstrap
  // -----------------------
  (async function bootstrap() {
    hookUI();
    await loadAnnouncementsOnce();
    render();
  })();
})();
