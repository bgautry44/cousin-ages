(function () {
  const $ = (id) => document.getElementById(id);

  const state = {
    data: Array.isArray(window.COUSIN_DATA) ? window.COUSIN_DATA : [],
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
  // Data computation
  // -----------------------
  function computeRow(r) {
    const birth = parseISODate(r.birthdate);
    const passed = parseISODate(r.passed);

    const today = todayLocal();
    const passedEffective = (passed && passed.getTime() <= today.getTime()) ? passed : null;

    const ref = passedEffective ?? today;
    const ageObj = birth ? diffYMD(birth, ref) : null;

    // Living only: "Birthday Today"
    const isBirthdayToday = !!(birth && !passedEffective && sameMonthDay(birth, today));

    // Deceased only: "Remembering [Name] today — would have turned X."
    const wouldHaveTurned = (birth && passedEffective && sameMonthDay(birth, today))
      ? (today.getFullYear() - birth.getFullYear())
      : null;

    // Used for upcoming birthdays line (filtered to living in render)
    const nextBirthday = birth ? nextBirthdayDate(birth, today) : null;

    // Contact (optional)
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

    // Sort by DOB only (birth order)
    out = out.slice().sort((a, b) => {
      const aT = a._birth ? a._birth.getTime() : Number.POSITIVE_INFINITY;
      const bT = b._birth ? b._birth.getTime() : Number.POSITIVE_INFINITY;
      if (aT !== bT) return state.sortOldestFirst ? (aT - bT) : (bT - aT);
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return out;
  }

  // -----------------------
  // Carousel engine (hardened)
  // -----------------------
  const carouselTimers = new Map();

  function stopCarouselFor(imgEl) {
    const t = carouselTimers.get(imgEl);
    if (t) clearInterval(t);
    carouselTimers.delete(imgEl);

    // Avoid accumulating old handlers
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

    // Keep only non-empty strings
    const safePhotos = photos.map(x => String(x || "").trim()).filter(Boolean);
    if (!safePhotos.length) return;

    let idx = 0;
    let consecutiveErrors = 0;

    const setSrc = () => {
      imgEl.classList.remove("fadeIn");
      void imgEl.offsetWidth; // restart animation
      imgEl.src = safePhotos[idx];
      imgEl.classList.add("fadeIn");
    };

    imgEl.onload = () => { consecutiveErrors = 0; };

    // Skip broken images (prevents getting "stuck" on a missing file)
    imgEl.onerror = () => {
      consecutiveErrors++;
      if (consecutiveErrors >= safePhotos.length) {
        stopCarouselFor(imgEl);
        return;
      }
      idx = (idx + 1) % safePhotos.length;
      setSrc();
    };

    setSrc();

    // If only one photo, no rotation needed
    if (safePhotos.length === 1) return;

    const tickMs = 2600;
    const timer = setInterval(() => {
      idx = (idx + 1) % safePhotos.length;
      setSrc();
    }, tickMs);

    carouselTimers.set(imgEl, timer);

    // Tap to advance (as a proper listener, so we can remove it cleanly)
    imgEl._carouselClickHandler = () => {
      idx = (idx + 1) % safePhotos.length;
      setSrc();
    };
    imgEl.addEventListener("click", imgEl._carouselClickHandler);
  }

  // -----------------------
  // Photo Modal / Lightbox (with swipe)
  // -----------------------
  const modalState = { open: false, photos: [], idx: 0, title: "" };

  function openPhotoModal(title, photos, startIdx) {
    const modal = $("photoModal");
    const img = $("photoModalImg");
    const titleEl = $("photoModalTitle");

    if (!modal || !img) return;

    const safePhotos = Array.isArray(photos)
      ? photos.map(x => String(x || "").trim()).filter(Boolean)
      : [];

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

    if (counter) counter.textContent = `${modalState.idx + 1} / ${total}`;
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

    const onStart = (e) => {
      if (!modalState.open) return;
      if (modalState.photos.length <= 1) return;

      const t = e.touches && e.touches[0];
      if (!t) return;

      tracking = true;
      startX = t.clientX;
      startY = t.clientY;
      startT = Date.now();
    };

    const onMove = (e) => {
      if (!tracking) return;
      const t = e.touches && e.touches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // Cancel swipe if mostly vertical
      if (Math.abs(dy) > restraintY && Math.abs(dy) > Math.abs(dx)) {
        tracking = false;
      }
    };

    const onEnd = (e) => {
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
    };

    if (stageEl.dataset.swipeWired === "1") return;
    stageEl.dataset.swipeWired = "1";

    stageEl.addEventListener("touchstart", onStart, { passive: true });
    stageEl.addEventListener("touchmove", onMove, { passive: true });
    stageEl.addEventListener("touchend", onEnd, { passive: false });
    stageEl.addEventListener("touchcancel", () => { tracking = false; }, { passive: true });
  }

  function wirePhotoModalOnce() {
    const modal = $("photoModal");
    if (!modal) return;
    if (modal.dataset.wired === "1") return;
    modal.dataset.wired = "1";

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

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closePhotoModal();
    });

    if (dialog) {
      dialog.addEventListener("click", (e) => e.stopPropagation());
    }

    if (stage) wireModalSwipe(stage);

    document.addEventListener("keydown", (e) => {
      if (!modalState.open) return;
      if (e.key === "Escape") closePhotoModal();
      if (e.key === "ArrowLeft") modalPrev();
      if (e.key === "ArrowRight") modalNext();
    });
  }

  // -----------------------
  // Render
  // -----------------------
  function render() {
    const cards = $("cards");
    const empty = $("empty");
    const asOf = $("asOf");
    const count = $("count");
    const birthdayLine = $("birthdayLine"); // optional (add in index.html)

    if (!cards || !empty || !asOf || !count) {
      console.error("Missing required DOM elements (cards, empty, asOf, count).");
      return;
    }

    // stop all existing carousels before rebuild
    for (const [imgEl] of carouselTimers) stopCarouselFor(imgEl);

    const computed = state.data.map(computeRow);
    const filtered = filterSort(computed);

    const today = todayLocal();

    asOf.textContent = `As of: ${today.toLocaleDateString(undefined, {
      weekday: "short", year: "numeric", month: "short", day: "numeric"
    })}`;
    count.textContent = `Shown: ${filtered.length} / ${computed.length}`;

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
          `📅 <strong>Upcoming birthdays (next 30 days):</strong> ` +
          soon.map(x =>
            `<span>${escapeHtml(x.name)} (${x.date.toLocaleDateString(undefined, { month: "short", day: "numeric" })})</span>`
          ).join(" • ");
        birthdayLine.hidden = false;
      } else {
        birthdayLine.hidden = true;
      }
    }

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

      const photos = Array.isArray(r._photos) ? r._photos : [];

      const card = document.createElement("section");
      card.className =
        "card" +
        (isMemorial ? " memorial" : "") +
        (isBirthday ? " birthdayToday" : "");

      // Build header area as DOM so we can easily wire clicks
      const top = document.createElement("div");
      top.className = "cardTop";

      const avatarWrap = document.createElement("div");
      avatarWrap.className = "avatarWrap";
      avatarWrap.style.cursor = photos.length ? "pointer" : "default";

      if (photos.length) {
        const img = document.createElement("img");
        img.className = "avatar";
        img.alt = escapeHtml(r.name || "Photo");
        img.loading = "lazy";
        avatarWrap.appendChild(img);

        if (photos.length > 1) {
          const dot = document.createElement("div");
          dot.className = "avatarDot";
          dot.title = "Multiple photos";
          dot.textContent = "↻";
          avatarWrap.appendChild(dot);
        } else if (isMemorial) {
          const dot = document.createElement("div");
          dot.className = "avatarDot";
          dot.title = "In Memoriam";
          dot.textContent = "✦";
          avatarWrap.appendChild(dot);
        }
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

      // Wire avatar click → modal
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

      // Body rows (kept consistent with your existing structure)
      const row1 = document.createElement("div");
      row1.className = "row";
      row1.innerHTML = `<span>Birthdate</span><span class="value">${fmtDate(r._birth)}</span>`;
      card.appendChild(row1);

      const row2 = document.createElement("div");
      row2.className = "row";
      row2.innerHTML = `<span>${isMemorial ? "Age at passing" : "Current age"}</span><span class="value">${escapeHtml(r.ageText)}</span>`;
      card.appendChild(row2);

      const row3 = document.createElement("div");
      row3.className = "row";
      row3.innerHTML = `<span>Passed</span><span class="value">${fmtDate(r._passed)}</span>`;
      card.appendChild(row3);

      // Contact row (optional)
      const phoneLink = (r._phoneDisplay && r._phoneHref)
        ? `<a class="contactLink" href="${escapeHtml(r._phoneHref)}">${escapeHtml(r._phoneDisplay)}</a>`
        : "";

      const emailLink = (r._email)
        ? `<a class="contactLink" href="mailto:${encodeURIComponent(r._email)}">${escapeHtml(r._email)}</a>`
        : "";

      if (phoneLink || emailLink) {
        const rowC = document.createElement("div");
        rowC.className = "row";
        rowC.innerHTML = `
          <span>Contact</span>
          <span class="value contactValue">${[phoneLink, emailLink].filter(Boolean).join(" · ")}</span>
        `;
        card.appendChild(rowC);
      }

      // Tribute (optional)
      if (isMemorial && r.tribute && r.tribute.trim()) {
        const tribute = document.createElement("div");
        tribute.className = "tribute";
        tribute.textContent = `“${r.tribute.trim()}”`;
        card.appendChild(tribute);
      }

      // Would-have-turned (optional)
      if (isMemorial && r.wouldHaveTurned != null) {
        const wht = document.createElement("div");
        wht.className = "wouldHaveTurned";
        wht.innerHTML =
          `Remembering <strong>${escapeHtml(r.name)}</strong> today — would have turned <strong>${escapeHtml(String(r.wouldHaveTurned))}</strong>.`;
        card.appendChild(wht);
      }

      cards.appendChild(card);

      // Start carousel on the avatar img
      const imgEl = card.querySelector("img.avatar");
      if (imgEl && photos.length) startCarousel(imgEl, photos);
    }
  }

  // -----------------------
  // Excel date helpers (kept for compatibility; safe even if unused)
  // -----------------------
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

    // If you removed Excel upload UI, this will safely do nothing.
    const fileInput = $("fileInput");
    if (fileInput) {
      fileInput.addEventListener("change", async () => {
        alert("Excel upload is disabled in this version of the app.");
      });
    }
  }

  // Bootstrap
  wirePhotoModalOnce();
  hookUI();
  render();
})();
