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
  const MEAL_SLOTS = [
    { id: "breakfast", label: "아침", emoji: "🌅" },
    { id: "lunch", label: "점심", emoji: "☀️" },
    { id: "dinner", label: "저녁", emoji: "🌙" },
  ];
  const SCHOOL_MEAL_DEFAULT = {
    enabled: true,
    name: "서울신서초등학교",
    atptOfcdcScCode: "B10",
    sdSchulCode: "7081454",
    key: "",
  };
  const SCHOOL_LUNCH_CACHE_KEY = "family-hub-school-lunch-cache";
  const DEFAULT_DOC = "families/yu-family";
  const PREFERRED_MEMBER_KEY = "family-hub-preferred-member";
  const WEATHER_REGION_KEY = "family-hub-weather-region";
  const WEATHER_KEY_STORAGE = "family-hub-weather-service-key";
  const WEATHER_CACHE_KEY = "family-hub-weather-cache";
  const POKE_RANK_KEY = "family-hub-poke-rank";
  const POKE_RANK_MIGRATED_KEY = "family-hub-poke-rank-migrated";
  const POKE_QUESTION_SECONDS = 5;
  const POKE_MAX_WRONG = 2;
  const POKE_RANK_TOP = 5;
  const POKE_CORRECT_DELAY_MS = 700;
  const POKE_WRONG_DELAY_MS = 900;
  const POKE_FAIL_DELAY_MS = 1400;
  const POKE_PLAYER_OPTIONS = [
    { id: "jaesang", name: "유재상" },
    { id: "sinjeong", name: "윤신정" },
    { id: "sua", name: "유수아" },
    { id: "sumin", name: "유수민" },
    { id: "other", name: "기타" },
  ];
  const POKE_MAX_ID = 151; // 1세대
  const TODO_PAST_DAYS = 2;
  const TODO_FUTURE_DAYS = 5;
  const TODO_MORE_STEP = 5;
  const TODO_OVERDUE_SCAN_DAYS = 365;
  const WEATHER_REGIONS = [
    { id: "seoul", label: "서울", nx: 60, ny: 127, lat: 37.5665, lon: 126.978 },
    { id: "suwon", label: "수원", nx: 60, ny: 121, lat: 37.2636, lon: 127.0286 },
    { id: "incheon", label: "인천", nx: 55, ny: 124, lat: 37.4563, lon: 126.7052 },
    { id: "bundang", label: "분당", nx: 62, ny: 123, lat: 37.3827, lon: 127.1189 },
    { id: "busan", label: "부산", nx: 98, ny: 76, lat: 35.1796, lon: 129.0756 },
    { id: "daejeon", label: "대전", nx: 67, ny: 100, lat: 36.3504, lon: 127.3845 },
    { id: "daegu", label: "대구", nx: 89, ny: 90, lat: 35.8714, lon: 128.6014 },
    { id: "gwangju", label: "광주", nx: 58, ny: 74, lat: 35.1595, lon: 126.8526 },
  ];

  const state = {
    tab: "calendar",
    calView: "month",
    cursor: startOfDay(new Date()),
    selected: startOfDay(new Date()),
    memberFilter: Object.fromEntries(MEMBERS.map((m) => [m.id, true])),
    todoFutureExtra: 0,
    typeFilter: { schedule: true, todo: true, stamp: true },
    pinBuffer: "",
    pinResolve: null,
    events: [],
    stamps: [],
    posts: [],
    meals: {},
    schoolLunches: {},
    schoolLunchMeta: { loading: false, error: "", school: "", range: "" },
    pin: "1234",
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    rates: { ...DEFAULT_RATES },
    todoRate: 500,
    weatherByDate: {},
    weatherMeta: { source: "", label: "", error: "" },
    weatherLoading: false,
    pokeGame: {
      loading: false,
      revealed: false,
      answered: false,
      pickedId: null,
      id: null,
      image: "",
      nameKo: "",
      nameEn: "",
      choices: [],
      message: "",
      error: "",
      countdown: 0,
      feedback: "",
    },
    pokeNamePool: [],
    pokeNamePoolLoading: false,
    pokeSession: {
      phase: "setup",
      playerId: "jaesang",
      playerName: "",
      round: 0,
      score: 0,
      wrongCount: 0,
      endReason: "",
    },
    pokeRank: [],
    cloudReady: false,
    cloudError: "",
    saving: false,
    applyingRemote: false,
    settingsUnlocked: false,
  };

  let db = null;
  let pokeTimerId = null;
  let pokeAdvanceTimeout = null;
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
      todoRate: state.todoRate,
      meals: state.meals,
      pokeRank: state.pokeRank,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  function normalizePokeRank(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((e) => ({
        name: String(e?.name || "").trim(),
        score: Number(e?.score) || 0,
        rounds: Number(e?.rounds) || 0,
        reason: String(e?.reason || ""),
        at: String(e?.at || ""),
      }))
      .filter((e) => e.name)
      .slice(-100);
  }

  function readLocalPokeRank() {
    try {
      const raw = localStorage.getItem(POKE_RANK_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return normalizePokeRank(list);
    } catch (_) {
      return [];
    }
  }

  function migrateLocalPokeRankIfNeeded() {
    try {
      if (localStorage.getItem(POKE_RANK_MIGRATED_KEY) === "1") return false;
      const local = readLocalPokeRank();
      localStorage.setItem(POKE_RANK_MIGRATED_KEY, "1");
      if (!local.length) {
        localStorage.removeItem(POKE_RANK_KEY);
        return false;
      }
      const keyOf = (e) => `${e.name}|${e.score}|${e.rounds}|${e.at}`;
      const seen = new Set(state.pokeRank.map(keyOf));
      let added = false;
      local.forEach((e) => {
        if (seen.has(keyOf(e))) return;
        state.pokeRank.push(e);
        seen.add(keyOf(e));
        added = true;
      });
      if (state.pokeRank.length > 100) state.pokeRank = state.pokeRank.slice(-100);
      localStorage.removeItem(POKE_RANK_KEY);
      return added;
    } catch (_) {
      return false;
    }
  }

  function normalizeMeals(raw) {
    if (!raw || typeof raw !== "object") return {};
    const out = {};
    Object.keys(raw).forEach((key) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
      const row = raw[key] || {};
      const entry = {};
      MEAL_SLOTS.forEach((slot) => {
        const val = String(row[slot.id] || "").trim();
        if (val) entry[slot.id] = val;
      });
      if (Object.keys(entry).length) out[key] = entry;
    });
    return out;
  }

  function getMealsForDate(date) {
    const key = ymd(date);
    const row = state.meals[key] || {};
    const breakfast = String(row.breakfast || "").trim();
    const manualLunch = String(row.lunch || "").trim();
    const schoolLunch = String(state.schoolLunches[key] || "").trim();
    const dinner = String(row.dinner || "").trim();
    return {
      breakfast,
      lunch: manualLunch || schoolLunch,
      dinner,
      lunchSource: manualLunch ? "manual" : schoolLunch ? "school" : "",
    };
  }

  function fillMealForm(date) {
    const form = document.getElementById("meal-form");
    if (!form) return;
    const d = startOfDay(date || new Date());
    form.querySelector('[name="date"]').value = ymd(d);
    const meals = getMealsForDate(d);
    MEAL_SLOTS.forEach((slot) => {
      const input = form.querySelector(`[name="${slot.id}"]`);
      if (!input) return;
      const manual = String((state.meals[ymd(d)] || {})[slot.id] || "").trim();
      input.value = manual;
      if (slot.id === "lunch") {
        input.placeholder = meals.lunchSource === "school" ? meals.lunch : "점심 메뉴 (비우면 신서초 급식 사용)";
      }
    });
    const hint = document.getElementById("meal-school-hint");
    if (hint) {
      if (meals.lunchSource === "school") {
        hint.textContent = `이 날짜 점심은 신서초 급식으로 표시됩니다: ${meals.lunch}`;
      } else if (meals.lunchSource === "manual") {
        hint.textContent = "이 날짜 점심은 직접 입력한 메뉴가 우선 적용됩니다.";
      } else {
        hint.textContent = "해당 날짜 급식이 없거나 아직 불러오지 않았어요.";
      }
    }
  }

  function saveMealsFromForm(form) {
    const dateStr = String(form.querySelector('[name="date"]')?.value || "").trim();
    if (!dateStr) return toast("날짜를 선택해 주세요.");
    const entry = {};
    MEAL_SLOTS.forEach((slot) => {
      const val = String(form.querySelector(`[name="${slot.id}"]`)?.value || "").trim();
      if (val) entry[slot.id] = val;
    });
    if (Object.keys(entry).length) state.meals[dateStr] = entry;
    else delete state.meals[dateStr];
    save();
    toast("식단을 저장했습니다.");
    render();
  }

  function getSchoolMealConfig() {
    const cfg = window.FAMILY_HUB_SCHOOL_MEAL || {};
    return {
      ...SCHOOL_MEAL_DEFAULT,
      ...cfg,
      enabled: cfg.enabled !== false,
    };
  }

  function ymdToNeis(dateStr) {
    return String(dateStr || "").replace(/-/g, "");
  }

  function neisToYmd(neisYmd) {
    const s = String(neisYmd || "");
    if (s.length !== 8) return "";
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  function formatSchoolDishName(raw) {
    return String(raw || "")
      .split(/<br\s*\/?>/i)
      .map((part) =>
        part
          .replace(/\([^)]*\)/g, "")
          .replace(/\*/g, "")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean)
      .join(" · ");
  }

  function loadSchoolLunchCache() {
    try {
      const raw = localStorage.getItem(SCHOOL_LUNCH_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (Date.now() - (parsed.savedAt || 0) > 12 * 60 * 60 * 1000) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function saveSchoolLunchCache(byDate, meta) {
    try {
      localStorage.setItem(
        SCHOOL_LUNCH_CACHE_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          byDate,
          school: meta.school || "",
          range: meta.range || "",
        })
      );
    } catch (_) {
      /* ignore */
    }
  }

  async function fetchSchoolLunches(fromDate, toDate) {
    const cfg = getSchoolMealConfig();
    if (!cfg.enabled) return {};
    const from = ymdToNeis(ymd(fromDate));
    const to = ymdToNeis(ymd(toDate));
    const params = new URLSearchParams({
      Type: "json",
      pIndex: "1",
      pSize: "100",
      ATPT_OFCDC_SC_CODE: cfg.atptOfcdcScCode,
      SD_SCHUL_CODE: cfg.sdSchulCode,
      MMEAL_SC_CODE: "2",
      MLSV_FROM_YMD: from,
      MLSV_TO_YMD: to,
    });
    if (cfg.key) params.set("KEY", cfg.key);
    const res = await fetch(`https://open.neis.go.kr/hub/mealServiceDietInfo?${params}`);
    if (!res.ok) throw new Error(`급식 API 오류 (${res.status})`);
    const data = await res.json();
    const block = data.mealServiceDietInfo;
    if (!Array.isArray(block)) {
      const code = data.RESULT?.CODE || "";
      if (code === "INFO-200") return {};
      throw new Error(data.RESULT?.MESSAGE || "급식 정보를 가져오지 못했어요.");
    }
    const result = block[0]?.head?.find((h) => h.RESULT)?.RESULT;
    if (result?.CODE && result.CODE !== "INFO-000") {
      if (result.CODE === "INFO-200") return {};
      throw new Error(result.MESSAGE || "급식 정보를 가져오지 못했어요.");
    }
    const rows = block[1]?.row || [];
    const byDate = {};
    rows.forEach((row) => {
      const key = neisToYmd(row.MLSV_YMD);
      const menu = formatSchoolDishName(row.DDISH_NM);
      if (key && menu) byDate[key] = menu;
    });
    return byDate;
  }

  async function ensureSchoolLunches(centerDate = state.cursor, force = false) {
    const cfg = getSchoolMealConfig();
    if (!cfg.enabled) return;
    const center = startOfDay(centerDate || new Date());
    const from = addDays(center, -14);
    const to = addDays(center, 21);
    const range = `${ymd(from)}~${ymd(to)}`;

    if (!force) {
      const cached = loadSchoolLunchCache();
      if (cached?.byDate && Object.keys(cached.byDate).length) {
        state.schoolLunches = { ...state.schoolLunches, ...cached.byDate };
        state.schoolLunchMeta = {
          loading: false,
          error: "",
          school: cached.school || cfg.name,
          range: cached.range || range,
        };
        if (cached.range === range) return;
      }
      if (state.schoolLunchMeta.loading) return;
      if (state.schoolLunchMeta.range === range && Object.keys(state.schoolLunches).length) return;
    }

    state.schoolLunchMeta = { ...state.schoolLunchMeta, loading: true, error: "", school: cfg.name };
    try {
      const byDate = await fetchSchoolLunches(from, to);
      state.schoolLunches = { ...state.schoolLunches, ...byDate };
      state.schoolLunchMeta = {
        loading: false,
        error: "",
        school: cfg.name,
        range,
      };
      saveSchoolLunchCache(state.schoolLunches, state.schoolLunchMeta);
    } catch (err) {
      state.schoolLunchMeta = {
        loading: false,
        error: err.message || String(err),
        school: cfg.name,
        range: state.schoolLunchMeta.range || "",
      };
    }
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
    const todoRate = Number(data.todoRate);
    state.todoRate = Number.isFinite(todoRate) && todoRate >= 0 ? todoRate : 500;
    state.meals = normalizeMeals(data.meals);
    state.pokeRank = normalizePokeRank(data.pokeRank);
    const migrated = migrateLocalPokeRankIfNeeded();
    render();
    state.applyingRemote = false;
    if (migrated) save();
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
      { id: "stamp", label: "용돈", icon: "💮" },
    ];
    const el = $("#type-filters");
    if (!el) return;
    el.innerHTML =
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
    const html =
      `<span class="filter-label">가족</span>` +
      MEMBERS.map(
        (m) => `
      <label class="chip">
        <span class="dot" style="background:${m.color}"></span>
        <input type="checkbox" data-member="${m.id}" ${state.memberFilter[m.id] ? "checked" : ""} />
        ${m.name}<span class="chip-role"> (${m.role})</span>
      </label>`
      ).join("");
    document.querySelectorAll("[data-member-filters]").forEach((el) => {
      el.innerHTML = html;
    });
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
          <div class="day-num-row">
            <div class="day-num">${day.getDate()}</div>
            ${weatherChipHtml(ymd(day))}
          </div>
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
      const key = ymd(d);
      return `<div class="week-head ${sameDay(d, new Date()) ? "is-today" : ""}" data-date="${key}">
        <div>${WEEKDAYS[d.getDay()]} ${d.getDate()}</div>
        ${weatherChipHtml(key)}
      </div>`;
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
    const w = state.weatherByDate[ymd(d)];
    const weatherLine = w ? `<p class="day-weather-line">${esc(w.text)}</p>` : "";
    if (!items.length && !stamps.length) {
      return `${weatherLine}<div class="day-list">${emptyState("이 날 등록된 일정·할 일·도장이 없습니다.")}</div>`;
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
    return `${weatherLine}<div class="day-list">${rows}${stampRows}</div>`;
  }

  function dayItemsHtml(d) {
    const items = eventsOn(d);
    const stamps = stampsOn(d);
    if (!items.length && !stamps.length) {
      return emptyState("아직 비어 있어요. 일정, 할 일, 용돈을 추가해 보세요.");
    }
    const rows = items
      .map((ev) => {
        const occ = getOccurrence(ev, d);
        const m = memberById(occ.memberId);
        const done = occ.kind === "todo" && isTodoDone(ev, d);
        return `<div class="item-row kind-${occ.kind}${done ? " is-done" : ""}" style="--member:${m.color}">
          <span class="item-kind">${occ.kind === "todo" ? "할일" : "일정"}</span>
          ${
            occ.kind === "todo"
              ? `<input type="checkbox" data-toggle-todo="${ev.id}" data-date="${ymd(d)}" ${done ? "checked" : ""} />`
              : `<span class="dot" style="background:${m.color};margin-top:6px"></span>`
          }
          <div class="item-body">
            <strong>${done ? "✓ " : occ.kind === "todo" ? "○ " : ""}${esc(occ.title)}</strong>
            <div class="meta">${esc(m.name)} · ${occ.allDay ? "하루 종일" : `${occ.startTime || ""} ~ ${occ.endTime || ""}`}${isRecurring(ev) ? " · 반복" : ""}</div>
          </div>
          <button type="button" data-edit-event="${ev.id}" data-occurrence-date="${ymd(d)}">수정</button>
        </div>`;
      })
      .join("");
    const stampRows = stamps
      .map(
        (s) => `<div class="item-row kind-stamp" style="--member:${memberById(s.memberId).color}">
          <span class="item-kind">도장</span>
          <span>${categoryById(s.categoryId).emoji}</span>
          <div class="item-body"><strong>${esc(categoryById(s.categoryId).name)}</strong>
          <div class="meta">${esc(memberById(s.memberId).name)}${s.note ? " · " + esc(s.note) : ""}</div></div>
          <button class="danger" type="button" data-del-stamp="${s.id}">삭제</button>
        </div>`
      )
      .join("");
    return `${rows}${stampRows}`;
  }

  function mealPlanModalHtml(d) {
    const meals = getMealsForDate(d);
    const cfg = getSchoolMealConfig();
    const rows = MEAL_SLOTS.map((slot) => {
      const menu = meals[slot.id] || "";
      const isSchoolLunch = slot.id === "lunch" && meals.lunchSource === "school";
      return `<div class="meal-row${menu ? "" : " is-empty"}">
        <span class="meal-slot">${slot.emoji} ${slot.label}</span>
        <span class="meal-menu">
          ${menu ? esc(menu) : "—"}
          ${isSchoolLunch ? `<small class="meal-source">${esc(cfg.name)} 급식</small>` : ""}
        </span>
      </div>`;
    }).join("");
    return `<section class="meal-plan-block">
      <div class="meal-plan-head">
        <h4>식단표</h4>
        <button type="button" class="ghost tiny" id="goto-meal-settings">설정에서 입력</button>
      </div>
      <div class="meal-list">${rows}</div>
      ${
        state.schoolLunchMeta.loading
          ? `<p class="hint meal-school-status">신서초 급식을 불러오는 중…</p>`
          : state.schoolLunchMeta.error
            ? `<p class="hint meal-school-status">급식 불러오기 실패: ${esc(state.schoolLunchMeta.error)}</p>`
            : ""
      }
    </section>`;
  }

  async function openDayDetailModal(date) {
    const d = startOfDay(date);
    state.selected = d;
    const w = state.weatherByDate[ymd(d)];
    const weatherLine = w
      ? `<p class="day-weather-line">${esc(w.text)}${state.weatherMeta.source ? ` · ${esc(state.weatherMeta.source)}` : ""}</p>`
      : "";
    openModal(`
      <div class="day-modal">
        <h3>${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})</h3>
        ${weatherLine}
        ${mealPlanModalHtml(d)}
        <div class="panel-actions">
          <button type="button" id="panel-add-event">일정</button>
          <button type="button" id="panel-add-todo">할 일</button>
          <button type="button" id="panel-add-stamp">용돈</button>
        </div>
        <div class="legend">
          <span class="legend-type schedule">일정</span>
          <span class="legend-type todo">할 일</span>
          <span class="legend-type stamp">용돈</span>
          <span>○ 미완료 · ✓ 완료</span>
        </div>
        <div class="day-panel-body day-list">${dayItemsHtml(d)}</div>
        <div class="modal-actions"><button type="button" id="cancel-modal">닫기</button></div>
      </div>
    `);
    await ensureSchoolLunches(d);
    if (document.querySelector(".day-modal") && sameDay(state.selected, d)) {
      const block = document.querySelector(".meal-plan-block");
      if (block) block.outerHTML = mealPlanModalHtml(d);
    }
  }

  function todosOn(date) {
    return state.events
      .filter((ev) => ev.kind === "todo" && occursOn(ev, date) && state.memberFilter[ev.memberId])
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
  }

  function todoRowHtml(ev, d, { overdue = false } = {}) {
    const occ = getOccurrence(ev, d);
    const m = memberById(occ.memberId);
    const done = isTodoDone(ev, d);
    const time = occ.allDay ? "하루 종일" : `${occ.startTime || ""} ~ ${occ.endTime || ""}`;
    return `<div class="item-row kind-todo${done ? " is-done" : ""}${overdue && !done ? " is-overdue" : ""}" style="--member:${m.color}">
      <span class="item-kind">할일</span>
      <input type="checkbox" data-toggle-todo="${ev.id}" data-date="${ymd(d)}" ${done ? "checked" : ""} />
      <div class="item-body">
        <strong>${done ? "✓ " : "○ "}${esc(occ.title)}</strong>
        <div class="meta">${esc(m.name)} · ${formatTodoDateLabel(d)} · ${time}${isRecurring(ev) ? " · 반복" : ""}${overdue && !done ? " · 지연" : ""}</div>
      </div>
      <button type="button" data-edit-event="${ev.id}" data-occurrence-date="${ymd(d)}">수정</button>
    </div>`;
  }

  function formatTodoDateLabel(d) {
    const today = startOfDay(new Date());
    if (sameDay(d, today)) return "오늘";
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    return `${y !== today.getFullYear() ? `${y}년 ` : ""}${m}월 ${day}일 (${WEEKDAYS[d.getDay()]})`;
  }

  function todoRangeLabel(start, end) {
    const sy = start.getFullYear();
    const ey = end.getFullYear();
    const sm = start.getMonth() + 1;
    const em = end.getMonth() + 1;
    const sd = start.getDate();
    const ed = end.getDate();
    if (sy === ey && sm === em) return `${sm}월 ${sd}일 ~ ${ed}일`;
    if (sy === ey) return `${sy}년 ${sm}월 ${sd}일 ~ ${em}월 ${ed}일`;
    return `${sy}.${sm}.${sd} ~ ${ey}.${em}.${ed}`;
  }

  function getTodoVisibleRange() {
    const today = startOfDay(new Date());
    const extra = state.todoFutureExtra || 0;
    return {
      today,
      start: addDays(today, -TODO_PAST_DAYS),
      end: addDays(today, TODO_FUTURE_DAYS + extra),
    };
  }

  function delayedTodoItems() {
    const today = startOfDay(new Date());
    let scanEnd = addDays(today, -TODO_OVERDUE_SCAN_DAYS);
    state.events.forEach((ev) => {
      if (ev.kind !== "todo") return;
      const start = parseYmd(ev.date);
      if (start < today && start < scanEnd) scanEnd = start;
    });
    const items = [];
    for (let d = addDays(today, -1); d >= scanEnd; d = addDays(d, -1)) {
      todosOn(d).forEach((ev) => {
        if (!isTodoDone(ev, d)) items.push({ ev, d });
      });
    }
    return items.sort(
      (a, b) => a.d - b.d || (a.ev.startTime || "").localeCompare(b.ev.startTime || "")
    );
  }

  function todoDaySectionHtml(d, { hideIncompletePast = false } = {}) {
    const today = startOfDay(new Date());
    let list = todosOn(d);
    if (hideIncompletePast && d < today) {
      list = list.filter((ev) => isTodoDone(ev, d));
    }
    if (!list.length) return "";
    const isPast = d < today;
    const isToday = sameDay(d, today);
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return `<section class="todo-day${isPast ? " is-past" : ""}${isToday ? " is-today" : ""}" data-date="${ymd(d)}">
      <h3 class="todo-day-title">
        ${month}월 ${day}일 (${WEEKDAYS[d.getDay()]})
        ${isToday ? '<span class="todo-badge">오늘</span>' : ""}
        ${isPast ? '<span class="todo-badge is-past">지난 날</span>' : ""}
      </h3>
      <div class="day-list">${list.map((ev) => todoRowHtml(ev, d, { overdue: isPast })).join("")}</div>
    </section>`;
  }

  function renderTodos() {
    const title = $("#todo-month-title");
    const root = $("#todo-list-root");
    if (!title || !root) return;
    const { today, start, end } = getTodoVisibleRange();
    title.textContent = todoRangeLabel(start, end);
    const parts = [];
    const delayed = delayedTodoItems();

    if (delayed.length) {
      parts.push(`<section class="todo-delayed-block">
        <h3 class="todo-section-title">지연된 할일 <span class="todo-badge is-past">${delayed.length}건</span></h3>
        <div class="day-list">${delayed.map(({ ev, d }) => todoRowHtml(ev, d, { overdue: true })).join("")}</div>
      </section>`);
    }

    const daySections = [];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const html = todoDaySectionHtml(d, { hideIncompletePast: true });
      if (html) daySections.push(html);
    }
    parts.push(...daySections);

    if (!delayed.length && !daySections.length) {
      parts.push(emptyState("표시할 할 일이 없어요. 위에서 추가해 보세요."));
    }

    parts.push(`<div class="todo-more-wrap">
      <button type="button" id="todo-show-more" class="ghost">더 보기 (+${TODO_MORE_STEP}일)</button>
    </div>`);

    root.innerHTML = parts.join("");
  }

  function weatherIcon(sky, pty) {
    const p = Number(pty) || 0;
    const s = Number(sky) || 1;
    if (p === 1 || p === 4) return "🌧️";
    if (p === 2) return "🌨️";
    if (p === 3) return "❄️";
    if (s === 1) return "☀️";
    if (s === 3) return "⛅";
    if (s === 4) return "☁️";
    return "🌡️";
  }

  function weatherIconFromWmo(code) {
    const c = Number(code) || 0;
    if (c === 0) return "☀️";
    if (c <= 3) return "⛅";
    if (c <= 48) return "🌫️";
    if (c <= 57) return "🌦️";
    if (c <= 67) return "🌧️";
    if (c <= 77) return "❄️";
    if (c <= 82) return "🌧️";
    if (c <= 86) return "🌨️";
    if (c >= 95) return "⛈️";
    return "🌡️";
  }

  function getWeatherRegion() {
    let id = "";
    try {
      id = localStorage.getItem(WEATHER_REGION_KEY) || "";
    } catch (_) {
      /* ignore */
    }
    if (!id) id = window.FAMILY_HUB_WEATHER?.regionId || "seoul";
    return WEATHER_REGIONS.find((r) => r.id === id) || WEATHER_REGIONS[0];
  }

  function getWeatherServiceKey() {
    try {
      const saved = localStorage.getItem(WEATHER_KEY_STORAGE);
      if (saved) return saved.trim();
    } catch (_) {
      /* ignore */
    }
    return String(window.FAMILY_HUB_WEATHER?.serviceKey || "").trim();
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function ymdCompact(d) {
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  }

  function compactToYmd(s) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  function getVilageBaseDateTime() {
    const now = new Date();
    const times = [2, 5, 8, 11, 14, 17, 20, 23];
    const hour = now.getHours();
    const minute = now.getMinutes();
    let base = null;
    for (let i = times.length - 1; i >= 0; i--) {
      const t = times[i];
      if (hour > t || (hour === t && minute >= 10)) {
        base = t;
        break;
      }
    }
    if (base == null) {
      const prev = addDays(now, -1);
      return { base_date: ymdCompact(prev), base_time: "2300" };
    }
    return { base_date: ymdCompact(now), base_time: `${pad2(base)}00` };
  }

  function weatherChipHtml(dateKey) {
    const w = state.weatherByDate[dateKey];
    if (!w) return "";
    const tmp = w.tmp != null ? `${w.tmp}°` : "";
    return `<span class="day-weather" title="${esc(w.text || "")}">${w.icon}${tmp ? ` ${tmp}` : ""}</span>`;
  }

  function summarizeKmaItems(items) {
    const byDate = {};
    items.forEach((item) => {
      const key = compactToYmd(item.fcstDate);
      if (!byDate[key]) byDate[key] = { tmps: [], sky: null, pty: 0, pop: 0, noonSky: null, noonPty: null };
      const bucket = byDate[key];
      if (item.category === "TMP") bucket.tmps.push(Number(item.fcstValue));
      if (item.category === "SKY") {
        bucket.sky = Number(item.fcstValue);
        if (item.fcstTime === "1200") bucket.noonSky = Number(item.fcstValue);
      }
      if (item.category === "PTY") {
        const p = Number(item.fcstValue) || 0;
        bucket.pty = Math.max(bucket.pty, p);
        if (item.fcstTime === "1200") bucket.noonPty = p;
      }
      if (item.category === "POP") bucket.pop = Math.max(bucket.pop, Number(item.fcstValue) || 0);
    });
    const out = {};
    Object.keys(byDate).forEach((key) => {
      const b = byDate[key];
      const sky = b.noonSky != null ? b.noonSky : b.sky;
      const pty = b.noonPty != null ? b.noonPty : b.pty;
      const tmp = b.tmps.length ? Math.round(b.tmps.reduce((a, c) => a + c, 0) / b.tmps.length) : null;
      const max = b.tmps.length ? Math.round(Math.max(...b.tmps)) : tmp;
      const icon = weatherIcon(sky, pty);
      out[key] = {
        icon,
        tmp: max,
        pop: b.pop,
        text: `${icon} ${max != null ? max + "°" : ""}${b.pop ? ` · 강수확률 ${b.pop}%` : ""}`.trim(),
      };
    });
    return out;
  }

  async function fetchKmaWeather(region) {
    const serviceKey = getWeatherServiceKey();
    if (!serviceKey || serviceKey.startsWith("PASTE")) {
      throw new Error("기상청 API 키가 없습니다.");
    }
    const { base_date, base_time } = getVilageBaseDateTime();
    const params = new URLSearchParams({
      serviceKey,
      pageNo: "1",
      numOfRows: "1000",
      dataType: "JSON",
      base_date,
      base_time,
      nx: String(region.nx),
      ny: String(region.ny),
    });
    // serviceKey는 이미 인코딩된 키일 수 있어 URLSearchParams 재인코딩을 피함
    const qs = [...params.entries()]
      .map(([k, v]) => `${encodeURIComponent(k)}=${k === "serviceKey" ? v : encodeURIComponent(v)}`)
      .join("&");
    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${qs}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`기상청 응답 오류 (${res.status})`);
    const json = await res.json();
    const header = json?.response?.header;
    if (header && header.resultCode !== "00") {
      throw new Error(header.resultMsg || "기상청 조회 실패");
    }
    const items = json?.response?.body?.items?.item || [];
    if (!items.length) throw new Error("기상청 예보 데이터가 비어 있습니다.");
    return { byDate: summarizeKmaItems(items), source: "기상청 단기예보" };
  }

  async function fetchOpenMeteoWeather(region) {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${region.lat}&longitude=${region.lon}` +
      `&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=Asia%2FSeoul&forecast_days=7`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`날씨 응답 오류 (${res.status})`);
    const json = await res.json();
    const days = json?.daily?.time || [];
    const codes = json?.daily?.weather_code || [];
    const maxs = json?.daily?.temperature_2m_max || [];
    const pops = json?.daily?.precipitation_probability_max || [];
    const byDate = {};
    days.forEach((date, i) => {
      const icon = weatherIconFromWmo(codes[i]);
      const tmp = maxs[i] != null ? Math.round(maxs[i]) : null;
      const pop = pops[i] != null ? Math.round(pops[i]) : 0;
      byDate[date] = {
        icon,
        tmp,
        pop,
        text: `${icon} ${tmp != null ? tmp + "°" : ""}${pop ? ` · 강수확률 ${pop}%` : ""}`.trim(),
      };
    });
    return { byDate, source: "Open-Meteo 예보" };
  }

  function loadWeatherCache(regionId) {
    try {
      const raw = localStorage.getItem(WEATHER_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.regionId !== regionId) return null;
      if (Date.now() - parsed.savedAt > 45 * 60 * 1000) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function saveWeatherCache(regionId, payload) {
    try {
      localStorage.setItem(
        WEATHER_CACHE_KEY,
        JSON.stringify({
          regionId,
          savedAt: Date.now(),
          byDate: payload.byDate,
          source: payload.source,
          label: payload.label,
        })
      );
    } catch (_) {
      /* ignore */
    }
  }

  async function ensureWeather(force = false) {
    const region = getWeatherRegion();
    if (!force) {
      const cached = loadWeatherCache(region.id);
      if (cached) {
        state.weatherByDate = cached.byDate || {};
        state.weatherMeta = { source: cached.source || "", label: region.label, error: "" };
        return;
      }
      if (state.weatherLoading) return;
      if (Object.keys(state.weatherByDate).length && state.weatherMeta.label === region.label) return;
    }
    state.weatherLoading = true;
    try {
      let result;
      let error = "";
      try {
        result = await fetchKmaWeather(region);
      } catch (kmaErr) {
        error = kmaErr.message || String(kmaErr);
        result = await fetchOpenMeteoWeather(region);
      }
      state.weatherByDate = result.byDate;
      state.weatherMeta = {
        source: result.source,
        label: region.label,
        error: result.source.startsWith("기상청") ? "" : error ? `기상청 대신 대체 예보 사용 (${error})` : "",
      };
      saveWeatherCache(region.id, {
        byDate: state.weatherByDate,
        source: state.weatherMeta.source,
        label: region.label,
      });
    } catch (err) {
      state.weatherMeta = {
        source: "",
        label: region.label,
        error: err.message || String(err),
      };
    } finally {
      state.weatherLoading = false;
      if (state.tab === "calendar") renderCalendar();
    }
  }

  function weatherBannerHtml() {
    const region = getWeatherRegion();
    const meta = state.weatherMeta;
    if (state.weatherLoading && !Object.keys(state.weatherByDate).length) {
      return `<p class="weather-banner hint">날씨를 불러오는 중… (${esc(region.label)})</p>`;
    }
    if (meta.error && !Object.keys(state.weatherByDate).length) {
      return `<p class="weather-banner hint">날씨를 불러오지 못했어요. 설정에서 API 키·지역을 확인해 주세요.</p>`;
    }
    if (!Object.keys(state.weatherByDate).length) return "";
    const note = meta.source ? `${esc(region.label)} · ${esc(meta.source)}` : esc(region.label);
    return `<p class="weather-banner hint">${note}${meta.error && meta.source ? " · 대체 예보" : ""}</p>`;
  }

  function renderCalendar() {
    $("#period-title").textContent = periodTitle();
    document.querySelectorAll("[data-cal-view]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.calView === state.calView);
    });
    const root = $("#calendar-root");
    let body = "";
    if (state.calView === "month") body = renderMonth();
    if (state.calView === "week") body = renderWeek();
    if (state.calView === "day") body = renderDay();
    root.innerHTML = `${weatherBannerHtml()}${body}`;
    ensureWeather();
    ensureSchoolLunches(state.cursor);
  }

  function stampsInMonth(memberId, year, month) {
    return state.stamps.filter((s) => {
      const d = parseYmd(s.date);
      return s.memberId === memberId && d.getFullYear() === year && d.getMonth() === month;
    });
  }

  function completedTodosInMonth(memberId, year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = startOfDay(new Date(year, month, day));
      state.events.forEach((ev) => {
        if (ev.kind !== "todo" || !occursOn(ev, d)) return;
        const occ = getOccurrence(ev, d);
        if (occ.memberId !== memberId) return;
        if (isTodoDone(ev, d)) count += 1;
      });
    }
    return count;
  }

  function renderStampBoard() {
    const d = state.cursor;
    const year = d.getFullYear();
    const month = d.getMonth();
    $("#stamp-month-title").textContent = monthLabel(d);
    $("#stamp-board").innerHTML = ALLOWANCE_MEMBERS.map((m) => {
      const list = stampsInMonth(m.id, year, month);
      const cats = state.categories.map((c) => {
        const n = list.filter((s) => s.categoryId === c.id).length;
        const won = n * (state.rates[c.id] || 0);
        return `<button class="stamp-btn" type="button" data-quick-stamp="${m.id}" data-cat="${c.id}">
          <span>${c.emoji} ${c.name}</span>
          <strong class="stamp-count">${n}</strong>
          <small>${won.toLocaleString()}원</small>
        </button>`;
      }).join("");
      const todoCount = completedTodosInMonth(m.id, year, month);
      const todoWon = todoCount * (state.todoRate || 0);
      const stampTotal = list.reduce((sum, s) => sum + (state.rates[s.categoryId] || 0), 0);
      const total = stampTotal + todoWon;
      return `<article class="member-card">
        <h3><span class="dot" style="background:${m.color}"></span> ${m.name} (${m.role})</h3>
        <p class="hint">이번 달 예상 용돈 <strong>${total.toLocaleString()}원</strong></p>
        <div class="stamp-cats">
          ${cats}
          <div class="stamp-btn is-todo-rate" title="완료한 할 일">
            <span>☑ 할 일 완료</span>
            <strong class="stamp-count">${todoCount}</strong>
            <small>${todoWon.toLocaleString()}원</small>
          </div>
        </div>
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
    const region = getWeatherRegion();
    const keyVal = getWeatherServiceKey();
    $("#weather-form").innerHTML = `
      <label>지역
        <select id="weather-region">
          ${WEATHER_REGIONS.map((r) => `<option value="${r.id}" ${r.id === region.id ? "selected" : ""}>${r.label}</option>`).join("")}
        </select>
      </label>
      <label>기상청 API 키 (선택)
        <input id="weather-service-key" type="password" autocomplete="off" placeholder="공공데이터포털 Decoding 키" value="${esc(keyVal)}" />
      </label>
      <p class="hint">키가 있으면 기상청 단기예보를 쓰고, 없거나 실패하면 대체 예보를 표시합니다. <a href="https://www.data.go.kr/data/15084084/openapi.do" target="_blank" rel="noopener">키 발급 안내</a></p>
      <p class="hint">${state.weatherMeta.source ? `현재: ${esc(state.weatherMeta.source)}` : "아직 날씨를 불러오지 않았어요."}</p>
      <button class="primary" type="button" id="save-weather">날씨 설정 저장</button>
      <button type="button" id="refresh-weather">지금 새로고침</button>`;
    $("#rates-form").innerHTML = `
      <div class="todo-rate-box">
        <label>할 일 1개 완료 시 용돈
          <input type="number" id="todo-rate-input" name="todoRate" min="0" step="50" value="${state.todoRate || 0}" />
        </label>
        <p class="hint">유수아·유수민이 할 일을 완료하면 매달 개수 × 이 금액이 용돈에 더해집니다.</p>
      </div>
      <div class="cat-edit-head"><span>이모지</span><span>항목 이름</span><span>금액</span><span></span></div>
      ${rows || `<p class="hint">항목이 없습니다. 아래에서 추가해 주세요.</p>`}
      <div class="cat-edit-actions">
        <button type="button" id="add-category">항목 추가</button>
        <button class="primary" type="button" id="save-rates">항목·금액 저장</button>
      </div>`;
    const mealFields = MEAL_SLOTS.map((slot) => {
      if (slot.id === "lunch") {
        return `<label>${slot.emoji} ${slot.label}
          <textarea name="${slot.id}" rows="2" maxlength="200" placeholder="비우면 신서초 급식을 사용합니다"></textarea>
        </label>`;
      }
      return `<label>${slot.emoji} ${slot.label}
        <input name="${slot.id}" maxlength="40" placeholder="${slot.label} 메뉴" />
      </label>`;
    }).join("");
    const mealForm = document.getElementById("meal-form");
    if (mealForm) {
      const cfg = getSchoolMealConfig();
      mealForm.innerHTML = `
        <p class="hint">점심은 <strong>${esc(cfg.name)}</strong> 나이스 급식 API를 기본으로 불러옵니다. 직접 입력하면 그 값이 우선합니다.</p>
        <label>날짜
          <input type="date" name="date" required />
        </label>
        ${mealFields}
        <p class="hint" id="meal-school-hint"></p>
        <div class="meal-edit-actions">
          <button class="primary" type="button" id="save-meals">식단 저장</button>
          <button type="button" id="refresh-school-lunch">급식 다시 불러오기</button>
        </div>`;
      fillMealForm(state.selected);
    }
    updateCloudStatus();
  }

  function readTodoRateFromForm(form) {
    const raw = form?.querySelector('[name="todoRate"]')?.value;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : state.todoRate || 0;
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
    return { categories: nextCats, rates: nextRates, todoRate: readTodoRateFromForm(form) };
  }

  function saveCategoriesFromForm(form) {
    const collected = collectCategoriesFromForm(form);
    if (!collected) return;
    state.categories = collected.categories;
    state.rates = collected.rates;
    state.todoRate = collected.todoRate;
    save();
    toast("도장 항목을 저장했습니다.");
    render();
  }

  function shuffleArray(arr) {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  async function fetchPokeNameKo(id) {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`);
    if (!res.ok) throw new Error(`species ${id}`);
    const species = await res.json();
    const ko = (species.names || []).find((n) => n.language?.name === "ko");
    return { id, nameKo: ko?.name || species.name };
  }

  async function ensurePokeNamePool() {
    if (state.pokeNamePool.length >= POKE_MAX_ID) return;
    if (state.pokeNamePoolLoading) {
      while (state.pokeNamePoolLoading) await new Promise((r) => setTimeout(r, 80));
      return;
    }
    state.pokeNamePoolLoading = true;
    try {
      const pool = [];
      const batchSize = 25;
      for (let start = 1; start <= POKE_MAX_ID; start += batchSize) {
        const end = Math.min(start + batchSize - 1, POKE_MAX_ID);
        const batch = await Promise.all(
          Array.from({ length: end - start + 1 }, (_, i) => fetchPokeNameKo(start + i))
        );
        pool.push(...batch);
      }
      state.pokeNamePool = pool;
    } catch (_) {
      /* pool partial ok */
    } finally {
      state.pokeNamePoolLoading = false;
    }
  }

  function pokeNameSimilarity(nameA, nameB, idA, idB) {
    let score = 0;
    if (!nameA || !nameB) return score;
    if (nameA[0] === nameB[0]) score += 5;
    if (Math.abs(nameA.length - nameB.length) <= 1) score += 3;
    if (nameA.slice(-1) === nameB.slice(-1)) score += 2;
    if (Math.abs(idA - idB) <= 3) score += 3;
    else if (Math.abs(idA - idB) <= 12) score += 1;
    for (let i = 0; i < nameA.length - 1; i++) {
      const chunk = nameA.slice(i, i + 2);
      if (chunk.length === 2 && nameB.includes(chunk)) score += 1;
    }
    return score + Math.random() * 0.3;
  }

  function buildPokeChoices(correctId) {
    const correct = state.pokeNamePool.find((p) => p.id === correctId);
    if (!correct) return [];
    const others = state.pokeNamePool.filter((p) => p.id !== correctId);
    const ranked = others
      .map((p) => ({ ...p, score: pokeNameSimilarity(correct.nameKo, p.nameKo, correctId, p.id) }))
      .sort((a, b) => b.score - a.score);
    const wrong = [];
    const used = new Set([correctId]);
    for (const p of ranked) {
      if (wrong.length >= 3) break;
      if (!used.has(p.id)) {
        wrong.push(p);
        used.add(p.id);
      }
    }
    let guard = 0;
    while (wrong.length < 3 && guard++ < 50) {
      const pick = others[Math.floor(Math.random() * others.length)];
      if (pick && !used.has(pick.id)) {
        wrong.push(pick);
        used.add(pick.id);
      }
    }
    return shuffleArray([correct, ...wrong.slice(0, 3)]);
  }

  function addPokeRankEntry(entry) {
    state.pokeRank.push({
      name: String(entry?.name || "").trim(),
      score: Number(entry?.score) || 0,
      rounds: Number(entry?.rounds) || 0,
      reason: String(entry?.reason || ""),
      at: String(entry?.at || new Date().toISOString()),
    });
    if (state.pokeRank.length > 100) state.pokeRank = state.pokeRank.slice(-100);
    if (familyRef) {
      save();
      return;
    }
    try {
      localStorage.setItem(POKE_RANK_KEY, JSON.stringify(state.pokeRank));
    } catch (_) {
      /* ignore */
    }
  }

  function getPokeRankBoard(limit = POKE_RANK_TOP) {
    const sorted = [...state.pokeRank].sort(
      (a, b) => b.score - a.score || String(b.at || "").localeCompare(String(a.at || ""))
    );
    return limit ? sorted.slice(0, limit) : sorted;
  }

  function pokeRankMedal(rank) {
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return rank;
  }

  function schedulePokeAdvance() {
    clearPokeAdvance();
    const g = state.pokeGame;
    const s = state.pokeSession;
    const isCorrect = g.pickedId === g.id;
    let delay = POKE_WRONG_DELAY_MS;
    if (s.wrongCount >= POKE_MAX_WRONG) delay = POKE_FAIL_DELAY_MS;
    else if (isCorrect) delay = POKE_CORRECT_DELAY_MS;
    pokeAdvanceTimeout = setTimeout(() => {
      pokeAdvanceTimeout = null;
      if (s.phase !== "playing" || !g.answered) return;
      if (s.wrongCount >= POKE_MAX_WRONG) endPokeSession();
      else loadRandomPokemon();
    }, delay);
  }

  function clearPokeAdvance() {
    if (pokeAdvanceTimeout != null) {
      clearTimeout(pokeAdvanceTimeout);
      pokeAdvanceTimeout = null;
    }
  }

  function clearPokeTimer() {
    if (pokeTimerId != null) {
      clearInterval(pokeTimerId);
      pokeTimerId = null;
    }
  }

  function refreshPokeCountdownDom() {
    const el = document.getElementById("poke-countdown");
    if (!el) return;
    const g = state.pokeGame;
    el.textContent = `${g.countdown}초`;
    el.classList.toggle("is-warn", g.countdown <= 2);
  }

  function startPokeTimer() {
    clearPokeTimer();
    const g = state.pokeGame;
    g.countdown = POKE_QUESTION_SECONDS;
    refreshPokeCountdownDom();
    pokeTimerId = setInterval(() => {
      const s = state.pokeSession;
      if (s.phase !== "playing" || g.answered || !g.id) {
        clearPokeTimer();
        return;
      }
      g.countdown -= 1;
      if (g.countdown <= 0) {
        clearPokeTimer();
        handlePokeTimeout();
        return;
      }
      refreshPokeCountdownDom();
    }, 1000);
  }

  function resolvePokeAnswer(isCorrect, pickedId) {
    const g = state.pokeGame;
    const s = state.pokeSession;
    if (s.phase !== "playing" || !g.id || g.answered) return;
    clearPokeTimer();
    g.answered = true;
    g.pickedId = pickedId;
    g.revealed = true;
    s.round += 1;
    g.feedback = isCorrect ? "correct" : "wrong";
    if (isCorrect) {
      s.score += 1;
      g.message = "정답! 🎉";
      toast(`정답! ${g.nameKo}`);
    } else {
      s.wrongCount += 1;
      if (pickedId == null) {
        g.message = "시간 초과! ⏰";
      } else {
        const picked = g.choices.find((c) => c.id === pickedId);
        g.message = picked ? `"${picked.nameKo}"(은)는 틀렸어요!` : "틀렸어요!";
      }
      if (s.wrongCount >= POKE_MAX_WRONG) {
        g.message = `${POKE_MAX_WRONG}회 틀려서 탈락! 💥`;
        s.endReason = "fail";
      }
      toast(`정답은 ${g.nameKo}입니다.`);
    }
    renderPokeGame();
    schedulePokeAdvance();
  }

  function handlePokeTimeout() {
    resolvePokeAnswer(false, null);
  }

  function pokeRankListHtml() {
    const board = getPokeRankBoard();
    if (!board.length) return `<li class="poke-rank-empty">아직 기록이 없어요.</li>`;
    return board
      .map(
        (e, i) => `<li class="poke-rank-row rank-${i + 1}">
          <span class="poke-rank-num">${pokeRankMedal(i + 1)}</span>
          <span class="poke-rank-name">${esc(e.name)}</span>
          <span class="poke-rank-score">${e.score}점</span>
        </li>`
      )
      .join("");
  }

  function openPokeRankModal() {
    openModal(`
      <div class="poke-rank-modal">
        <h3 class="poke-setup-title">Rank TOP ${POKE_RANK_TOP}</h3>
        <p class="hint">가족 공유 순위입니다. 점수가 높은 순으로 보여요.</p>
        <ol class="poke-rank-list">${pokeRankListHtml()}</ol>
        <div class="modal-actions">
          <button type="button" id="cancel-modal">닫기</button>
        </div>
      </div>
    `);
  }

  function renderPokeSetupHtml() {
    const s = state.pokeSession;
    const opts = POKE_PLAYER_OPTIONS.map(
      (p) =>
        `<label class="check-row poke-player-opt">
          <input type="radio" name="playerId" value="${p.id}" ${p.id === s.playerId ? "checked" : ""} />
          <span>${esc(p.name)}</span>
        </label>`
    ).join("");
    return `
      <div class="poke-card poke-setup">
        <h3 class="poke-setup-title">참가자 선택</h3>
        <form id="poke-setup-form" class="stack" action="#" method="post">
          <div class="poke-player-list">${opts}</div>
          <label id="poke-other-wrap" class="poke-other-wrap" style="${s.playerId === "other" ? "" : "display:none"}">
            이름
            <input name="customName" maxlength="12" placeholder="이름을 입력하세요" />
          </label>
          <p class="hint">문제당 <strong>${POKE_QUESTION_SECONDS}초</strong> · <strong>${POKE_MAX_WRONG}회</strong> 틀리면 탈락</p>
          <div class="poke-actions">
            <button class="primary" type="button" id="poke-start-session">게임 시작</button>
            <button type="button" class="poke-open-rank-btn">순위 보기</button>
          </div>
        </form>
      </div>`;
  }

  function renderPokeRankHtml() {
    const s = state.pokeSession;
    return `
      <div class="poke-card poke-rank-card">
        <h3 class="poke-setup-title">게임 종료</h3>
        <p class="poke-last-result"><strong>${esc(s.playerName)}</strong> · ${s.score}점 · ${s.round}문제</p>
        <p class="hint">${POKE_MAX_WRONG}회 틀려서 게임이 끝났어요.</p>
        <h4 class="poke-rank-heading">Rank TOP ${POKE_RANK_TOP}</h4>
        <ol class="poke-rank-list">${pokeRankListHtml()}</ol>
        <div class="poke-actions">
          <button class="primary" type="button" id="poke-play-again">다시 하기</button>
          <button type="button" class="poke-open-rank-btn">순위 보기</button>
        </div>
      </div>`;
  }

  function renderPokeGame() {
    const root = $("#poke-game-root");
    if (!root) return;
    const s = state.pokeSession;
    if (s.phase === "setup") {
      root.innerHTML = renderPokeSetupHtml();
      return;
    }
    if (s.phase === "ended") {
      root.innerHTML = renderPokeRankHtml();
      return;
    }
    const g = state.pokeGame;
    if (g.loading) {
      root.innerHTML = `<div class="poke-card"><p class="hint">포켓몬을 불러오는 중… (${esc(s.playerName)} · ${s.round + 1}번째 문제)</p></div>`;
      return;
    }
    if (g.error) {
      root.innerHTML = `<div class="poke-card">
        <p class="hint">${esc(g.error)}</p>
        <button class="primary" type="button" id="poke-retry-btn">다시 불러오기</button>
        <button type="button" id="poke-back-setup">참가자 선택</button>
      </div>`;
      return;
    }
    if (!g.id) {
      root.innerHTML = `<div class="poke-card"><p class="hint">문제를 준비하는 중…</p></div>`;
      return;
    }
    const revealedClass = g.revealed ? "is-revealed" : "is-silhouette";
    const choiceHtml = (g.choices || [])
      .map((c) => {
        let cls = "poke-choice";
        if (g.answered) {
          if (c.id === g.id) cls += " is-correct";
          else if (c.id === g.pickedId) cls += " is-wrong";
          else cls += " is-dim";
        }
        return `<button type="button" class="${cls}" data-poke-choice="${c.id}" ${g.answered ? "disabled" : ""}>${esc(c.nameKo)}</button>`;
      })
      .join("");
    const sessionEnded = g.answered && s.wrongCount >= POKE_MAX_WRONG;
    const cardFx = [
      g.feedback ? `poke-card--${g.feedback}` : "",
      !g.answered && g.countdown <= 2 ? "poke-card--urgent" : "",
      sessionEnded ? "poke-card--fail" : "",
    ]
      .filter(Boolean)
      .join(" ");
    const countdownHtml = g.answered
      ? ""
      : `<span class="poke-countdown${g.countdown <= 2 ? " is-warn" : ""}" id="poke-countdown">${g.countdown || POKE_QUESTION_SECONDS}초</span>`;
    const scoreFx = g.feedback === "correct" ? " poke-score-pop" : "";
    root.innerHTML = `
      <div class="poke-scorebar">
        <span>참가 <strong>${esc(s.playerName)}</strong></span>
        <span>문제 <strong>${s.round + 1}</strong>번째</span>
        <span class="poke-score${scoreFx}">점수 <strong>${s.score}</strong></span>
        ${countdownHtml}
        <span class="poke-wrong-streak${s.wrongCount ? " is-warn" : ""}">오답 ${s.wrongCount}/${POKE_MAX_WRONG}</span>
      </div>
      <div class="poke-card ${cardFx}">
        <div class="poke-stage">
          <img class="poke-sprite ${revealedClass}${g.feedback === "correct" ? " is-pop" : ""}${g.feedback === "wrong" ? " is-shake" : ""}" src="${esc(g.image)}" alt="포켓몬" draggable="false" />
        </div>
        <p class="poke-prompt">${g.revealed ? `정답은 <strong>${esc(g.nameKo)}</strong>!` : "보기에서 이름을 골라 주세요"}</p>
        ${g.message ? `<p class="poke-message poke-message--${g.feedback || "idle"}">${esc(g.message)}</p>` : ""}
        <div class="poke-choices">${choiceHtml}</div>
      </div>`;
  }

  function resetPokeToSetup() {
    clearPokeTimer();
    clearPokeAdvance();
    state.pokeSession = {
      phase: "setup",
      playerId: state.pokeSession.playerId || "jaesang",
      playerName: "",
      round: 0,
      score: 0,
      wrongCount: 0,
      endReason: "",
    };
    state.pokeGame.id = null;
    state.pokeGame.error = "";
    renderPokeGame();
  }

  function startPokeSession(playerId, customName) {
    const opt = POKE_PLAYER_OPTIONS.find((p) => p.id === playerId) || POKE_PLAYER_OPTIONS[0];
    let playerName = opt.name;
    if (playerId === "other") {
      playerName = String(customName || "").trim();
      if (!playerName) return toast("기타를 선택했으면 이름을 입력해 주세요.");
    }
    state.pokeSession = {
      phase: "playing",
      playerId,
      playerName,
      round: 0,
      score: 0,
      wrongCount: 0,
      endReason: "",
    };
    loadRandomPokemon();
  }

  function endPokeSession() {
    const s = state.pokeSession;
    if (s.phase !== "playing") return;
    clearPokeTimer();
    clearPokeAdvance();
    if (!s.endReason) s.endReason = "fail";
    addPokeRankEntry({
      name: s.playerName,
      score: s.score,
      rounds: s.round,
      reason: s.endReason,
      at: new Date().toISOString(),
    });
    s.phase = "ended";
    state.pokeGame.id = null;
    renderPokeGame();
  }

  async function loadRandomPokemon() {
    const g = state.pokeGame;
    const s = state.pokeSession;
    if (s.phase !== "playing") return;
    clearPokeTimer();
    clearPokeAdvance();
    g.loading = true;
    g.error = "";
    g.message = "";
    g.feedback = "";
    g.revealed = false;
    g.answered = false;
    g.pickedId = null;
    g.choices = [];
    renderPokeGame();
    const id = Math.floor(Math.random() * POKE_MAX_ID) + 1;
    try {
      await ensurePokeNamePool();
      const [pokeRes, speciesRes] = await Promise.all([
        fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
        fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
      ]);
      if (!pokeRes.ok || !speciesRes.ok) throw new Error("포켓몬 정보를 가져오지 못했어요.");
      const poke = await pokeRes.json();
      const species = await speciesRes.json();
      const ko = (species.names || []).find((n) => n.language?.name === "ko");
      const en = (species.names || []).find((n) => n.language?.name === "en");
      const image =
        poke.sprites?.other?.["official-artwork"]?.front_default ||
        poke.sprites?.front_default ||
        "";
      if (!image) throw new Error("포켓몬 그림이 없어요. 다시 시도해 주세요.");
      g.id = poke.id;
      g.image = image;
      g.nameKo = ko?.name || poke.name;
      g.nameEn = en?.name || poke.name;
      if (!state.pokeNamePool.some((p) => p.id === g.id)) {
        state.pokeNamePool.push({ id: g.id, nameKo: g.nameKo });
      }
      g.choices = buildPokeChoices(g.id);
      if (g.choices.length < 4) throw new Error("보기를 만들지 못했어요. 다시 시도해 주세요.");
      g.loading = false;
      renderPokeGame();
      startPokeTimer();
    } catch (err) {
      g.loading = false;
      g.id = null;
      g.error = err.message || String(err);
      renderPokeGame();
    }
  }

  function pickPokeChoice(choiceId) {
    const g = state.pokeGame;
    const s = state.pokeSession;
    if (s.phase !== "playing" || !g.id || g.answered) return;
    resolvePokeAnswer(Number(choiceId) === g.id, Number(choiceId));
  }

  function render() {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === state.tab));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${state.tab}`));
    renderTypeFilters();
    renderMemberFilters();
    if (state.tab === "calendar") renderCalendar();
    if (state.tab === "todos") renderTodos();
    if (state.tab === "stamps") renderStampBoard();
    if (state.tab === "talk") renderTalk();
    if (state.tab === "game") {
      renderPokeGame();
      ensurePokeNamePool();
    }
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
      <h3>용돈 찍기</h3>
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
    $("#add-todo-list-btn").addEventListener("click", () => eventForm(null, "todo"));
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
    $("#todo-today-btn").addEventListener("click", () => {
      state.cursor = startOfDay(new Date());
      state.selected = state.cursor;
      state.todoFutureExtra = 0;
      render();
    });
    document.body.addEventListener("click", (e) => {
      if (e.target.id === "todo-show-more") {
        state.todoFutureExtra = (state.todoFutureExtra || 0) + TODO_MORE_STEP;
        render();
      }
    });

    $("#type-filters").addEventListener("change", (e) => {
      const id = e.target.dataset.type;
      if (!id) return;
      state.typeFilter[id] = e.target.checked;
      render();
    });

    document.body.addEventListener("change", (e) => {
      const id = e.target.dataset.member;
      if (id) {
        state.memberFilter[id] = e.target.checked;
        render();
        return;
      }
      if (e.target.closest("#meal-form")?.querySelector('[name="date"]') === e.target) {
        fillMealForm(parseYmd(e.target.value));
      }
    });

    document.body.addEventListener("click", async (e) => {
      const cell = e.target.closest("[data-date]");
      if (cell && !e.target.closest("button") && !e.target.closest("input") && !e.target.closest(".todo-day")) {
        state.selected = parseYmd(cell.dataset.date);
        if (state.calView === "day") state.cursor = state.selected;
        const openModalDetail = state.tab === "calendar" && state.calView !== "day";
        render();
        if (openModalDetail) openDayDetailModal(state.selected);
        return;
      }
      if (e.target.id === "panel-add-event") eventForm(null, "schedule");
      if (e.target.id === "panel-add-todo") eventForm(null, "todo");
      if (e.target.id === "panel-add-stamp") stampForm();
      if (e.target.id === "goto-meal-settings") {
        closeModal();
        state.tab = "settings";
        render();
        fillMealForm(state.selected);
        document.getElementById("meal-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (e.target.id === "save-meals") {
        const form = document.getElementById("meal-form");
        if (form) saveMealsFromForm(form);
      }
      if (e.target.id === "refresh-school-lunch") {
        await ensureSchoolLunches(state.selected || state.cursor, true);
        fillMealForm(state.selected || new Date());
        if (state.schoolLunchMeta.error) toast(state.schoolLunchMeta.error);
        else toast("신서초 급식을 불러왔어요.");
        if (state.tab === "settings") renderSettings();
      }
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
      if (e.target.id === "save-weather") {
        const regionSel = $("#weather-region");
        const keyInput = $("#weather-service-key");
        if (regionSel) {
          try {
            localStorage.setItem(WEATHER_REGION_KEY, regionSel.value);
          } catch (_) {
            /* ignore */
          }
        }
        if (keyInput) {
          try {
            localStorage.setItem(WEATHER_KEY_STORAGE, keyInput.value.trim());
          } catch (_) {
            /* ignore */
          }
        }
        toast("날씨 설정을 저장했어요.");
        ensureWeather(true);
      }
      if (e.target.id === "refresh-weather") {
        ensureWeather(true);
        toast("날씨를 다시 불러오는 중이에요.");
      }
      if (e.target.id === "poke-start-session") {
        const form = document.getElementById("poke-setup-form");
        if (!form) return;
        const fd = new FormData(form);
        startPokeSession(fd.get("playerId") || "jaesang", fd.get("customName"));
      }
      if (e.target.id === "poke-retry-btn") loadRandomPokemon();
      if (e.target.id === "poke-back-setup" || e.target.id === "poke-play-again") resetPokeToSetup();
      if (e.target.id === "poke-open-rank" || e.target.closest(".poke-open-rank-btn")) openPokeRankModal();
      const pokeChoice = e.target.closest("[data-poke-choice]");
      if (pokeChoice) pickPokeChoice(pokeChoice.dataset.pokeChoice);
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
        state.todoRate = readTodoRateFromForm(form);
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
      if (document.querySelector(".day-modal")) openDayDetailModal(state.selected);
    });

    $("#modal-backdrop").addEventListener("click", (e) => {
      if (e.target === $("#modal-backdrop")) {
        if (state.pinResolve) state.pinResolve(false);
        closeModal();
      }
    });

    document.body.addEventListener("change", (e) => {
      if (e.target.name === "playerId" && e.target.closest("#poke-setup-form")) {
        state.pokeSession.playerId = e.target.value;
        const wrap = $("#poke-other-wrap");
        if (wrap) wrap.style.display = e.target.value === "other" ? "" : "none";
      }
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
    if (!isFirebaseConfigured()) {
      state.pokeRank = readLocalPokeRank();
    } else if (migrateLocalPokeRankIfNeeded()) {
      save();
    }
    bind();
    ensureWeather();
    ensureSchoolLunches(state.cursor);
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
