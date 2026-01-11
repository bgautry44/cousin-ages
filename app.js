(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ============================
  // State
  // ============================
  const state = {
    data: Array.isArray(window.COUSIN_DATA) ? window.COUSIN_DATA : [],
    announcements: Array.isArray(window.COUSIN_ANNOUNCEMENTS) ? window.COUSIN_ANNOUNCEMENTS : [],
    showDeceased: true,
    sortOldestFirst: true,
    q: ""
  };

  // ============================
  // Date helpers (LOCAL dates)
  // ============================
  function localDateFromYMD(y, m, d) {
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  function parseISODate(v) {
    if (v == null || v === "") return null;

    // Already Date
    if (Object.prototype.toString.call(v) === "[object Date]" && !isNaN(v.getTime())) {
      return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    }

    // String
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
    return (d < today) ? new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate()) : d;
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
      o.y + " year" + (o.y === 1 ? "" : "s"),
      o.m + " month" + (o.m === 1 ? "" : "s"),
      o.d + " day" + (o.d === 1 ? "" : "s")
    ].join(", ");
  }

  function fmtDate(d) {
    if (!d) return "—";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  // ============================
  // Text helpers
  // ============================
  function normalize(s) {
    return (s || "").toString().toLowerCase().trim();
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

  // ============================
  // Contact helpers
  // ============================
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
    const out = [];

    if (r && Array.isArray(r.photos)) {
      for (let i = 0; i < r.photos.length; i++) {
        const s = String(r.photos[i] || "").trim();
        if (s) out.push(s);
      }
    } else if (r && typeof r.photo === "string") {
      const s = String(r.photo || "").trim();
      if (s) out.push(s);
    }

    return out;
  }

  // ============================
  // Data computation
  // ============================
  function computeRow(r) {
    const birth = parseISODate(r.birthdate);
    const passed = parseISODate(r.passed);

    const today = todayLocal();
    const passedEffective = (passed && passed.getTime() <= today.getTime()) ? passed : null;

    const ref = passedEffective || today;
    const ageObj = birth ? diffYMD(birth, ref) : null;

    const isBirthdayToday = !!(birth && !passedEffective && sameMonthDay(birth, today));
    const wouldHaveTurned = (birth && passedEffective && sameMonthDay(birth, today))
      ? (today.getFullYear() - birth.getFullYear())
      : null;

    const nextBirthday = birth ? nextBirthdayDate(birth, today) : null;

    const phoneRaw = (r && r.phone != null) ? String(r.phone).trim() : "";
    const emailClean = normalizeEmail(r ? r.email : "");

    return Object.assign({}, r, {
      name: (r && r.name != null) ? String(r.name) : "",
      tribute: (r && r.tribute != null) ? String(r.tribute) : "",
      _birth: birth,
      _passed: passedEffective,
      ageText: birth ? fmtYMD(ageObj) : "—",
      status: passedEffective ? "deceased" : "alive",
      _photos: photoList(r),
      isBirthdayToday: isBirthdayToday,
      nextBirthday: nextBirthday,
      wouldHaveTurned: wouldHaveTurned,
      _phoneDisplay: phoneRaw,
      _phoneHref: phoneToTelHref(phoneRaw),
      _email: emailClean
    });
  }

  function filterSort(rows) {
    let out = Array.isArray(rows) ? rows.slice() : [];

    if (!state.showDeceased) out = out.filter(r => r.status !== "deceased");

    const q = normalize(state.q);
    if (q) out = out.filter(r => normalize(r.name).includes(q));

    out.sort((a, b) => {
      const aT = a._birth ? a._birth.getTime() : Number.POSITIVE_INFINITY;
      const bT = b._birth ? b._birth.getTime() : Number.POSITIVE_INFINITY;
      if (aT !== bT) return state.sortOldestFirst ? (aT - bT) : (bT - aT);
      return (a.name || "").localeCompare(b.name || "");
    });

    return out;
  }

  // ============================
  // Carousel (hardened)
  // ============================
  const carouselTimers = new Map();

  function stopCarouselFor(imgEl) {
    const t = carouselTimers.get(imgEl);
    if (t) clearInterval(t);
    carouselTimers.delete(imgEl);

    if (imgEl && imgEl._carouselClickHandler) {
      imgEl.removeEventListener("click", imgEl._carouselClickHandler);
      delete imgEl._carouselClickHandler;
    }

    if (imgEl) {
      imgEl.onerror = null;
      imgEl.onload = null;
    }
  }

  function startCarousel(imgEl, photos) {
    stopCarouselFor(imgEl);
    if (!imgEl || !Array.isArray(photos) || photos.length === 0) return;

    let idx = 0;
    let consecutiveErrors = 0;

    const setSrc = () => {
      imgEl.classList.remove("fadeIn");
      void imgEl.offsetWidth;
      imgEl.src = photos[idx];
      imgEl.classList.add("fadeIn");
    };

    imgEl.onload = () => { consecutiveErrors = 0; };

    imgEl.onerror = () => {
      consecutiveErrors++;
      if (consecutiveErrors >= photos.length) {
        stopCarouselFor(imgEl);
        return;
      }
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

    imgEl._carouselClickHandler = () => {
      idx = (idx + 1) % photos.length;
      setSrc();
    };
    imgEl.addEventListener("click", imgEl._carouselClickHandler);
  }

  // ============================
  // Full-screen Photo Modal (Cousins)
  // ============================
  const modalState = { open: false, photos: [], idx: 0, title: "" };

  function ensurePhotoModal() {
    if ($("photoModal")) return;

    const modal = document.createElement("div");
    modal.id = "photoModal";
    modal.className = "modal";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");

    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__dialog" role="dialog" aria-modal="true" aria-label="Photos">
        <div class="modal__header">
          <div id="photoModalTitle" class="modal__title">Photos</div>
          <button id="photoModalClose" class="modal__close" type="button">Close</button>
        </div>
        <div class="modal__body">
          <button id="photoPrev" class="modal__nav" type="button" aria-label="Previous">‹</button>
          <div class="modal__stage">
            <img id="photoModalImg" class="modal__img" alt="Photo" />
            <div id="photoModalCounter" class="modal__counter"></div>
          </div>
          <button id="photoNext" class="modal__nav" type="button" aria-label="Next">›</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Wire once
    const backdrop = modal.querySelector(".modal__backdrop");
    const dialog = modal.querySelector(".modal__dialog");
    const stage = modal.querySelector(".modal__stage");

    const closeBtn = $("photoModalClose");
    const prevBtn = $("photoPrev");
    const nextBtn = $("photoNext");

    if (backdrop) backdrop.addEventListener("click", closePhotoModal);
    if (closeBtn) closeBtn.addEventListener("click", closePhotoModal);
    if (prevBtn) prevBtn.addEventListener("click", modalPrev);
    if (nextBtn) nextBtn.addEventListener("click", modalNext);

    modal.addEventListener("click", (e) => { if (e.target === modal) closePhotoModal(); });
    if (dialog) dialog.addEventListener("click", (e) => e.stopPropagation());

    // Swipe support
    if (stage) wireModalSwipe(stage);

    document.addEventListener("keydown", (e) => {
      if (!modalState.open) return;
      if (e.key === "Escape") closePhotoModal();
      if (e.key === "ArrowLeft") modalPrev();
      if (e.key === "ArrowRight") modalNext();
    });
  }

  function openPhotoModal(title, photos, startIdx) {
    ensurePhotoModal();

    const modal = $("photoModal");
    const img = $("photoModalImg");
    const titleEl = $("photoModalTitle");

    if (!modal || !img) return;

    const safePhotos = Array.isArray(photos) ? photos.slice() : [];
    if (!safePhotos.length) return;

    modalState.open = true;
    modalState.photos = safePhotos;
    modalState.idx = Math.max(0, Math.min(Number(startIdx || 0), safePhotos.length - 1));
    modalState.title = title || "Photos";

    if (titleEl) titleEl.textContent = modalState.title;

    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    renderModalPhoto();
  }

  function closePhotoModal() {
    const modal = $("photoModal");
    if (!modal) return;

    modalState.open = false;
    modalState.photos = [];
    modalState.idx = 0;
    modalState.title = "";

    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    const img = $("photoModalImg");
    if (img) img.removeAttribute("src");
  }

  function renderModalPhoto() {
    const img = $("photoModalImg");
    const counter = $("photoModalCounter");
    const prevBtn = $("photoPrev");
    const nextBtn = $("photoNext");

    const total = modalState.photos.length;
    if (!img) return;

    if (!total) {
      if (counter) counter.textContent = "";
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const src = modalState.photos[modalState.idx];

    img.classList.remove("fadeIn");
    void img.offsetWidth;
    img.src = src;
    img.classList.add("fadeIn");

    if (counter) counter.textContent = (modalState.idx + 1) + " / " + total;
    if (prevBtn) prevBtn.disabled = total <= 1;
    if (nextBtn) nextBtn.disabled = total <= 1;
  }

  function modalPrev() {
    const total = modalState.photos.length;
    if (total <= 1) return;
    modalState.idx = (modalState.idx - 1 + total) % total;
    renderModalPhoto();
  }

  function modalNext() {
    const total = modalState.photos.length;
    if (total <= 1) return;
    modalState.idx = (modalState.idx + 1) % total;
    renderModalPhoto();
  }

  function wireModalSwipe(stageEl) {
    const thresholdX = 40;
    const restraintY = 60;
    const minVelocity = 0.10;

    let tracking = false;
    let startX = 0;
    let startY = 0;
    let startT = 0;

    stageEl.addEventListener("touchstart", (e) => {
      if (!modalState.open) return;
      if (modalState.photos.length <= 1) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
    }, { passive: true });

    stageEl.addEventListener("touchmove", (e) => {
      if (!tracking) return;
      const t = e.touches && e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (Math.abs(dy) > restraintY && Math.abs(dy) > Math.abs(dx)) tracking = false;
    }, { passive: true });

    stageEl.addEventListener("touchend", (e) => {
      if (!tracking) return;
      tracking = false;

      const t = (e.changedTouches && e.changedTouches[0]) || null;
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Math.max(1, Date.now() - startT);
      const vx = Math.abs(dx) / dt;

      if (Math.abs(dy) > restraintY) return;

      if (Math.abs(dx) >= thresholdX && vx >= minVelocity) {
        if (e.cancelable) e.preventDefault();
        if (dx < 0) modalNext();
        else modalPrev();
      }
    }, { passive: false });

    stageEl.addEventListener("touchcancel", () => { tracking = false; }, { passive: true });
  }

  // ============================
  // Global Announcements (GitHub-only)
  // ============================
  function upsertAnnouncementsHost() {
    let host = $("announcements");
    if (!host) {
      host = document.createElement("div");
      host.id = "announcements";
      // Insert above cards if possible
      const cards = $("cards");
      if (cards && cards.parentNode) cards.parentNode.insertBefore(host, cards);
      else document.body.appendChild(host);
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

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p || typeof p !== "object") continue;

      const text = String(p.text || p.message || "").trim();
      if (!text) continue;

      const li = document.createElement("li");
      li.className = "annItem";

      // Optional date
      const when = parseISODate(p.date);
      if (when && !Number.isNaN(when.getTime())) {
        const d = document.createElement("div");
        d.className = "annDate";
        d.textContent = when.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
        li.appendChild(d);
      }

      // Optional location
      const loc = String(p.location || "").trim();
      if (loc) {
        const l = document.createElement("div");
        l.className = "annLocation";
        l.textContent = "📍 " + loc;
        li.appendChild(l);
      }

      const body = document.createElement("div");
      body.className = "annText";
      body.textContent = text;
      li.appendChild(body);

      ul.appendChild(li);
    }

    if (!ul.children.length) return null;

    wrap.appendChild(ul);
    return wrap;
  }

   function normalizeAnnouncements(v, maxItems = 10) {
  const arr = Array.isArray(v) ? v : [];
  const out = [];

  for (const item of arr) {
    if (!item || typeof item !== "object") continue;

    const title = String(item.title ?? "").trim();
    const text = String(item.text ?? item.message ?? "").trim();
    const location = String(item.location ?? "").trim();
    const date = parseISODate(item.date);

    // Skip completely empty items
    if (!title && !text && !location && !date) continue;

    out.push({
      date: date || null,
      title: title || "Announcement",
      text,
      location
    });
  }

  // Sort: newest first (dated items first, undated last)
  out.sort((a, b) => {
    const at = a.date instanceof Date ? a.date.getTime() : NaN;
    const bt = b.date instanceof Date ? b.date.getTime() : NaN;
    const aValid = Number.isFinite(at);
    const bValid = Number.isFinite(bt);

    if (!aValid && !bValid) return a.title.localeCompare(b.title);
    if (!aValid) return 1;
    if (!bValid) return -1;
    return bt - at;
  });

  return out.slice(0, maxItems);
}

function upsertAnnouncementsHost(cardsEl) {
  // Create a host div ABOVE cards if it doesn't exist
  let host = document.getElementById("announcements");
  if (!host) {
    host = document.createElement("div");
    host.id = "announcements";

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

  const h = document.createElement("div");
  h.className = "annTitle";
  h.textContent = "Announcements";
  wrap.appendChild(h);

  const ul = document.createElement("ul");
  ul.className = "annList";

  for (const p of list) {
    const li = document.createElement("li");
    li.className = "annItem";

    if (p.date instanceof Date && !Number.isNaN(p.date.getTime())) {
      const d = document.createElement("div");
      d.className = "annDate";
      d.textContent = p.date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
      li.appendChild(d);
    }

    if (p.title) {
      const t = document.createElement("div");
      t.className = "annHeading";
      t.textContent = p.title;
      li.appendChild(t);
    }

    if (p.location) {
      const l = document.createElement("div");
      l.className = "annLocation";
      l.textContent = `📍 ${p.location}`;
      li.appendChild(l);
    }

    if (p.text) {
      const body = document.createElement("div");
      body.className = "annText";
      body.textContent = p.text;
      li.appendChild(body);
    }

    ul.appendChild(li);
  }

  if (!ul.children.length) return null;

  wrap.appendChild(ul);
  return wrap;
}

  // ============================
  // Render
  // ============================
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

    // Stop carousels before rebuild
    for (const [imgEl] of carouselTimers) stopCarouselFor(imgEl);

    const computed = (state.data || []).map(computeRow);
    const filtered = filterSort(computed);
    const today = todayLocal();

    // --- Global Announcements (Cousins App, GitHub-only) ---
    const posts = normalizeAnnouncements(window.COUSIN_ANNOUNCEMENTS, 10);

    const annHost = upsertAnnouncementsHost(cards);
    annHost.innerHTML = "";

    const annBlock = makeAnnouncementsBlock(posts);
    if (annBlock) annHost.appendChild(annBlock);

    asOf.textContent = "As of: " + today.toLocaleDateString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric"
    });
    count.textContent = "Shown: " + filtered.length + " / " + computed.length;

    // Upcoming birthdays (next 30 days)
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
          "📅 <strong>Upcoming birthdays (next 30 days):</strong> " +
          soon.map(x =>
            "<span>" + escapeHtml(x.name) + " (" +
            x.date.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
            ")</span>"
          ).join(" • ");
        birthdayLine.hidden = false;
      } else {
        birthdayLine.hidden = true;
      }
    }

    // Announcements block
    const annHost = upsertAnnouncementsHost();
    annHost.innerHTML = "";
    const annBlock = makeAnnouncementsBlock(state.announcements);
    if (annBlock) annHost.appendChild(annBlock);

    cards.innerHTML = "";
    if (filtered.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    const frag = document.createDocumentFragment();

    for (let i = 0; i < filtered.length; i++) {
      const r = filtered[i];

      const isMemorial = r.status === "deceased";
      const isBirthday = !!r.isBirthdayToday;

      let badgeClass = isMemorial ? "badge deceased" : "badge alive";
      let badgeText = isMemorial ? "In Memoriam" : "Living";

      if (isBirthday) {
        badgeClass = "badge birthday";
        badgeText = "🎂 Birthday Today";
      }

      const years = (r._birth || r._passed)
        ? (r._birth ? r._birth.getFullYear() : "—") + " – " + (r._passed ? r._passed.getFullYear() : "—")
        : "";

      const photos = Array.isArray(r._photos) ? r._photos : [];

      const card = document.createElement("section");
      card.className = "card" + (isMemorial ? " memorial" : "") + (isBirthday ? " birthdayToday" : "");

      // Top row
      const top = document.createElement("div");
      top.className = "cardTop";

      const avatarWrap = document.createElement("div");
      avatarWrap.className = "avatarWrap";

      if (photos.length) {
        const img = document.createElement("img");
        img.className = "avatar";
        img.alt = r.name ? r.name : "Photo";
        img.loading = "lazy";
        avatarWrap.appendChild(img);

        const dot = document.createElement("div");
        dot.className = "avatarDot";
        if (photos.length > 1) { dot.title = "Multiple photos"; dot.textContent = "↻"; }
        else if (isMemorial) { dot.title = "In Memoriam"; dot.textContent = "✦"; }
        else dot.textContent = "";

        if (dot.textContent) avatarWrap.appendChild(dot);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "avatar placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.textContent = "No photo";
        avatarWrap.appendChild(placeholder);

        if (isMemorial) {
          const dot = document.createElement("div");
          dot.className = "avatarDot";
          dot.title = "In Memoriam";
          dot.textContent = "✦";
          avatarWrap.appendChild(dot);
        }
      }

      // Avatar click => full-screen modal
      avatarWrap.style.cursor = photos.length ? "pointer" : "default";
      avatarWrap.addEventListener("click", (e) => {
        if (!photos.length) return;
        e.preventDefault();
        e.stopPropagation();
        openPhotoModal(r.name || "Photos", photos, 0);
      });

      const topText = document.createElement("div");
      topText.className = "cardTopText";

      const nameEl = document.createElement("h2");
      nameEl.className = "name";
      nameEl.textContent = r.name || "Unnamed";

      const badgeEl = document.createElement("div");
      badgeEl.className = badgeClass;
      badgeEl.textContent = badgeText;

      topText.appendChild(nameEl);
      topText.appendChild(badgeEl);

      if (isMemorial) {
        const memorialMark = document.createElement("div");
        memorialMark.className = "memorialMark";
        memorialMark.textContent = "In loving memory";
        topText.appendChild(memorialMark);

        if (years) {
          const memorialYears = document.createElement("div");
          memorialYears.className = "memorialYears";
          memorialYears.textContent = years;
          topText.appendChild(memorialYears);
        }
      }

      top.appendChild(avatarWrap);
      top.appendChild(topText);
      card.appendChild(top);

      // Rows
      const row1 = document.createElement("div");
      row1.className = "row";
      row1.innerHTML = "<span>Birthdate</span><span class='value'>" + fmtDate(r._birth) + "</span>";
      card.appendChild(row1);

      const row2 = document.createElement("div");
      row2.className = "row";
      row2.innerHTML = "<span>" + (isMemorial ? "Age at passing" : "Current age") + "</span><span class='value'>" + escapeHtml(r.ageText) + "</span>";
      card.appendChild(row2);

      const row3 = document.createElement("div");
      row3.className = "row";
      row3.innerHTML = "<span>Passed</span><span class='value'>" + fmtDate(r._passed) + "</span>";
      card.appendChild(row3);

      // Contact (optional)
      const phoneLink = (r._phoneDisplay && r._phoneHref)
        ? "<a class='contactLink' href='" + escapeHtml(r._phoneHref) + "'>" + escapeHtml(r._phoneDisplay) + "</a>"
        : "";
      const emailLink = (r._email)
        ? "<a class='contactLink' href='mailto:" + encodeURIComponent(r._email) + "'>" + escapeHtml(r._email) + "</a>"
        : "";

      if (phoneLink || emailLink) {
        const rowC = document.createElement("div");
        rowC.className = "row";
        rowC.innerHTML =
          "<span>Contact</span><span class='value contactValue'>" +
          [phoneLink, emailLink].filter(Boolean).join(" · ") +
          "</span>";
        card.appendChild(rowC);
      }

      // Tribute + would-have-turned
      if (isMemorial && r.tribute && String(r.tribute).trim()) {
        const tribute = document.createElement("div");
        tribute.className = "tribute";
        tribute.textContent = "“" + String(r.tribute).trim() + "”";
        card.appendChild(tribute);
      }

      if (isMemorial && r.wouldHaveTurned != null) {
        const wht = document.createElement("div");
        wht.className = "wouldHaveTurned";
        wht.innerHTML =
          "Remembering <strong>" + escapeHtml(r.name) + "</strong> today — would have turned <strong>" +
          escapeHtml(String(r.wouldHaveTurned)) + "</strong>.";
        card.appendChild(wht);
      }

      frag.appendChild(card);

      const imgEl = card.querySelector("img.avatar");
      if (imgEl && photos.length) startCarousel(imgEl, photos);
    }

    cards.appendChild(frag);
  }

  // ============================
  // UI hooks
  // ============================
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
        sortBtn.textContent = state.sortOldestFirst
          ? "Sort: Oldest → Youngest"
          : "Sort: Youngest → Oldest";
        render();
      });
    }
  }

  // Bootstrap
  hookUI();
  render();
})();
