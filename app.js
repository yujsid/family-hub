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
    { id: "etc", name: "기타", emoji: "⭐" },
  ];

  const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const DEFAULT_DOC = "families/yu-family";

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
    pin: "1234",
    rates: { tidy: 500, errand: 500, clean: 500, recycle: 500, etc: 300 },
    cloudReady: false,
    cloudError: "",
    saving: false,
    applyingRemote: false,
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
      pin: state.pin,
      rates: state.rates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  function applyRemoteData(data) {
    state.applyingRemote = true;
    state.events = Array.isArray(data.events) ? data.events : [];
    state.stamps = Array.isArray(data.stamps) ? data.stamps : [];
    state.pin = data.pin || "1234";
    state.rates = { ...state.rates, ...(data.rates || {}) };
    render();
    state.applyingRemote = false;
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

  function categoryById(id) {
    return DEFAULT_CATEGORIES.find((c) => c.id === id);
  }

  function occursOn(ev, date) {
    const day = startOfDay(date);
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

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
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
    const m = memberById(ev.memberId);
    const who = memberLabel(m);
    const done = ev.kind === "todo" && isTodoDone(ev, date);
    const kindTag = ev.kind === "todo" ? "할일" : "일정";
    const mark = ev.kind === "todo" ? (done ? "✓ " : "○ ") : "";
    const time = formatTimeRange(ev);
    return `<div class="pill ${ev.kind} ${done ? "done" : ""}" style="--member:${m.color}" title="${m.name} · ${kindTag}">
      <span class="pill-kind">${kindTag}</span>
      <span class="pill-who">${who}</span>
      <span class="pill-text">${mark}${time ? time + " " : ""}${ev.title}</span>
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
      const allDay = eventsOn(d).filter((ev) => ev.allDay);
      return `<div class="week-allday-cell" data-date="${ymd(d)}">${allDay.map((ev) => pillHtml(ev, d)).join("")}${stampPills(d)}</div>`;
    }).join("");

    const gutter = hours
      .map((h) => `<div class="time-gutter" style="height:${HOUR_PX}px">${String(h).padStart(2, "0")}:00</div>`)
      .join("");

    const columns = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const timed = eventsOn(d).filter((ev) => !ev.allDay);
      const blocks = timed
        .map((ev) => {
          const m = memberById(ev.memberId);
          let startMin = parseTimeMinutes(ev.startTime);
          let endMin = parseTimeMinutes(ev.endTime || ev.startTime);
          if (endMin <= startMin) endMin = startMin + 60;
          const clampedStart = Math.max(startMin, WEEK_START_MIN);
          const clampedEnd = Math.min(endMin, WEEK_START_MIN + WEEK_HOURS * 60);
          if (clampedEnd <= WEEK_START_MIN || clampedStart >= WEEK_START_MIN + WEEK_HOURS * 60) return "";
          const top = ((clampedStart - WEEK_START_MIN) / 60) * HOUR_PX;
          const height = Math.max(((clampedEnd - clampedStart) / 60) * HOUR_PX, 22);
          const done = ev.kind === "todo" && isTodoDone(ev, d);
          return `<div class="week-block ${ev.kind} ${done ? "done" : ""}" style="--member:${m.color};top:${top}px;height:${height}px" data-date="${ymd(d)}" title="${m.name} · ${formatTimeRange(ev)} · ${ev.title}">
            <span class="pill-kind">${ev.kind === "todo" ? "할일" : "일정"}</span>
            <span class="pill-who">${memberLabel(m)}</span>
            <strong>${done ? "✓ " : ev.kind === "todo" ? "○ " : ""}${ev.title}</strong>
            <small>${formatTimeRange(ev)}</small>
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
      return `<div class="day-list"><p class="hint" style="padding:16px">이 날 등록된 일정·할 일·도장이 없습니다.</p></div>`;
    }
    const rows = items
      .map((ev) => {
        const m = memberById(ev.memberId);
        const time = ev.allDay ? "하루 종일" : `${ev.startTime || ""} ~ ${ev.endTime || ""}`;
        const done = ev.kind === "todo" && isTodoDone(ev, d);
        return `
          <div class="item-row kind-${ev.kind}" style="--member:${m.color}">
            <span class="item-kind">${ev.kind === "todo" ? "할일" : "일정"}</span>
            ${
              ev.kind === "todo"
                ? `<input type="checkbox" data-toggle-todo="${ev.id}" data-date="${ymd(d)}" ${done ? "checked" : ""} />`
                : `<span class="dot" style="background:${m.color};margin-top:6px"></span>`
            }
            <div class="item-body">
              <strong>${ev.title}</strong>
              <div class="meta">${m.name} · ${time}${ev.repeat !== "none" ? " · 반복" : ""}</div>
            </div>
            <button type="button" data-edit-event="${ev.id}">수정</button>
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
                const m = memberById(ev.memberId);
                const done = ev.kind === "todo" && isTodoDone(ev, d);
                return `<div class="item-row kind-${ev.kind}" style="--member:${m.color}">
                  <span class="item-kind">${ev.kind === "todo" ? "할일" : "일정"}</span>
                  ${
                    ev.kind === "todo"
                      ? `<input type="checkbox" data-toggle-todo="${ev.id}" data-date="${ymd(d)}" ${done ? "checked" : ""} />`
                      : `<span class="dot" style="background:${m.color};margin-top:6px"></span>`
                  }
                  <div class="item-body">
                    <strong>${done ? "✓ " : ev.kind === "todo" ? "○ " : ""}${ev.title}</strong>
                    <div class="meta">${m.name} · ${ev.allDay ? "하루 종일" : `${ev.startTime || ""} ~ ${ev.endTime || ""}`}</div>
                  </div>
                  <button type="button" data-edit-event="${ev.id}">수정</button>
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
          : `<p class="hint">아직 비어 있어요. 일정, 할 일, 용돈 도장을 추가해 보세요.</p>`
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
      const cats = DEFAULT_CATEGORIES.map((c) => {
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

  function renderSettle() {
    const d = state.cursor;
    $("#settle-month-title").textContent = `${monthLabel(d)} 정산`;
    const head = `<tr><th>구성원</th>${DEFAULT_CATEGORIES.map((c) => `<th>${c.name}<br><small>${(state.rates[c.id] || 0).toLocaleString()}원</small></th>`).join("")}<th>합계</th></tr>`;
    let grand = 0;
    const body = ALLOWANCE_MEMBERS.map((m) => {
      const list = stampsInMonth(m.id, d.getFullYear(), d.getMonth());
      let rowSum = 0;
      const cells = DEFAULT_CATEGORIES.map((c) => {
        const n = list.filter((s) => s.categoryId === c.id).length;
        const won = n * (state.rates[c.id] || 0);
        rowSum += won;
        return `<td>${n}개<br><strong>${won.toLocaleString()}원</strong></td>`;
      }).join("");
      grand += rowSum;
      return `<tr><td>${m.name} (${m.role})</td>${cells}<td>${rowSum.toLocaleString()}원</td></tr>`;
    }).join("");
    const cards = ALLOWANCE_MEMBERS.map((m) => {
      const list = stampsInMonth(m.id, d.getFullYear(), d.getMonth());
      let rowSum = 0;
      const rows = DEFAULT_CATEGORIES.map((c) => {
        const n = list.filter((s) => s.categoryId === c.id).length;
        const won = n * (state.rates[c.id] || 0);
        rowSum += won;
        return `<li><span>${c.emoji} ${c.name}</span><strong>${n}개 · ${won.toLocaleString()}원</strong></li>`;
      }).join("");
      return `<article class="card settle-card">
        <h3><span class="dot" style="background:${m.color}"></span> ${m.name} (${m.role})</h3>
        <ul class="settle-list">${rows}</ul>
        <p class="settle-sum">합계 ${rowSum.toLocaleString()}원</p>
      </article>`;
    }).join("");
    $("#settle-table").innerHTML = `
      <div class="settle settle-table-wrap">
        <table>
          <thead>${head}</thead>
          <tbody>${body}</tbody>
          <tfoot><tr><td>가족 합계</td>${DEFAULT_CATEGORIES.map(() => "<td></td>").join("")}<td>${grand.toLocaleString()}원</td></tr></tfoot>
        </table>
      </div>
      <div class="settle-cards">${cards}
        <article class="card settle-card settle-total"><h3>가족 합계</h3><p class="settle-sum">${grand.toLocaleString()}원</p></article>
      </div>`;
  }

  function renderSettings() {
    $("#rates-form").innerHTML =
      DEFAULT_CATEGORIES.map(
        (c) => `<label>${c.emoji} ${c.name}
          <input type="number" min="0" step="50" name="${c.id}" value="${state.rates[c.id] || 0}" />
        </label>`
      ).join("") + `<button class="primary" type="button" id="save-rates">금액 저장</button>`;
    updateCloudStatus();
  }

  function render() {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === state.tab));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${state.tab}`));
    renderTypeFilters();
    renderMemberFilters();
    if (state.tab === "calendar") renderCalendar();
    if (state.tab === "stamps") renderStampBoard();
    if (state.tab === "settle") renderSettle();
    if (state.tab === "settings") renderSettings();
  }

  function eventForm(existing, kind) {
    const ev = existing || {
      kind: kind || "schedule",
      title: "",
      memberId: "sua",
      date: ymd(state.selected),
      allDay: true,
      startTime: "16:00",
      endTime: "18:00",
      repeat: "none",
      weekdays: [],
      repeatUntil: "",
      note: "",
    };
    const weekdayChecks = [1, 2, 3, 4, 5, 6, 0]
      .map((n) => {
        const checked = (ev.weekdays || []).includes(n) ? "checked" : "";
        return `<label><input type="checkbox" name="wd" value="${n}" ${checked} /> ${WEEKDAYS[n]}</label>`;
      })
      .join("");
    openModal(`
      <h3>${existing ? "일정 수정" : ev.kind === "todo" ? "할 일 추가" : "일정 추가"}</h3>
      <form id="event-form" class="stack" action="#" method="post">
        <input type="hidden" name="id" value="${existing ? existing.id : ""}" />
        <input type="hidden" name="kind" value="${ev.kind}" />
        <label>제목 <input name="title" required value="${ev.title || ""}" placeholder="예: 영어 학원, 숙제" /></label>
        <label>가족
          <select name="memberId">
            ${MEMBERS.map((m) => `<option value="${m.id}" ${m.id === ev.memberId ? "selected" : ""}>${m.name} (${m.role})</option>`).join("")}
          </select>
        </label>
        <label>날짜 <input type="date" name="date" required value="${ev.date}" /></label>
        <label><input type="checkbox" name="allDay" ${ev.allDay ? "checked" : ""} /> 하루 종일 (시간 없이)</label>
        <div class="row-2" id="time-fields" style="${ev.allDay ? "display:none" : ""}">
          <label>시작 <input type="time" name="startTime" value="${ev.startTime || "09:00"}" /></label>
          <label>종료 <input type="time" name="endTime" value="${ev.endTime || "10:00"}" /></label>
        </div>
        <label>반복
          <select name="repeat">
            <option value="none" ${ev.repeat === "none" ? "selected" : ""}>없음</option>
            <option value="daily" ${ev.repeat === "daily" ? "selected" : ""}>매일</option>
            <option value="weekly" ${ev.repeat === "weekly" ? "selected" : ""}>매주 (요일 선택)</option>
            <option value="monthly" ${ev.repeat === "monthly" ? "selected" : ""}>매월 같은 날</option>
          </select>
        </label>
        <div id="weekday-wrap" style="${ev.repeat === "weekly" ? "" : "display:none"}">
          <div class="weekdays-pick">${weekdayChecks}</div>
        </div>
        <label id="repeat-until-wrap" style="${ev.repeat === "none" ? "display:none" : ""}">반복 종료일 (비우면 계속)
          <input type="date" name="repeatUntil" value="${ev.repeatUntil || ""}" />
        </label>
        <label>메모 <textarea name="note" rows="2">${ev.note || ""}</textarea></label>
        <div class="modal-actions">
          ${existing ? `<button class="danger" type="button" id="delete-event">삭제</button>` : ""}
          <button type="button" id="cancel-modal">취소</button>
          <button class="primary" type="button" id="save-event">저장</button>
        </div>
      </form>
    `);
  }

  function saveEventFromForm(form) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    const fd = new FormData(form);
    const payload = {
      id: fd.get("id") || uid(),
      kind: fd.get("kind"),
      title: String(fd.get("title")).trim(),
      memberId: fd.get("memberId"),
      date: fd.get("date"),
      allDay: fd.get("allDay") === "on",
      startTime: fd.get("startTime"),
      endTime: fd.get("endTime"),
      repeat: fd.get("repeat"),
      weekdays: [...form.querySelectorAll("[name=wd]:checked")].map((el) => Number(el.value)),
      repeatUntil: fd.get("repeatUntil") || "",
      note: String(fd.get("note") || ""),
      doneDates: (state.events.find((x) => x.id === fd.get("id")) || {}).doneDates || {},
    };
    const idx = state.events.findIndex((x) => x.id === payload.id);
    if (idx >= 0) state.events[idx] = payload;
    else state.events.push(payload);
    state.selected = parseYmd(payload.date);
    save();
    closeModal();
    render();
    toast("저장했습니다.");
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
    openModal(`
      <h3>용돈 도장 찍기</h3>
      <form id="stamp-form" class="stack" action="#" method="post">
        <label>날짜 <input type="date" name="date" required value="${ymd(state.selected)}" /></label>
        <label>가족
          <select name="memberId">
            ${ALLOWANCE_MEMBERS.map((m) => `<option value="${m.id}" ${m.id === (presetMember || "sua") ? "selected" : ""}>${m.name} (${m.role})</option>`).join("")}
          </select>
        </label>
        <label>항목
          <select name="categoryId">
            ${DEFAULT_CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === (presetCat || "tidy") ? "selected" : ""}>${c.emoji} ${c.name}</option>`).join("")}
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

  function askPin() {
    return new Promise((resolve) => {
      state.pinBuffer = "";
      state.pinResolve = resolve;
      openModal(`
        <h3>도장 비밀번호</h3>
        <p class="hint">숫자 비밀번호를 입력하세요.</p>
        <div class="pin-dots" id="pin-dots"></div>
        <div class="pin-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "OK"].map((n) => `<button type="button" data-pin="${n}">${n}</button>`).join("")}
        </div>
        <div class="modal-actions"><button type="button" id="cancel-modal">취소</button></div>
      `);
      updatePinDots();
    });
  }

  function updatePinDots() {
    const el = $("#pin-dots");
    if (el) el.textContent = "●".repeat(state.pinBuffer.length) || "○";
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
    document.querySelector(".tabs").addEventListener("click", (e) => {
      const tab = e.target.closest(".tab");
      if (!tab) return;
      state.tab = tab.dataset.tab;
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
    $("#stamp-prev").addEventListener("click", () => {
      state.cursor.setMonth(state.cursor.getMonth() - 1);
      render();
    });
    $("#stamp-next").addEventListener("click", () => {
      state.cursor.setMonth(state.cursor.getMonth() + 1);
      render();
    });
    $("#settle-prev").addEventListener("click", () => {
      state.cursor.setMonth(state.cursor.getMonth() - 1);
      render();
    });
    $("#settle-next").addEventListener("click", () => {
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
      if (e.target.id === "save-rates") {
        const form = document.getElementById("rates-form");
        const fd = new FormData(form);
        DEFAULT_CATEGORIES.forEach((c) => {
          state.rates[c.id] = Number(fd.get(c.id) || 0);
        });
        save();
        toast("금액을 저장했습니다.");
        render();
      }
      if (e.target.id === "cancel-modal") {
        if (state.pinResolve) state.pinResolve(false);
        closeModal();
      }
      if (e.target.id === "delete-event") {
        const id = document.querySelector("#event-form [name=id]").value;
        state.events = state.events.filter((ev) => ev.id !== id);
        save();
        closeModal();
        render();
        toast("일정을 지웠습니다.");
      }
      const edit = e.target.closest("[data-edit-event]");
      if (edit) {
        const ev = state.events.find((x) => x.id === edit.dataset.editEvent);
        if (ev) eventForm(ev, ev.kind);
      }
      const delStamp = e.target.closest("[data-del-stamp]");
      if (delStamp) {
        const ok = await askPin();
        closeModal();
        if (!ok) return;
        state.stamps = state.stamps.filter((s) => s.id !== delStamp.dataset.delStamp);
        save();
        render();
        toast("도장을 취소했습니다.");
      }
      const quick = e.target.closest("[data-quick-stamp]");
      if (quick) stampForm(quick.dataset.quickStamp, quick.dataset.cat);

      const pinBtn = e.target.closest("[data-pin]");
      if (pinBtn) {
        const v = pinBtn.dataset.pin;
        if (v === "C") state.pinBuffer = "";
        else if (v === "OK") {
          const ok = state.pinBuffer === state.pin;
          const resolve = state.pinResolve;
          closeModal();
          if (resolve) resolve(ok);
          if (!ok) toast("비밀번호가 올바르지 않습니다.");
          return;
        } else if (state.pinBuffer.length < 8) state.pinBuffer += v;
        updatePinDots();
      }
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
        if (weekdayWrap) weekdayWrap.style.display = e.target.value === "weekly" ? "" : "none";
        if (untilWrap) untilWrap.style.display = e.target.value === "none" ? "none" : "";
      }
    });

    document.addEventListener("submit", async (e) => {
      const formId = e.target && e.target.id;
      if (!["event-form", "stamp-form", "pin-form", "rates-form"].includes(formId)) return;
      e.preventDefault();
      if (formId === "event-form") {
        saveEventFromForm(e.target);
      }
      if (formId === "stamp-form") {
        saveStampFromForm(e.target);
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
        e.preventDefault();
        const fd = new FormData(e.target);
        DEFAULT_CATEGORIES.forEach((c) => {
          state.rates[c.id] = Number(fd.get(c.id) || 0);
        });
        save();
        toast("금액을 저장했습니다.");
        render();
      }
    }, true);
  }

  initCloud().then(() => {
    bind();
    render();
    updateCloudStatus();
  });
})();
