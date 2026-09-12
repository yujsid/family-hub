(() => {
  const MEMBERS = [
    { id: "jaesang", name: "유재상", role: "아빠", color: "#3d5a80" },
    { id: "sinjeong", name: "윤신정", role: "엄마", color: "#d76a4f" },
    { id: "sua", name: "유수아", role: "딸", color: "#5e8f74" },
    { id: "sumin", name: "유수민", role: "아들", color: "#d4a017" },
  ];
  const ALLOWANCE_MEMBERS = MEMBERS.filter((m) => m.role === "딸" || m.role === "아들");

  const DEFAULT_CATEGORIES = [
    { id: "tidy", name: "정리하기", emoji: "📦" },
    { id: "errand", name: "심부름하기", emoji: "🏃" },
    { id: "clean", name: "청소하기", emoji: "✨" },
    { id: "recycle", name: "분리수거하기", emoji: "♻️" },
    { id: "laundry", name: "빨래기기", emoji: "🧺" },
    { id: "etc", name: "기타", emoji: "⭐" },
  ];
  const DEFAULT_RATES = { tidy: 500, errand: 500, clean: 500, recycle: 500, laundry: 500, etc: 300 };

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const DEFAULT_DOC = "families/yu-family";
  const PREFERRED_MEMBER_KEY = "family-hub-preferred-member";

  const state = {
    tab: "calendar",
    calView: "month",
    cursor: startOfDay(new Date()),
    selected: startOfDay(new Date()),
    memberFilter: Object.fromEntries(MEMBERS.map((m) => [m.id, true])),
    typeFilter: { schedule: true, todo: true, stamp: true },
    pinBuffer: "",
    pinResolve: null,
    events: [],
    stamps: [],
    posts: [],
    pin: "1234",
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    rates: { ...DEFAULT_RATES },
    cloudReady: false,
    cloudError: "",
    saving: false,
    applyingRemote: false,
    settingsUnlocked: false,
  };

  let db = null;
  let familyRef = null;
  let saveTimer = null;

  const $ = (sel) => document.querySelector(sel);

  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  }

  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function ymd(d) {
    const x = new Date(d);
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const day = String(x.getDate()).padStart(2, "0");
    return `${x.getFullYear()}-${m}-${day}`;
  }

  function parseYmd(s) {
    const [y, m, d] = s.split("-").map(Number);
    return startOfDay(new Date(y, m - 1, d));
  }

  function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return startOfDay(x);
  }

  function startOfWeek(d) {
    const x = startOfDay(d);
    return addDays(x, -x.getDay());
  }

  function sameDay(a, b) {
    return ymd(a) === ymd(b);
  }

  function monthLabel(d) {
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
  }

  function isFirebaseConfigured() {
    const cfg = window.FAMILY_HUB_FIREBASE;
    return Boolean(cfg && cfg.apiKey && !String(cfg.apiKey).startsWith("PASTE_"));
  }

  function payloadFromState() {
    return {
      events: state.events,
      stamps: state.stamps,
      posts: state.posts,
      pin: state.pin,
      categories: state.categories,
      rates: state.rates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  function normalizeCategories(list) {
    if (!Array.isArray(list) || !list.length) {
      return DEFAULT_CATEGORIES.map((c) => ({ ...c }));
    }
    return list
      .map((c) => ({
        id: String(c.id || uid()),
        name: String(c.name || "새 항목").trim() || "새 항목",
        emoji: String(c.emoji || "⭐").trim() || "⭐",
      }))
      .filter((c) => c.id);
  }

  function applyRemoteData(data) {
    state.applyingRemote = true;
    state.events = Array.isArray(data.events) ? data.events : [];
    state.stamps = Array.isArray(data.stamps) ? data.stamps : [];
    state.posts = Array.isArray(data.posts) ? data.posts : [];
    state.pin = data.pin || "1234";
    state.categories = normalizeCategories(data.categories);
    state.rates = { ...DEFAULT_RATES, ...(data.rates || {}) };
    state.categories.forEach((c) => {
      if (state.rates[c.id] == null) state.rates[c.id] = 500;
    });
    render();
    state.applyingRemote = false;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const same = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    if (same) return `오늘 ${time}`;
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} ${time}`;
  }

  function richText(s) {
    return esc(s).replace(/\n/g, "<br>");
  }

  function updateCloudStatus() {
    const el = $("#firebase-status-text");
    if (!el) return;
    if (!isFirebaseConfigured()) {
      el.textContent = "firebase-config.js에 Firebase 웹 설정을 넣어야 클라우드에 저장됩니다. 지금은 연결되지 않았습니다.";
      return;
    }
    if (state.cloudError) {
      el.textContent = `연결 오류: ${state.cloudError}`;
      return;
    }
    if (state.cloudReady) {
      el.textContent = "Firebase에 연결되었습니다. 가족 기기끼리 일정이 실시간으로 동기화됩니다.";
      return;
    }
    el.textContent = "Firebase에 연결하는 중…";
  }

  function save() {
    if (!familyRef || state.applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        state.saving = true;
        await familyRef.set(payloadFromState(), { merge: true });
        state.cloudError = "";
      } catch (err) {
        state.cloudError = err.message || String(err);
        toast("클라우드 저장에 실패했습니다.");
        updateCloudStatus();
      } finally {
        state.saving = false;
      }
    }, 250);
  }

  async function initCloud() {
    updateCloudStatus();
    if (!isFirebaseConfigured()) return;
    if (typeof firebase === "undefined") {
      state.cloudError = "Firebase SDK를 불러오지 못했습니다.";
      updateCloudStatus();
      return;
    }
    try {
      firebase.initializeApp(window.FAMILY_HUB_FIREBASE);
      db = firebase.firestore();
      const docPath = window.FAMILY_HUB_DOC || DEFAULT_DOC;
      const [col, id] = docPath.split("/");
      familyRef = db.collection(col).doc(id);

      const snap = await familyRef.get();
      if (!snap.exists) {
        await familyRef.set(payloadFromState());
      } else {
        applyRemoteData(snap.data() || {});
      }

      familyRef.onSnapshot(
        (doc) => {
          if (!doc.exists) return;
          if (state.saving) return;
          applyRemoteData(doc.data() || {});
          state.cloudReady = true;
          state.cloudError = "";
          updateCloudStatus();
        },
        (err) => {
          state.cloudError = err.message || String(err);
          updateCloudStatus();
        }
      );

      state.cloudReady = true;
      updateCloudStatus();
    } catch (err) {
      state.cloudError = err.message || String(err);
      updateCloudStatus();
    }
  }

  function memberById(id) {
    return MEMBERS.find((m) => m.id === id);
  }

  function getPreferredMemberId(pool = MEMBERS) {
    try {
      const saved = localStorage.getItem(PREFERRED_MEMBER_KEY);
      if (saved && pool.some((m) => m.id === saved)) return saved;
    } catch (_) {
      /* ignore */
    }
    return pool[0]?.id || MEMBERS[0].id;
  }

  function setPreferredMemberId(id) {
    if (!id || !MEMBERS.some((m) => m.id === id)) return;
    try {
      localStorage.setItem(PREFERRED_MEMBER_KEY, id);
    } catch (_) {
      /* ignore */
    }
  }

  function categoryById(id) {
    return state.categories.find((c) => c.id === id) || { id, name: "삭제된 항목", emoji: "❓" };
  }

  function occursOn(ev, date) {
    const day = startOfDay(date);
    const key = ymd(day);
    if ((ev.excludeDates || []).includes(key)) return false;
    if (ev.overrides && ev.overrides[key]) return true;

    const start = parseYmd(ev.date);
    if (day < start) return false;
    if (ev.repeatUntil && day > parseYmd(ev.repeatUntil)) return false;

    if (ev.repeat === "none") return sameDay(day, start);
    if (ev.repeat === "daily") return true;
    if (ev.repeat === "weekly") {
      const days = ev.weekdays && ev.weekdays.length ? ev.weekdays : [start.getDay()];
      return days.includes(day.getDay());
    }
    if (ev.repeat === "monthly") return day.getDate() === start.getDate();
    return false;
  }

  function isRecurring(ev) {
    return Boolean(ev && ev.repeat && ev.repeat !== "none");
  }

  function getOccurrence(ev, date) {
    const key = ymd(date);
    const override = (ev.overrides && ev.overrides[key]) || {};
    return {
      ...ev,
      ...override,
      date: key,
      _occurrenceDate: key,
      _seriesRepeat: ev.repeat,
    };
  }

  function eventsOn(date) {
    return state.events
      .filter(
        (ev) =>
          occursOn(ev, date) &&
          state.memberFilter[ev.memberId] &&
          state.typeFilter[ev.kind]
      )
      .sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.startTime || "").localeCompare(b.startTime || "");
      });
  }

  function stampsOn(date) {
    if (!state.typeFilter.stamp) return [];
    const key = ymd(date);
    return state.stamps.filter((s) => s.date === key && state.memberFilter[s.memberId]);
  }

  function isTodoDone(ev, date) {
    return Boolean(ev.doneDates && ev.doneDates[ymd(date)]);
  }

  function emptyState(text) {
    return `<div class="empty-state"><p>${text}</p></div>`;
  }

  function toast(msg) {
    document.querySelectorAll(".toast").forEach((t) => t.remove());
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function closeModal() {
    $("#modal-backdrop").hidden = true;
    $("#modal").innerHTML = "";
    state.pinBuffer = "";
    state.pinResolve = null;
  }

  function openModal(html) {
    $("#modal").innerHTML = html;
    $("#modal-backdrop").hidden = false;
  }

  function renderTypeFilters() {
    const types = [
      { id: "schedule", label: "일정", icon: "📅" },
      { id: "todo", label: "할 일", icon: "☑" },
      { id: "stamp", label: "용돈 도장", icon: "💮" },
    ];
    $("#type-filters").innerHTML =
      `<span class="filter-label">보기</span>` +
      types
        .map(
          (t) => `
      <label class="chip type-chip type-${t.id}">
        <input type="checkbox" data-type="${t.id}" ${state.typeFilter[t.id] ? "checked" : ""} />
        <span class="type-mark" aria-hidden="true">${t.icon}</span>
        ${t.label}
      </label>`
        )
        .join("");
  }

  function renderMemberFilters() {
    $("#member-filters").innerHTML =
      `<span class="filter-label">가족</span>` +
      MEMBERS.map(
        (m) => `
      <label class="chip">
        <span class="dot" style="background:${m.color}"></span>
        <input type="checkbox" data-member="${m.id}" ${state.memberFilter[m.id] ? "checked" : ""} />
        ${m.name}<span class="chip-role"> (${m.role})</span>
      </label>`
      ).join("");
  }

  function periodTitle() {
    if (state.calView === "day") {
      const d = state.cursor;
      return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
    }
    if (state.calView === "week") {
      const s = startOfWeek(state.cursor);
      const e = addDays(s, 6);
      return `${s.getMonth() + 1}/${s.getDate()} – ${e.getMonth() + 1}/${e.getDate()}`;
    }
    return monthLabel(state.cursor);
  }

  function memberLabel(m) {
    if (!m) return "";
    return m.name.length >= 3 ? m.name.slice(1) : m.name;
  }

  function parseTimeMinutes(t) {
    const [h, m] = String(t || "00:00").split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function formatTimeRange(ev) {
    if (ev.allDay) return "하루";
    const start = ev.startTime || "";
    const end = ev.endTime || "";
    if (start && end) return `${start}~${end}`;
    return start || "";
  }

  function pillHtml(ev, date) {
    const occ = getOccurrence(ev, date);
    const m = memberById(occ.memberId);
    const who = memberLabel(m);
    const done = occ.kind === "todo" && isTodoDone(ev, date);
    const kindTag = occ.kind === "todo" ? "할일" : "일정";
    const mark = occ.kind === "todo" ? (done ? "✓ " : "○ ") : "";
    const time = formatTimeRange(occ);
    return `<div class="pill ${occ.kind} ${done ? "done" : ""}" style="--member:${m.color}" title="${m.name} · ${kindTag}">
      <span class="pill-kind">${kindTag}</span>
      <span class="pill-who">${who}</span>
      <span class="pill-text">${mark}${time ? time + " " : ""}${occ.title}</span>
    </div>`;
  }

  function stampPills(date) {
    const grouped = {};
    stampsOn(date).forEach((s) => {
      const key = `${s.memberId}-${s.categoryId}`;
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return Object.entries(grouped)
      .map(([key, count]) => {
        const [memberId, categoryId] = key.split("-");
        const m = memberById(memberId);
        const c = categoryById(categoryId);
        const who = memberLabel(m);
        return `<div class="pill stamp" style="--member:${m.color}" title="${m.name} · 용돈 도장">
          <span class="pill-kind">도장</span>
          <span class="pill-who">${who}</span>
          <span class="pill-text">${c.emoji} ${c.name}${count > 1 ? ` ×${count}` : ""}</span>
        </div>`;
      })
      .join("");
  }

  function renderMonth() {
    const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
    const start = startOfWeek(first);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const day = addDays(start, i);
      const muted = day.getMonth() !== state.cursor.getMonth() ? "muted" : "";
      const today = sameDay(day, new Date()) ? "is-today" : "";
      const selected = sameDay(day, state.selected) ? "is-selected" : "";
      const evs = eventsOn(day);
      const visible = evs.slice(0, 3).map((ev) => pillHtml(ev, day)).join("");
      const extra = evs.length > 3 ? `<div class="more">+${evs.length - 3}개</div>` : "";
      const dots = evs.slice(0, 4).map((ev) => {
        const m = memberById(ev.memberId);
        return `<i class="event-dot" style="background:${m.color}" title="${m.name}"></i>`;
      }).join("");
      const stampList = stampsOn(day);
      const stampDots = [...new Map(stampList.map((s) => [s.memberId, s])).values()]
        .map((s) => {
          const m = memberById(s.memberId);
          return `<i class="event-dot is-stamp" style="background:${m.color}" title="${m.name} 도장"></i>`;
        })
        .join("");
      cells.push(`
        <div class="day-cell ${muted} ${today} ${selected}" data-date="${ymd(day)}">
          <div class="day-num">${day.getDate()}</div>
          <div class="day-dots">${dots}${stampDots}</div>
          <div class="pills">${visible}${stampPills(day)}${extra}</div>
        </div>`);
    }
    return `
      <div class="calendar">
        <div class="weekdays">${WEEKDAYS.map((w) => `<span>${w}</span>`).join("")}</div>
        <div class="month-grid">${cells.join("")}</div>
      </div>`;
  }

  function renderWeek() {
    const WEEK_START_MIN = 7 * 60;
    const WEEK_HOURS = 15;
    const HOUR_PX = 48;
    const start = startOfWeek(state.cursor);
    const hours = Array.from({ length: WEEK_HOURS }, (_, i) => i + 7);

    const heads = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return `<div class="week-head ${sameDay(d, new Date()) ? "is-today" : ""}">${WEEKDAYS[d.getDay()]} ${d.getDate()}</div>`;
    }).join("");

    const allDayRow = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const allDay = eventsOn(d).filter((ev) => getOccurrence(ev, d).allDay);
      return `<div class="week-allday-cell" data-date="${ymd(d)}">${allDay.map((ev) => pillHtml(ev, d)).join("")}${stampPills(d)}</div>`;
    }).join("");

    const gutter = hours
      .map((h) => `<div class="time-gutter" style="height:${HOUR_PX}px">${String(h).padStart(2, "0")}:00</div>`)
      .join("");

    const columns = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const timed = eventsOn(d).filter((ev) => !getOccurrence(ev, d).allDay);
      const blocks = timed
        .map((ev) => {
          const occ = getOccurrence(ev, d);
          const m = memberById(occ.memberId);
          let startMin = parseTimeMinutes(occ.startTime);
          let endMin = parseTimeMinutes(occ.endTime || occ.startTime);
          if (endMin <= startMin) endMin = startMin + 60;
          const clampedStart = Math.max(startMin, WEEK_START_MIN);
          const clampedEnd = Math.min(endMin, WEEK_START_MIN + WEEK_HOURS * 60);
          if (clampedEnd <= WEEK_START_MIN || clampedStart >= WEEK_START_MIN + WEEK_HOURS * 60) return "";
          const top = ((clampedStart - WEEK_START_MIN) / 60) * HOUR_PX;
          const height = Math.max(((clampedEnd - clampedStart) / 60) * HOUR_PX, 22);
          const done = occ.kind === "todo" && isTodoDone(ev, d);
          return `<div class="week-block ${occ.kind} ${done ? "done" : ""}" style="--member:${m.color};top:${top}px;height:${height}px" data-date="${ymd(d)}" title="${m.name} · ${formatTimeRange(occ)} · ${occ.title}">
            <span class="pill-kind">${occ.kind === "todo" ? "할일" : "일정"}</span>
            <span class="pill-who">${memberLabel(m)}</span>
            <strong>${done ? "✓ " : occ.kind === "todo" ? "○ " : ""}${occ.title}</strong>
            <small>${formatTimeRange(occ)}</small>
          </div>`;
        })
        .join("");
      const lanes = hours
        .map((h) => `<div class="week-slot" data-date="${ymd(d)}" style="height:${HOUR_PX}px"></div>`)
        .join("");
      return `<div class="week-day-col"><div class="week-day-track">${lanes}<div class="week-blocks">${blocks}</div></div></div>`;
    }).join("");

    const stack = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const items = eventsOn(d);
      const stamps = stampsOn(d);
      const today = sameDay(d, new Date()) ? "is-today" : "";
      const selected = sameDay(d, state.selected) ? "is-selected" : "";
      const list =
        items.length || stamps.length
          ? items.map((ev) => pillHtml(ev, d)).join("") + stampPills(d)
          : `<div class="more">일정 없음</div>`;
      return `<div class="week-day-card ${today} ${selected}" data-date="${ymd(d)}">
        <div class="week-day-title">${WEEKDAYS[d.getDay()]} ${d.getDate()}일</div>
        <div class="pills">${list}</div>
      </div>`;
    }).join("");

    return `
      <div class="week-grid">
        <div class="week-corner"></div>
        ${heads}
        <div class="week-allday-label">종일</div>
        ${allDayRow}
        <div class="week-gutter-col">${gutter}</div>
        ${columns}
      </div>
      <div class="week-stack">${stack}</div>`;
  }

  function renderDay() {
    const d = state.cursor;
    const items = eventsOn(d);
    const stamps = stampsOn(d);
    if (!items.length && !stamps.length) {
      return `<div class="day-list">${emptyState("이 날 등록된 일정·할 일·도장이 없습니다.")}</div>`;
    }
    const rows = items
      .map((ev) => {
        const occ = getOccurrence(ev, d);
        const m = memberById(occ.memberId);
        const time = occ.allDay ? "하루 종일" : `${occ.startTime || ""} ~ ${occ.endTime || ""}`;
        const done = occ.kind === "todo" && isTodoDone(ev, d);
        return `
          <div class="item-row kind-${occ.kind}" style="--member:${m.color}">
            <span class="item-kind">${occ.kind === "todo" ? "할일" : "일정"}</span>
            ${
              occ.kind === "todo"
                ? `<input type="checkbox" data-toggle-todo="${ev.id}" data-date="${ymd(d)}" ${done ? "checked" : ""} />`
                : `<span class="dot" style="background:${m.color};margin-top:6px"></span>`
            }
            <div class="item-body">
              <strong>${occ.title}</strong>
              <div class="meta">${m.name} · ${time}${isRecurring(ev) ? " · 반복" : ""}</div>
            </div>
            <button type="button" data-edit-event="${ev.id}" data-occurrence-date="${ymd(d)}">수정</button>
          </div>`;
      })
      .join("");
    const stampRows = stamps
      .map(
        (s) => `
        <div class="item-row kind-stamp" style="--member:${memberById(s.memberId).color}">
          <span class="item-kind">도장</span>
          <span>${categoryById(s.categoryId).emoji}</span>
          <div class="item-body">
            <strong>${categoryById(s.categoryId).name}</strong>
            <div class="meta">${memberById(s.memberId).name}${s.note ? " · " + s.note : ""}</div>
          </div>
          <button class="danger" type="button" data-del-stamp="${s.id}">삭제</button>
        </div>`
      )
      .join("");
    return `<div class="day-list">${rows}${stampRows}</div>`;
  }

  function renderDayPanel() {
    const d = state.selected;
    const items = eventsOn(d);
    const stamps = stampsOn(d);
    $("#day-panel").innerHTML = `
      <div class="day-panel-head">
        <h3>${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})</h3>
        <div class="panel-actions">
          <button type="button" id="panel-add-event">일정</button>
          <button type="button" id="panel-add-todo">할 일</button>
          <button type="button" id="panel-add-stamp">도장</button>
        </div>
      </div>
      <div class="legend">
        <span class="legend-type schedule">일정</span>
        <span class="legend-type todo">할 일</span>
        <span class="legend-type stamp">도장</span>
        ${MEMBERS.map((m) => `<span><span class="dot" style="background:${m.color}"></span> ${m.name}</span>`).join("")}
        <span>○ 미완료 · ✓ 완료</span>
      </div>
      <div class="day-panel-body">
      ${
        items.length || stamps.length
          ? items
              .map((ev) => {
                const occ = getOccurrence(ev, d);
                const m = memberById(occ.memberId);
                const done = occ.kind === "todo" && isTodoDone(ev, d);
                return `<div class="item-row kind-${occ.kind}" style="--member:${m.color}">
                  <span class="item-kind">${occ.kind === "todo" ? "할일" : "일정"}</span>
                  ${
                    occ.kind === "todo"
                      ? `<input type="checkbox" data-toggle-todo="${ev.id}" data-date="${ymd(d)}" ${done ? "checked" : ""} />`
                      : `<span class="dot" style="background:${m.color};margin-top:6px"></span>`
                  }
                  <div class="item-body">
                    <strong>${done ? "✓ " : occ.kind === "todo" ? "○ " : ""}${occ.title}</strong>
                    <div class="meta">${m.name} · ${occ.allDay ? "하루 종일" : `${occ.startTime || ""} ~ ${occ.endTime || ""}`}${isRecurring(ev) ? " · 반복" : ""}</div>
                  </div>
                  <button type="button" data-edit-event="${ev.id}" data-occurrence-date="${ymd(d)}">수정</button>
                </div>`;
              })
              .join("") +
            stamps
              .map(
                (s) => `<div class="item-row kind-stamp" style="--member:${memberById(s.memberId).color}">
                <span class="item-kind">도장</span>
                <span>${categoryById(s.categoryId).emoji}</span>
                <div class="item-body"><strong>${categoryById(s.categoryId).name}</strong>
                <div class="meta">${memberById(s.memberId).name}${s.note ? " · " + s.note : ""}</div></div>
                <button class="danger" type="button" data-del-stamp="${s.id}">삭제</button>
              </div>`
              )
              .join("")
          : emptyState("아직 비어 있어요. 일정, 할 일, 용돈 도장을 추가해 보세요.")
      }
      </div>
    `;
  }

  function renderCalendar() {
    $("#period-title").textContent = periodTitle();
    document.querySelectorAll("[data-cal-view]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.calView === state.calView);
    });
    const root = $("#calendar-root");
    if (state.calView === "month") root.innerHTML = renderMonth();
    if (state.calView === "week") root.innerHTML = renderWeek();
    if (state.calView === "day") root.innerHTML = renderDay();
    renderDayPanel();
  }

  function stampsInMonth(memberId, year, month) {
    return state.stamps.filter((s) => {
      const d = parseYmd(s.date);
      return s.memberId === memberId && d.getFullYear() === year && d.getMonth() === month;
    });
  }

  function renderStampBoard() {
    const d = state.cursor;
    $("#stamp-month-title").textContent = monthLabel(d);
    $("#stamp-board").innerHTML = ALLOWANCE_MEMBERS.map((m) => {
      const list = stampsInMonth(m.id, d.getFullYear(), d.getMonth());
      const cats = state.categories.map((c) => {
        const n = list.filter((s) => s.categoryId === c.id).length;
        const won = n * (state.rates[c.id] || 0);
        return `<button class="stamp-btn" type="button" data-quick-stamp="${m.id}" data-cat="${c.id}">
          <span>${c.emoji} ${c.name}</span>
          <strong class="stamp-count">${n}</strong>
          <small>${won.toLocaleString()}원</small>
        </button>`;
      }).join("");
      const total = list.reduce((sum, s) => sum + (state.rates[s.categoryId] || 0), 0);
      return `<article class="member-card">
        <h3><span class="dot" style="background:${m.color}"></span> ${m.name} (${m.role})</h3>
        <p class="hint">이번 달 예상 용돈 <strong>${total.toLocaleString()}원</strong></p>
        <div class="stamp-cats">${cats}</div>
      </article>`;
    }).join("");
  }

  function memberSelectOptions(selectedId) {
    return MEMBERS.map(
      (m) => `<option value="${m.id}" ${m.id === selectedId ? "selected" : ""}>${m.name} (${m.role})</option>`
    ).join("");
  }

  function renderTalk() {
    const feed = $("#talk-feed");
    if (!feed) return;
    const posts = [...state.posts].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    if (!posts.length) {
      feed.innerHTML = emptyState("아직 글이 없어요. 첫 글을 남겨 보세요.");
      return;
    }
    feed.innerHTML = posts
      .map((post) => {
        const author = memberById(post.memberId) || MEMBERS[0];
        const comments = Array.isArray(post.comments) ? post.comments : [];
        const commentHtml = comments
          .map((c) => {
            const who = memberById(c.memberId) || MEMBERS[0];
            return `<div class="talk-comment" style="--member:${who.color}">
              <div class="talk-meta">
                <span class="dot" style="background:${who.color}"></span>
                <strong>${esc(who.name)}</strong>
                <span class="talk-time">${esc(formatWhen(c.createdAt))}</span>
                <button class="ghost tiny" type="button" data-del-comment="${esc(c.id)}" data-post-id="${esc(post.id)}">삭제</button>
              </div>
              <p class="talk-body">${richText(c.body)}</p>
            </div>`;
          })
          .join("");
        const title = post.title ? `<h3 class="talk-title">${esc(post.title)}</h3>` : "";
        return `<article class="talk-post" style="--member:${author.color}">
          <header class="talk-meta">
            <span class="dot" style="background:${author.color}"></span>
            <strong>${esc(author.name)}</strong>
            <span class="talk-role">${esc(author.role)}</span>
            <span class="talk-time">${esc(formatWhen(post.createdAt))}</span>
            <button class="ghost tiny" type="button" data-del-post="${esc(post.id)}">삭제</button>
          </header>
          ${title}
          <p class="talk-body">${richText(post.body)}</p>
          <div class="talk-comments">
            <p class="talk-comments-label">댓글 ${comments.length}</p>
            ${commentHtml || `<p class="hint talk-empty-comments">아직 댓글이 없어요.</p>`}
            <form class="comment-form" data-post-id="${esc(post.id)}" action="#" method="post">
              <select name="memberId" aria-label="작성자">${memberSelectOptions(getPreferredMemberId())}</select>
              <input name="body" required maxlength="500" placeholder="댓글을 입력하세요" />
              <button class="primary" type="submit">달기</button>
            </form>
          </div>
        </article>`;
      })
      .join("");
  }

  function postForm() {
    openModal(`
      <h3>글 쓰기</h3>
      <form id="post-form" class="stack" action="#" method="post">
        <label>작성자
          <select name="memberId">${memberSelectOptions(getPreferredMemberId())}</select>
        </label>
        <label>제목 (선택)
          <input name="title" maxlength="80" placeholder="예: 이번 주말 계획" />
        </label>
        <label>내용
          <textarea name="body" rows="5" required maxlength="2000" placeholder="가족에게 전할 말을 적어 주세요."></textarea>
        </label>
        <div class="modal-actions">
          <button type="button" id="cancel-modal">취소</button>
          <button class="primary" type="button" id="save-post">올리기</button>
        </div>
      </form>
    `);
  }

  function savePostFromForm(form) {
    const fd = new FormData(form);
    const body = String(fd.get("body") || "").trim();
    if (!body) return toast("내용을 입력해 주세요.");
    const title = String(fd.get("title") || "").trim();
    const memberId = fd.get("memberId") || getPreferredMemberId();
    setPreferredMemberId(memberId);
    state.posts.push({
      id: uid(),
      memberId,
      title,
      body,
      createdAt: new Date().toISOString(),
      comments: [],
    });
    save();
    closeModal();
    state.tab = "talk";
    render();
    toast("글을 올렸습니다.");
  }

  function saveCommentFromForm(form) {
    const postId = form.dataset.postId;
    const post = state.posts.find((p) => p.id === postId);
    if (!post) return;
    const fd = new FormData(form);
    const body = String(fd.get("body") || "").trim();
    if (!body) return toast("댓글을 입력해 주세요.");
    const memberId = fd.get("memberId") || getPreferredMemberId();
    setPreferredMemberId(memberId);
    post.comments = Array.isArray(post.comments) ? post.comments : [];
    post.comments.push({
      id: uid(),
      memberId,
      body,
      createdAt: new Date().toISOString(),
    });
    save();
    render();
    toast("댓글을 달았습니다.");
  }

  function renderSettings() {
    const preferred = getPreferredMemberId();
    const rows = state.categories
      .map(
        (c) => `<div class="cat-edit-row" data-cat-id="${esc(c.id)}">
          <input class="cat-emoji" name="emoji" value="${esc(c.emoji)}" maxlength="4" aria-label="이모지" />
          <input class="cat-name" name="name" value="${esc(c.name)}" maxlength="20" required aria-label="항목 이름" />
          <input class="cat-rate" type="number" name="rate" min="0" step="50" value="${state.rates[c.id] || 0}" aria-label="금액" />
          <span class="cat-won">원</span>
          <button class="danger tiny" type="button" data-del-cat="${esc(c.id)}">삭제</button>
        </div>`
      )
      .join("");
    $("#device-member-form").innerHTML = `
      <label>기본 작성자
        <select name="memberId" id="preferred-member">
          ${memberSelectOptions(preferred)}
        </select>
      </label>
      <p class="hint">이 휴대폰/컴퓨터에만 저장됩니다. 글·댓글·일정 추가 시 기본으로 선택돼요.</p>
      <button class="primary" type="button" id="save-preferred-member">이 기기에 저장</button>`;
    $("#rates-form").innerHTML = `
      <div class="cat-edit-head"><span>이모지</span><span>항목 이름</span><span>금액</span><span></span></div>
      ${rows || `<p class="hint">항목이 없습니다. 아래에서 추가해 주세요.</p>`}
      <div class="cat-edit-actions">
        <button type="button" id="add-category">항목 추가</button>
        <button class="primary" type="button" id="save-rates">항목·금액 저장</button>
      </div>`;
    updateCloudStatus();
  }

  function collectCategoriesFromForm(form) {
    const rows = [...form.querySelectorAll(".cat-edit-row")];
    const nextCats = [];
    const nextRates = {};
    for (const row of rows) {
      const id = row.dataset.catId || uid();
      const emoji = String(row.querySelector('[name="emoji"]')?.value || "⭐").trim() || "⭐";
      const name = String(row.querySelector('[name="name"]')?.value || "").trim();
      if (!name) {
        toast("항목 이름을 모두 입력해 주세요.");
        return null;
      }
      const rate = Number(row.querySelector('[name="rate"]')?.value || 0);
      nextCats.push({ id, emoji, name });
      nextRates[id] = Number.isFinite(rate) && rate >= 0 ? rate : 0;
    }
    if (!nextCats.length) {
      toast("최소 1개 항목이 필요해요.");
      return null;
    }
    return { categories: nextCats, rates: nextRates };
  }

  function saveCategoriesFromForm(form) {
    const collected = collectCategoriesFromForm(form);
    if (!collected) return;
    state.categories = collected.categories;
    state.rates = collected.rates;
    save();
    toast("도장 항목을 저장했습니다.");
    render();
  }

  function render() {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === state.tab));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${state.tab}`));
    renderTypeFilters();
    renderMemberFilters();
    if (state.tab === "calendar") renderCalendar();
    if (state.tab === "stamps") renderStampBoard();
    if (state.tab === "talk") renderTalk();
    if (state.tab === "settings") renderSettings();
  }

  function addMonthsYmd(dateStr, months) {
    const d = parseYmd(dateStr || ymd(new Date()));
    const out = new Date(d);
    out.setMonth(out.getMonth() + months);
    return ymd(out);
  }

  function eventForm(existing, kind, occurrenceDate) {
    const occDate = occurrenceDate || (existing && existing.date) || ymd(state.selected);
    const base = existing || {
      kind: kind || "schedule",
      title: "",
      memberId: getPreferredMemberId(),
      date: occDate,
      allDay: true,
      startTime: "16:00",
      endTime: "18:00",
      repeat: "none",
      weekdays: [],
      repeatUntil: "",
      note: "",
    };
    const ev = existing ? getOccurrence(existing, parseYmd(occDate)) : base;
    const recurring = isRecurring(existing);
    const weekdayChecks = [1, 2, 3, 4, 5, 6, 0]
      .map((n) => {
        const checked = (base.weekdays || []).includes(n) ? "checked" : "";
        return `<label class="check-chip"><input type="checkbox" name="wd" value="${n}" ${checked} /><span>${WEEKDAYS[n]}</span></label>`;
      })
      .join("");
    openModal(`
      <h3>${existing ? "일정 수정" : ev.kind === "todo" ? "할 일 추가" : "일정 추가"}</h3>
      <form id="event-form" class="stack" action="#" method="post">
        <input type="hidden" name="id" value="${existing ? existing.id : ""}" />
        <input type="hidden" name="kind" value="${ev.kind}" />
        <input type="hidden" name="occurrenceDate" value="${occDate}" />
        ${
          recurring
            ? `<div class="scope-box">
                <p class="hint scope-title">반복 일정입니다. 적용 범위를 선택하세요.</p>
                <label class="scope-option"><input type="radio" name="scope" value="one" checked /><span>이 일정만 (${occDate})</span></label>
                <label class="scope-option"><input type="radio" name="scope" value="all" /><span>반복 전체</span></label>
              </div>`
            : `<input type="hidden" name="scope" value="all" />`
        }
        <label>제목 <input name="title" required value="${ev.title || ""}" placeholder="예: 영어 학원, 숙제" /></label>
        <label>가족
          <select name="memberId">
            ${MEMBERS.map((m) => `<option value="${m.id}" ${m.id === ev.memberId ? "selected" : ""}>${m.name} (${m.role})</option>`).join("")}
          </select>
        </label>
        <label>날짜 <input type="date" name="date" required value="${occDate}" /></label>
        <label class="check-row">
          <input type="checkbox" name="allDay" ${ev.allDay ? "checked" : ""} />
          <span>하루 종일 (시간 없이)</span>
        </label>
        <div class="row-2" id="time-fields" style="${ev.allDay ? "display:none" : ""}">
          <label>시작 <input type="time" name="startTime" value="${ev.startTime || "09:00"}" /></label>
          <label>종료 <input type="time" name="endTime" value="${ev.endTime || "10:00"}" /></label>
        </div>
        <div id="series-fields" style="${recurring ? "display:none" : ""}">
          <label>반복
            <select name="repeat">
              <option value="none" ${base.repeat === "none" ? "selected" : ""}>없음</option>
              <option value="daily" ${base.repeat === "daily" ? "selected" : ""}>매일</option>
              <option value="weekly" ${base.repeat === "weekly" ? "selected" : ""}>매주 (요일 선택)</option>
              <option value="monthly" ${base.repeat === "monthly" ? "selected" : ""}>매월 같은 날</option>
            </select>
          </label>
          <div id="weekday-wrap" style="${base.repeat === "weekly" ? "" : "display:none"}">
            <div class="weekdays-pick">${weekdayChecks}</div>
          </div>
          <label id="repeat-until-wrap" style="${base.repeat === "none" ? "display:none" : ""}">반복 종료일
            <input type="date" name="repeatUntil" value="${base.repeatUntil || ""}" />
          </label>
        </div>
        <label>메모 <textarea name="note" rows="2">${ev.note || ""}</textarea></label>
        <div class="modal-actions">
          ${
            existing
              ? recurring
                ? `<button class="danger" type="button" id="delete-event-one">이 날만 삭제</button>
                   <button class="danger" type="button" id="delete-event-all">전체 삭제</button>`
                : `<button class="danger" type="button" id="delete-event-all">삭제</button>`
              : ""
          }
          <button type="button" id="cancel-modal">취소</button>
          <button class="primary" type="button" id="save-event">저장</button>
        </div>
      </form>
    `);
  }

  function readEventFields(form) {
    const fd = new FormData(form);
    return {
      title: String(fd.get("title")).trim(),
      memberId: fd.get("memberId"),
      date: fd.get("date"),
      allDay: fd.get("allDay") === "on",
      startTime: fd.get("startTime"),
      endTime: fd.get("endTime"),
      repeat: fd.get("repeat") || "none",
      weekdays: [...form.querySelectorAll("[name=wd]:checked")].map((el) => Number(el.value)),
      repeatUntil: fd.get("repeatUntil") || "",
      note: String(fd.get("note") || ""),
    };
  }

  function saveEventFromForm(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const fd = new FormData(form);
    const id = fd.get("id");
    const scope = fd.get("scope") || "all";
    const occurrenceDate = fd.get("occurrenceDate") || fd.get("date");
    const fields = readEventFields(form);
    const existing = id ? state.events.find((x) => x.id === id) : null;
    setPreferredMemberId(fields.memberId);

    if (existing && isRecurring(existing) && scope === "one") {
      existing.excludeDates = existing.excludeDates || [];
      existing.overrides = existing.overrides || {};
      const targetDate = fields.date;
      if (targetDate !== occurrenceDate) {
        if (!existing.excludeDates.includes(occurrenceDate)) existing.excludeDates.push(occurrenceDate);
        delete existing.overrides[occurrenceDate];
        if (existing.doneDates && existing.doneDates[occurrenceDate]) {
          existing.doneDates[targetDate] = existing.doneDates[occurrenceDate];
          delete existing.doneDates[occurrenceDate];
        }
      }
      // If editing a generated occurrence on a date that still comes from series rule,
      // override that date. Also exclude if the base series would still show old date when moved.
      existing.overrides[targetDate] = {
        title: fields.title,
        memberId: fields.memberId,
        allDay: fields.allDay,
        startTime: fields.startTime,
        endTime: fields.endTime,
        note: fields.note,
      };
      // When date unchanged, keep occurrence in series with override only (don't exclude).
      // When date changed, old date excluded above; new date may also match series — override covers it.
      state.selected = parseYmd(targetDate);
      save();
      closeModal();
      render();
      toast("이 일정만 수정했습니다.");
      return;
    }

    const payload = {
      id: id || uid(),
      kind: fd.get("kind"),
      ...fields,
      doneDates: (existing && existing.doneDates) || {},
      excludeDates: scope === "all" && fields.repeat === "none" ? [] : (existing && existing.excludeDates) || [],
      overrides: scope === "all" && fields.repeat === "none" ? {} : (existing && existing.overrides) || {},
    };
    if (existing && scope === "all" && fields.repeat !== "none") {
      // Keep exceptions when editing the whole series template.
      payload.excludeDates = existing.excludeDates || [];
      payload.overrides = existing.overrides || {};
    }
    const idx = state.events.findIndex((x) => x.id === payload.id);
    if (idx >= 0) state.events[idx] = payload;
    else state.events.push(payload);
    state.selected = parseYmd(payload.date);
    save();
    closeModal();
    render();
    toast("저장했습니다.");
  }

  async function deleteEventOccurrence(scope) {
    const form = document.getElementById("event-form");
    if (!form) return;
    const fd = new FormData(form);
    const id = fd.get("id");
    const occurrenceDate = fd.get("occurrenceDate") || fd.get("date");
    const existing = state.events.find((x) => x.id === id);
    if (!existing) return;

    const ok = await askPin("삭제 확인");
    if (!ok) return;

    if (scope === "one" && isRecurring(existing)) {
      existing.excludeDates = existing.excludeDates || [];
      if (!existing.excludeDates.includes(occurrenceDate)) existing.excludeDates.push(occurrenceDate);
      if (existing.overrides) delete existing.overrides[occurrenceDate];
      save();
      closeModal();
      render();
      toast("이 날 일정만 삭제했습니다.");
      return;
    }

    state.events = state.events.filter((ev) => ev.id !== id);
    save();
    closeModal();
    render();
    toast(isRecurring(existing) ? "반복 일정을 모두 삭제했습니다." : "일정을 지웠습니다.");
  }

  async function saveStampFromForm(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const fd = new FormData(form);
    const draft = {
      id: uid(),
      date: fd.get("date"),
      memberId: fd.get("memberId"),
      categoryId: fd.get("categoryId"),
      note: String(fd.get("note") || ""),
    };
    setPreferredMemberId(draft.memberId);
    const ok = await askPin();
    if (!ok) return;
    state.stamps.push(draft);
    state.selected = parseYmd(draft.date);
    save();
    closeModal();
    render();
    toast("도장을 찍었습니다.");
  }

  function stampForm(presetMember, presetCat) {
    const defaultKid = getPreferredMemberId(ALLOWANCE_MEMBERS);
    openModal(`
      <h3>용돈 도장 찍기</h3>
      <form id="stamp-form" class="stack" action="#" method="post">
        <label>날짜 <input type="date" name="date" required value="${ymd(state.selected)}" /></label>
        <label>가족
          <select name="memberId">
            ${ALLOWANCE_MEMBERS.map((m) => `<option value="${m.id}" ${m.id === (presetMember || defaultKid) ? "selected" : ""}>${m.name} (${m.role})</option>`).join("")}
          </select>
        </label>
        <label>항목
          <select name="categoryId">
            ${state.categories.map((c) => `<option value="${c.id}" ${c.id === (presetCat || state.categories[0]?.id) ? "selected" : ""}>${c.emoji} ${c.name}</option>`).join("")}
          </select>
        </label>
        <label>메모 (기타일 때 유용) <input name="note" placeholder="예: 장보기 도와줌" /></label>
        <div class="modal-actions">
          <button type="button" id="cancel-modal">취소</button>
          <button class="primary" type="button" id="save-stamp">비밀번호 입력 후 찍기</button>
        </div>
      </form>
    `);
  }

  function askPin(title = "비밀번호") {
    return new Promise((resolve) => {
      state.pinBuffer = "";
      state.pinResolve = resolve;
      openModal(`
        <h3>${title}</h3>
        <p class="hint">숫자 비밀번호를 입력하세요. 키보드로도 입력할 수 있어요.</p>
        <div class="pin-dots" id="pin-dots" aria-hidden="true"></div>
        <input
          id="pin-input"
          class="pin-input"
          type="password"
          inputmode="numeric"
          pattern="[0-9]*"
          maxlength="8"
          autocomplete="one-time-code"
          enterkeyhint="done"
          aria-label="비밀번호"
        />
        <div class="pin-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "OK"].map((n) => `<button type="button" data-pin="${n}">${n}</button>`).join("")}
        </div>
        <div class="modal-actions"><button type="button" id="cancel-modal">취소</button></div>
      `);
      updatePinDots();
      const input = $("#pin-input");
      if (input) {
        requestAnimationFrame(() => input.focus());
      }
    });
  }

  function syncPinInput() {
    const input = $("#pin-input");
    if (input && input.value !== state.pinBuffer) input.value = state.pinBuffer;
  }

  function submitPinBuffer() {
    if (!state.pinResolve) return;
    const ok = state.pinBuffer === state.pin;
    const resolve = state.pinResolve;
    closeModal();
    resolve(ok);
    if (!ok) toast("비밀번호가 올바르지 않습니다.");
  }

  function applyPinKey(v) {
    if (!state.pinResolve) return false;
    if (v === "C") {
      state.pinBuffer = "";
    } else if (v === "Backspace") {
      state.pinBuffer = state.pinBuffer.slice(0, -1);
    } else if (v === "OK" || v === "Enter") {
      submitPinBuffer();
      return true;
    } else if (/^\d$/.test(String(v)) && state.pinBuffer.length < 8) {
      state.pinBuffer += String(v);
    } else {
      return false;
    }
    syncPinInput();
    updatePinDots();
    return true;
  }

  function updatePinDots() {
    const el = $("#pin-dots");
    if (el) el.textContent = "●".repeat(state.pinBuffer.length) || "○";
    syncPinInput();
  }

  function shiftPeriod(dir) {
    const d = new Date(state.cursor);
    if (state.tab !== "calendar" || state.calView === "month") d.setMonth(d.getMonth() + dir);
    else if (state.calView === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    state.cursor = startOfDay(d);
    if (state.tab === "calendar" && state.calView !== "day") {
      /* keep selected if still visible; otherwise follow cursor */
    }
    if (state.calView === "day") state.selected = state.cursor;
    render();
  }

  function bind() {
    document.querySelector(".tabs").addEventListener("click", async (e) => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      const next = tab.dataset.tab;
      if (next === "settings" && !state.settingsUnlocked) {
        const ok = await askPin("설정 잠금 해제");
        if (!ok) {
          toast("설정에 들어가려면 비밀번호가 필요해요.");
          return;
        }
        state.settingsUnlocked = true;
        toast("설정을 열었어요!");
      }
      state.tab = next;
      render();
    });

    $("#prev-period").addEventListener("click", () => shiftPeriod(-1));
    $("#next-period").addEventListener("click", () => shiftPeriod(1));
    $("#today-btn").addEventListener("click", () => {
      state.cursor = startOfDay(new Date());
      state.selected = state.cursor;
      render();
    });
    document.querySelector(".view-switch").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cal-view]");
      if (!btn) return;
      state.calView = btn.dataset.calView;
      if (state.calView === "day") state.cursor = state.selected;
      render();
    });
    $("#add-event-btn").addEventListener("click", () => eventForm(null, "schedule"));
    $("#add-todo-btn").addEventListener("click", () => eventForm(null, "todo"));
    $("#add-stamp-calendar-btn").addEventListener("click", () => stampForm());
    $("#add-stamp-btn").addEventListener("click", () => stampForm());
    $("#add-post-btn").addEventListener("click", () => postForm());
    $("#stamp-prev").addEventListener("click", () => {
      state.cursor.setMonth(state.cursor.getMonth() - 1);
      render();
    });
    $("#stamp-next").addEventListener("click", () => {
      state.cursor.setMonth(state.cursor.getMonth() + 1);
      render();
    });

    $("#type-filters").addEventListener("change", (e) => {
      const id = e.target.dataset.type;
      if (!id) return;
      state.typeFilter[id] = e.target.checked;
      render();
    });

    $("#member-filters").addEventListener("change", (e) => {
      const id = e.target.dataset.member;
      if (!id) return;
      state.memberFilter[id] = e.target.checked;
      render();
    });

    document.body.addEventListener("click", async (e) => {
      const cell = e.target.closest("[data-date]");
      if (cell && !e.target.closest("button") && !e.target.closest("input")) {
        state.selected = parseYmd(cell.dataset.date);
        if (state.calView === "day") state.cursor = state.selected;
        render();
        return;
      }
      if (e.target.id === "panel-add-event") eventForm(null, "schedule");
      if (e.target.id === "panel-add-todo") eventForm(null, "todo");
      if (e.target.id === "panel-add-stamp") stampForm();
      if (e.target.id === "save-event") {
        const form = document.getElementById("event-form");
        if (form) saveEventFromForm(form);
      }
      if (e.target.id === "save-stamp") {
        const form = document.getElementById("stamp-form");
        if (form) saveStampFromForm(form);
      }
      if (e.target.id === "save-post") {
        const form = document.getElementById("post-form");
        if (form) savePostFromForm(form);
      }
      if (e.target.id === "save-pin") {
        const form = document.getElementById("pin-form");
        const fd = new FormData(form);
        if (fd.get("current") !== state.pin) return toast("현재 비밀번호가 다릅니다.");
        if (!/^\d{4,8}$/.test(fd.get("next"))) return toast("새 비밀번호는 숫자 4~8자리여야 합니다.");
        if (fd.get("next") !== fd.get("confirm")) return toast("새 비밀번호가 서로 다릅니다.");
        state.pin = fd.get("next");
        save();
        form.reset();
        toast("비밀번호를 바꿨습니다.");
      }
      if (e.target.id === "reset-pin") {
        if (!window.confirm("설정·용돈 비밀번호를 1234로 초기화할까요?")) return;
        state.pin = "1234";
        save();
        const form = document.getElementById("pin-form");
        if (form) form.reset();
        toast("비밀번호를 1234로 초기화했습니다.");
      }
      if (e.target.id === "save-preferred-member") {
        const sel = $("#preferred-member");
        if (!sel) return;
        setPreferredMemberId(sel.value);
        toast(`${memberById(sel.value)?.name || "선택"}님으로 이 기기 기본값을 저장했어요.`);
      }
      if (e.target.id === "save-rates") {
        const form = document.getElementById("rates-form");
        if (form) saveCategoriesFromForm(form);
      }
      if (e.target.id === "add-category") {
        const form = document.getElementById("rates-form");
        if (!form) return;
        const rows = [...form.querySelectorAll(".cat-edit-row")];
        state.categories = rows.map((row) => ({
          id: row.dataset.catId || uid(),
          emoji: String(row.querySelector('[name="emoji"]')?.value || "⭐").trim() || "⭐",
          name: String(row.querySelector('[name="name"]')?.value || "").trim() || "새 항목",
        }));
        state.rates = Object.fromEntries(
          rows.map((row, i) => {
            const id = state.categories[i].id;
            return [id, Number(row.querySelector('[name="rate"]')?.value || 0)];
          })
        );
        const id = `cat_${uid().replace(/-/g, "").slice(0, 8)}`;
        state.categories.push({ id, name: "새 항목", emoji: "⭐" });
        state.rates[id] = 500;
        renderSettings();
        const lastName = document.querySelector("#rates-form .cat-edit-row:last-of-type .cat-name");
        if (lastName) {
          lastName.focus();
          lastName.select();
        }
      }
      const delCat = e.target.closest("[data-del-cat]");
      if (delCat) {
        const id = delCat.dataset.delCat;
        const cat = categoryById(id);
        const used = state.stamps.some((s) => s.categoryId === id);
        const msg = used
          ? `"${cat.name}" 항목을 삭제할까요? 이미 찍힌 도장은 남겨 두고, 목록에서만 빠집니다.`
          : `"${cat.name}" 항목을 삭제할까요?`;
        if (!window.confirm(msg)) return;
        const form = document.getElementById("rates-form");
        if (form) {
          const draft = collectCategoriesFromForm(form);
          if (draft) {
            state.categories = draft.categories;
            state.rates = draft.rates;
          }
        }
        state.categories = state.categories.filter((c) => c.id !== id);
        delete state.rates[id];
        if (!state.categories.length) {
          state.categories = DEFAULT_CATEGORIES.map((c) => ({ ...c }));
          state.rates = { ...DEFAULT_RATES };
        }
        save();
        render();
        toast("항목을 삭제했습니다.");
      }
      if (e.target.id === "cancel-modal") {
        if (state.pinResolve) state.pinResolve(false);
        closeModal();
      }
      if (e.target.id === "delete-event" || e.target.id === "delete-event-all") {
        await deleteEventOccurrence("all");
      }
      if (e.target.id === "delete-event-one") {
        await deleteEventOccurrence("one");
      }
      const edit = e.target.closest("[data-edit-event]");
      if (edit) {
        const ev = state.events.find((x) => x.id === edit.dataset.editEvent);
        if (ev) eventForm(ev, ev.kind, edit.dataset.occurrenceDate || ymd(state.selected));
      }
      const delStamp = e.target.closest("[data-del-stamp]");
      if (delStamp) {
        const ok = await askPin("삭제 확인");
        if (!ok) return;
        state.stamps = state.stamps.filter((s) => s.id !== delStamp.dataset.delStamp);
        save();
        render();
        toast("도장을 취소했습니다.");
      }
      const delPost = e.target.closest("[data-del-post]");
      if (delPost) {
        const ok = await askPin("삭제 확인");
        if (!ok) return;
        state.posts = state.posts.filter((p) => p.id !== delPost.dataset.delPost);
        save();
        render();
        toast("글을 삭제했습니다.");
        return;
      }
      const delComment = e.target.closest("[data-del-comment]");
      if (delComment) {
        const ok = await askPin("삭제 확인");
        if (!ok) return;
        const post = state.posts.find((p) => p.id === delComment.dataset.postId);
        if (post) {
          post.comments = (post.comments || []).filter((c) => c.id !== delComment.dataset.delComment);
          save();
          render();
          toast("댓글을 삭제했습니다.");
        }
        return;
      }
      const quick = e.target.closest("[data-quick-stamp]");
      if (quick) stampForm(quick.dataset.quickStamp, quick.dataset.cat);

      const pinBtn = e.target.closest("[data-pin]");
      if (pinBtn) {
        applyPinKey(pinBtn.dataset.pin);
        const input = $("#pin-input");
        if (input) input.focus();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (!state.pinResolve) return;
      if (e.target && (e.target.tagName === "TEXTAREA" || (e.target.tagName === "INPUT" && e.target.id !== "pin-input"))) {
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        const resolve = state.pinResolve;
        closeModal();
        if (resolve) resolve(false);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        applyPinKey("OK");
        return;
      }
      if (e.key === "Backspace") {
        // pin-input handles its own backspace via input event; avoid double-delete
        if (e.target && e.target.id === "pin-input") return;
        e.preventDefault();
        applyPinKey("Backspace");
        return;
      }
      if (/^\d$/.test(e.key)) {
        if (e.target && e.target.id === "pin-input") return;
        e.preventDefault();
        applyPinKey(e.key);
      }
    });

    document.body.addEventListener("input", (e) => {
      if (e.target.id !== "pin-input" || !state.pinResolve) return;
      state.pinBuffer = String(e.target.value || "").replace(/\D/g, "").slice(0, 8);
      e.target.value = state.pinBuffer;
      updatePinDots();
    });
    document.body.addEventListener("change", (e) => {
      const box = e.target.closest("[data-toggle-todo]");
      if (!box) return;
      const ev = state.events.find((x) => x.id === box.dataset.toggleTodo);
      if (!ev) return;
      ev.doneDates = ev.doneDates || {};
      if (box.checked) ev.doneDates[box.dataset.date] = true;
      else delete ev.doneDates[box.dataset.date];
      save();
      render();
    });

    $("#modal-backdrop").addEventListener("click", (e) => {
      if (e.target === $("#modal-backdrop")) {
        if (state.pinResolve) state.pinResolve(false);
        closeModal();
      }
    });

    document.body.addEventListener("change", (e) => {
      if (e.target.name === "allDay") {
        const wrap = $("#time-fields");
        if (wrap) wrap.style.display = e.target.checked ? "none" : "";
      }
      if (e.target.name === "repeat") {
        const weekdayWrap = $("#weekday-wrap");
        const untilWrap = $("#repeat-until-wrap");
        const untilInput = document.querySelector("#event-form [name=repeatUntil]");
        const dateInput = document.querySelector("#event-form [name=date]");
        const eventId = document.querySelector("#event-form [name=id]")?.value;
        if (weekdayWrap) weekdayWrap.style.display = e.target.value === "weekly" ? "" : "none";
        if (untilWrap) untilWrap.style.display = e.target.value === "none" ? "none" : "";
        if (untilInput && e.target.value !== "none") {
          // 새 일정이거나 종료일이 비어 있으면 기본 +3개월
          if (!eventId || !untilInput.value) {
            untilInput.value = addMonthsYmd(dateInput?.value || ymd(state.selected), 3);
          }
        }
      }
      if (e.target.name === "scope") {
        const seriesFields = $("#series-fields");
        const dateInput = document.querySelector("#event-form [name=date]");
        const occInput = document.querySelector("#event-form [name=occurrenceDate]");
        const id = document.querySelector("#event-form [name=id]")?.value;
        const existing = state.events.find((x) => x.id === id);
        if (seriesFields) seriesFields.style.display = e.target.value === "all" ? "" : "none";
        if (dateInput && occInput) {
          if (e.target.value === "all" && existing) dateInput.value = existing.date;
          else dateInput.value = occInput.value;
        }
      }
    });

    document.addEventListener("submit", async (e) => {
      const formId = e.target && e.target.id;
      const isComment = e.target && e.target.classList && e.target.classList.contains("comment-form");
      if (!["event-form", "stamp-form", "pin-form", "rates-form", "post-form"].includes(formId) && !isComment) return;
      e.preventDefault();
      if (formId === "event-form") {
        saveEventFromForm(e.target);
      }
      if (formId === "stamp-form") {
        saveStampFromForm(e.target);
      }
      if (formId === "post-form") {
        savePostFromForm(e.target);
      }
      if (isComment) {
        saveCommentFromForm(e.target);
      }
      if (e.target.id === "pin-form") {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (fd.get("current") !== state.pin) return toast("현재 비밀번호가 다릅니다.");
        if (!/^\d{4,8}$/.test(fd.get("next"))) return toast("새 비밀번호는 숫자 4~8자리여야 합니다.");
        if (fd.get("next") !== fd.get("confirm")) return toast("새 비밀번호가 서로 다릅니다.");
        state.pin = fd.get("next");
        save();
        e.target.reset();
        toast("비밀번호를 바꿨습니다.");
      }
      if (e.target.id === "rates-form") {
        saveCategoriesFromForm(e.target);
      }
    }, true);
  }

  initCloud().then(() => {
    bind();
    render();
    updateCloudStatus();
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        /* ignore SW errors on file:// */
      });
    });
  }
})();
