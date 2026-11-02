// 가족 허브 일정·할일 ↔ 구글 캘린더 「가족」
(() => {
  const API = "https://www.googleapis.com/calendar/v3";
  const TZ = "Asia/Seoul";
  const SCOPE = [
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
    "https://www.googleapis.com/auth/calendar.events",
  ].join(" ");
  const TOKEN_KEY = "family-hub-gcal-token";
  const LINK_KEY = "family-hub-gcal-linked";
  const CLIENT_KEY = "family-hub-gcal-client-id";
  const CAL_KEY = "family-hub-gcal-calendar-id";
  const PICK_KEY = "family-hub-gcal-calendar-picked";
  const AUTO_KEY = "family-hub-gcal-auto";
  const IMPORT_KEY = "family-hub-gcal-import";
  const LAST_KEY = "family-hub-gcal-last";
  const CHOICES_KEY = "family-hub-gcal-choices";
  const WEEKDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  const COLORS = { jaesang: "9", sinjeong: "4", sua: "10", sumin: "5", chilbok: "3", family: "6" };

  let calendarChoices = [];
  let statusText = "";
  let statusError = false;
  let busy = false;
  let syncPromise = null;
  let autoTimer = null;
  let lastSignature = "";

  function host() {
    return window.FamilyHubGcalHost || null;
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (_) {
      /* ignore */
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      /* ignore */
    }
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function addDaysYmd(ymdStr, n) {
    const [y, m, d] = String(ymdStr).split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n));
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${dt.getUTCFullYear()}-${mm}-${dd}`;
  }

  function weekdayOf(ymdStr) {
    const [y, m, d] = String(ymdStr).split("-").map(Number);
    return new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  }

  function googleEventId(hubId) {
    const raw = String(hubId || "");
    let id = raw.toLowerCase().replace(/[^a-v0-9]/g, "");
    if (id.length < 8) {
      let h = 2166136261;
      for (let i = 0; i < raw.length; i += 1) {
        h ^= raw.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      id = (id + (h >>> 0).toString(16)).replace(/[^a-v0-9]/g, "");
    }
    if (id.length < 5) id = `${id}familyhubev`.replace(/[^a-v0-9]/g, "");
    return id.slice(0, 1024);
  }

  function overrideGoogleId(hubId, ymd) {
    return `${googleEventId(hubId)}d${String(ymd).replace(/\D/g, "")}`.slice(0, 1024);
  }

  function timeCompact(t) {
    const [h, m] = String(t || "00:00").split(":");
    return `${String(h || "0").padStart(2, "0")}${String(m || "0").padStart(2, "0")}00`;
  }

  function buildRrule(ev) {
    if (!ev.repeat || ev.repeat === "none") return "";
    const freq = { daily: "DAILY", weekly: "WEEKLY", monthly: "MONTHLY" }[ev.repeat];
    if (!freq) return "";
    const parts = [`FREQ=${freq}`];
    if (ev.repeat === "weekly") {
      const days = ev.weekdays && ev.weekdays.length ? ev.weekdays : [weekdayOf(ev.date)];
      const byday = days.map((n) => WEEKDAY[n]).filter(Boolean);
      if (byday.length) parts.push(`BYDAY=${byday.join(",")}`);
    }
    if (ev.repeat === "monthly") parts.push(`BYMONTHDAY=${Number(String(ev.date).slice(8, 10))}`);
    if (ev.repeatUntil && /^\d{4}-\d{2}-\d{2}$/.test(ev.repeatUntil)) {
      if (ev.allDay) parts.push(`UNTIL=${ev.repeatUntil.replace(/-/g, "")}`);
      else parts.push(`UNTIL=${ev.repeatUntil.replace(/-/g, "")}T145959Z`);
    }
    return `RRULE:${parts.join(";")}`;
  }

  function buildExdates(ev) {
    const dates = new Set([...(ev.excludeDates || []), ...Object.keys(ev.overrides || {})]);
    const list = [...dates].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    if (!list.length) return [];
    if (ev.allDay) return [`EXDATE;VALUE=DATE:${list.map((d) => d.replace(/-/g, "")).join(",")}`];
    const t = timeCompact(ev.startTime || "09:00");
    return [`EXDATE;TZID=Asia/Seoul:${list.map((d) => `${d.replace(/-/g, "")}T${t}`).join(",")}`];
  }

  function eventTimes(ev, dateStr) {
    const date = dateStr || ev.date;
    const repeating = ev.repeat && ev.repeat !== "none";
    if (ev.allDay) {
      let end = date;
      if (!repeating && ev.endDate && ev.endDate > date) end = ev.endDate;
      return { start: { date }, end: { date: addDaysYmd(end, 1) } };
    }
    const startTime = ev.startTime || "09:00";
    let endTime = ev.endTime || "";
    let endDate = date;
    if (!repeating && ev.endDate && ev.endDate > date) endDate = ev.endDate;
    if (!endTime || (endDate === date && endTime <= startTime)) {
      const [h, m] = startTime.split(":").map(Number);
      const total = (h || 0) * 60 + (m || 0) + 60;
      if (total >= 24 * 60) {
        endDate = addDaysYmd(date, 1);
        const mins = total - 1440;
        endTime = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
      } else {
        endTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      }
    }
    return {
      start: { dateTime: `${date}T${startTime}:00`, timeZone: TZ },
      end: { dateTime: `${endDate}T${endTime}:00`, timeZone: TZ },
    };
  }

  function doneOn(ev, date) {
    return Boolean(ev.doneDates && ev.doneDates[date]);
  }

  function buildGoogleEvent(ev, ctx) {
    const member = (ctx && ctx.memberName) || "";
    const kindLabel = ev.kind === "todo" ? "할일" : "일정";
    const single = !ev.repeat || ev.repeat === "none";
    const done = ev.kind === "todo" && single && doneOn(ev, ev.date);
    const title = ev.title || "(제목 없음)";
    const summary = ev.kind === "todo" ? `${done ? "✓ " : ""}할일 · ${title}` : title;
    const lines = [`가족허브 ${kindLabel}`];
    if (member) lines.push(`담당: ${member}`);
    if (ev.note) lines.push("", ev.note);
    if (ev.kind === "todo" && ev.doneDates) {
      const doneDays = Object.keys(ev.doneDates)
        .filter((k) => ev.doneDates[k])
        .sort();
      if (doneDays.length) lines.push("", `완료: ${doneDays.join(", ")}`);
    }
    const recurrence = [];
    const rrule = buildRrule(ev);
    if (rrule) recurrence.push(rrule);
    recurrence.push(...buildExdates(ev));
    const body = {
      summary,
      description: lines.join("\n"),
      ...eventTimes(ev),
      status: "confirmed",
      extendedProperties: {
        private: {
          familyHub: "1",
          familyHubId: ev.id,
          familyHubKind: ev.kind === "todo" ? "todo" : "schedule",
          familyHubMember: ev.memberId || "",
        },
      },
    };
    if (recurrence.length) body.recurrence = recurrence;
    if (COLORS[ev.memberId]) body.colorId = COLORS[ev.memberId];
    return body;
  }

  function buildOverrideEvent(ev, date, override, ctx) {
    const merged = {
      ...ev,
      ...(override || {}),
      id: ev.id,
      date,
      repeat: "none",
      endDate: "",
      excludeDates: [],
      overrides: {},
      repeatUntil: "",
      doneDates: ev.doneDates || {},
    };
    const body = buildGoogleEvent(merged, ctx);
    body.extendedProperties.private.familyHubId = `${ev.id}@${date}`;
    body.extendedProperties.private.familyHubParent = ev.id;
    body.extendedProperties.private.familyHubOccurrence = date;
    return body;
  }

  function seoulParts(dateTime) {
    const d = new Date(dateTime);
    if (Number.isNaN(d.getTime())) return null;
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const bag = {};
    fmt.formatToParts(d).forEach((p) => {
      bag[p.type] = p.value;
    });
    let hour = bag.hour;
    if (hour === "24") hour = "00";
    return { date: `${bag.year}-${bag.month}-${bag.day}`, time: `${hour}:${bag.minute}` };
  }

  function wallTime(dateTime, timeZone) {
    const raw = String(dateTime || "");
    const naive = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
    const hasOffset = /[zZ]$|[+-]\d{2}:\d{2}$/.test(raw);
    if (naive && !hasOffset && (!timeZone || timeZone === TZ)) {
      return { date: naive[1], time: `${naive[2]}:${naive[3]}` };
    }
    return seoulParts(raw);
  }

  function parseExdates(recurrence) {
    const dates = [];
    (recurrence || []).forEach((line) => {
      if (!String(line).startsWith("EXDATE")) return;
      const value = String(line).split(":").slice(1).join(":");
      value.split(",").forEach((part) => {
        const digits = part.replace(/\D/g, "");
        if (digits.length >= 8) dates.push(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`);
      });
    });
    return dates;
  }

  function parseRrule(recurrence) {
    const line = (recurrence || []).find((r) => String(r).startsWith("RRULE:"));
    if (!line) return { repeat: "none", weekdays: [], repeatUntil: "", unsupported: false };
    const map = {};
    String(line)
      .slice(6)
      .split(";")
      .forEach((part) => {
        const idx = part.indexOf("=");
        if (idx > 0) map[part.slice(0, idx)] = part.slice(idx + 1);
      });
    const intervalOk = !map.INTERVAL || map.INTERVAL === "1";
    let repeat = "none";
    if (intervalOk && map.FREQ === "DAILY") repeat = "daily";
    else if (intervalOk && map.FREQ === "WEEKLY") repeat = "weekly";
    else if (intervalOk && map.FREQ === "MONTHLY") repeat = "monthly";
    const weekdays =
      repeat === "weekly" && map.BYDAY
        ? map.BYDAY.split(",")
            .map((d) => WEEKDAY.indexOf(d))
            .filter((n) => n >= 0)
        : [];
    let repeatUntil = "";
    if (map.UNTIL && map.UNTIL.length >= 8) {
      repeatUntil = `${map.UNTIL.slice(0, 4)}-${map.UNTIL.slice(4, 6)}-${map.UNTIL.slice(6, 8)}`;
    }
    return { repeat, weekdays, repeatUntil, unsupported: Boolean(map.FREQ) && repeat === "none" };
  }

  function parseDoneLine(description) {
    const match = String(description || "").match(/완료:\s*([0-9,\-\s]+)/);
    if (!match) return null;
    const days = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    return days.length ? days : null;
  }

  function parseGoogleEvent(g) {
    if (!g || !g.start) return null;
    const allDay = Boolean(g.start.date && !g.start.dateTime);
    let date = "";
    let endDate = "";
    let startTime = "09:00";
    let endTime = "10:00";
    if (allDay) {
      date = g.start.date;
      if (g.end && g.end.date) {
        const inclusive = addDaysYmd(g.end.date, -1);
        if (inclusive > date) endDate = inclusive;
      }
    } else if (g.start.dateTime) {
      const start = wallTime(g.start.dateTime, g.start.timeZone);
      if (!start) return null;
      date = start.date;
      startTime = start.time;
      if (g.end && g.end.dateTime) {
        const end = wallTime(g.end.dateTime, g.end.timeZone);
        if (end) {
          endTime = end.time;
          if (end.date > start.date) endDate = end.date;
        }
      }
    } else return null;

    const recurrence = g.recurrence || [];
    const rule = parseRrule(recurrence);
    if (rule.repeat !== "none") endDate = "";
    const priv = (g.extendedProperties && g.extendedProperties.private) || {};
    let title = String(g.summary || "");
    let done = false;
    title = title.replace(/^✓\s*/, () => {
      done = true;
      return "";
    }).trim();
    let kind = priv.familyHubKind === "todo" || priv.familyHubKind === "schedule" ? priv.familyHubKind : "schedule";
    if (/^할일\s*·\s*/.test(title)) {
      kind = "todo";
      title = title.replace(/^할일\s*·\s*/, "");
    }
    if (!title) title = "(제목 없음)";
    let note = String(g.description || "");
    const doneDatesList = parseDoneLine(note);
    if (note.startsWith("가족허브 ")) note = "";
    if (rule.unsupported) {
      const raw = recurrence.find((r) => String(r).startsWith("RRULE:")) || "";
      note = [note, raw ? `구글 반복 규칙: ${raw}` : ""].filter(Boolean).join("\n");
    }
    return {
      title,
      date,
      endDate,
      allDay,
      startTime,
      endTime,
      repeat: rule.repeat,
      weekdays: rule.weekdays,
      repeatUntil: rule.repeatUntil,
      excludeDates: parseExdates(recurrence),
      note,
      kind,
      done,
      doneDatesList,
      memberId: priv.familyHubMember || "",
      familyHubId: priv.familyHubId || "",
      googleId: g.id || "",
      updated: g.updated || "",
      status: g.status || "confirmed",
      recurringEventId: g.recurringEventId || "",
    };
  }

  function hubWins(ev, g) {
    if (!g) return true;
    if (!ev.gcalSyncedAt) return true;
    if (ev.updatedAt && ev.updatedAt > ev.gcalSyncedAt) return true;
    if (g.updated && g.updated > ev.gcalSyncedAt) return false;
    return true;
  }

  function applyParsed(ev, parsed) {
    ev.title = parsed.title;
    ev.date = parsed.date;
    ev.endDate = parsed.endDate || "";
    ev.allDay = parsed.allDay;
    ev.startTime = parsed.startTime;
    ev.endTime = parsed.endTime;
    ev.repeat = parsed.repeat || "none";
    ev.weekdays = parsed.weekdays || [];
    ev.repeatUntil = parsed.repeatUntil || "";
    const overrideKeys = new Set(Object.keys(ev.overrides || {}));
    ev.excludeDates = (parsed.excludeDates || []).filter((d) => !overrideKeys.has(d));
    if (parsed.memberId) ev.memberId = parsed.memberId;
    if (parsed.kind) ev.kind = parsed.kind;
    if (parsed.note) ev.note = parsed.note;
    if (ev.kind === "todo") {
      ev.doneDates = {};
      (parsed.doneDatesList || []).forEach((d) => {
        ev.doneDates[d] = true;
      });
      if ((!ev.repeat || ev.repeat === "none") && parsed.done && ev.date) ev.doneDates[ev.date] = true;
    }
  }

  function syncSignature(events) {
    return JSON.stringify(
      (events || [])
        .filter((ev) => ev && (ev.kind === "schedule" || ev.kind === "todo"))
        .map((ev) => ({
          id: ev.id,
          kind: ev.kind,
          title: ev.title,
          memberId: ev.memberId,
          date: ev.date,
          endDate: ev.endDate || "",
          allDay: Boolean(ev.allDay),
          startTime: ev.startTime || "",
          endTime: ev.endTime || "",
          repeat: ev.repeat || "none",
          weekdays: ev.weekdays || [],
          repeatUntil: ev.repeatUntil || "",
          note: ev.note || "",
          doneDates: ev.doneDates || {},
          excludeDates: ev.excludeDates || [],
          overrides: ev.overrides || {},
          gcalId: ev.gcalId || "",
          gcalImported: Boolean(ev.gcalImported),
        }))
    );
  }

  function buildDesired(events, memberName) {
    const desired = [];
    (events || []).forEach((ev) => {
      if (!ev || (ev.kind !== "schedule" && ev.kind !== "todo")) return;
      if (!ev.date || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) return;
      const ctx = { memberName: memberName(ev.memberId) };
      desired.push({
        localId: ev.id,
        familyHubId: ev.id,
        googleId: ev.gcalId || googleEventId(ev.id),
        imported: Boolean(ev.gcalImported),
        occurrence: false,
        body: buildGoogleEvent(ev, ctx),
      });
      Object.keys(ev.overrides || {}).forEach((date) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        desired.push({
          localId: ev.id,
          familyHubId: `${ev.id}@${date}`,
          googleId: overrideGoogleId(ev.id, date),
          imported: false,
          occurrence: true,
          body: buildOverrideEvent(ev, date, ev.overrides[date], ctx),
        });
      });
    });
    return desired;
  }

  function getClientId() {
    const saved = storageGet(CLIENT_KEY);
    if (saved && saved.trim()) return saved.trim();
    const cfg = window.FAMILY_HUB_GCAL;
    if (cfg && cfg.clientId && !String(cfg.clientId).startsWith("PASTE_")) return String(cfg.clientId).trim();
    return "";
  }

  function wantedName() {
    const cfg = window.FAMILY_HUB_GCAL;
    const name = cfg && cfg.calendarName ? String(cfg.calendarName).trim() : "";
    return name || "가족";
  }

  function validClientId(id) {
    return /^[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/.test(id);
  }

  function autoEnabled() {
    return storageGet(AUTO_KEY) !== "0";
  }

  function importEnabled() {
    return storageGet(IMPORT_KEY) !== "0";
  }

  function readToken() {
    const raw = storageGet(TOKEN_KEY);
    if (!raw) return "";
    try {
      const data = JSON.parse(raw);
      if (!data.access_token || !data.expires_at || data.expires_at < Date.now()) return "";
      return data.access_token;
    } catch (_) {
      return "";
    }
  }

  function wasLinked() {
    return storageGet(LINK_KEY) === "1";
  }

  function calendarLabel(cal) {
    return String((cal && (cal.summaryOverride || cal.summary)) || "").trim();
  }

  function isWritable(cal) {
    return cal && (cal.accessRole === "owner" || cal.accessRole === "writer");
  }

  function setStatus(text, isError) {
    statusText = text;
    statusError = Boolean(isError);
    if (typeof document === "undefined") return;
    const el = document.getElementById("gcal-status");
    if (!el) return;
    el.textContent = text;
    el.classList.toggle("is-error", statusError);
  }

  function setBusy(on) {
    busy = on;
    if (typeof document === "undefined") return;
    document.querySelectorAll("[data-gcal-busy]").forEach((btn) => {
      btn.disabled = on;
    });
  }

  function formatWhen(date) {
    try {
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone: TZ,
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(date);
    } catch (_) {
      return date.toISOString();
    }
  }

  function originHint() {
    let current = "";
    try {
      current = location.origin && location.origin !== "null" ? location.origin : "";
    } catch (_) {
      current = "";
    }
    if (!current || current.indexOf("yujsid.github.io") !== -1) return "https://yujsid.github.io";
    return `${current} 와 https://yujsid.github.io`;
  }

  function friendlyError(err) {
    const raw = err && err.message ? err.message : String(err || "동기화에 실패했습니다.");
    if (/popup_closed|access_denied/i.test(raw)) return "구글 로그인 창이 닫혔습니다.";
    if (/popup_failed_to_open/i.test(raw)) return "팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.";
    if (/invalid_client/i.test(raw)) return "클라이언트 ID가 올바르지 않습니다.";
    if (/accessNotConfigured|Calendar API has not been used|API has not been used/i.test(raw)) {
      return "Google Cloud에서 Google Calendar API를 사용 설정해 주세요.";
    }
    if (/redirect_uri|origin/i.test(raw)) return `이 사이트 주소가 OAuth 승인된 자바스크립트 원본에 없습니다. ${originHint()} 를 넣어 주세요.`;
    if (/만료|로그인/.test(raw)) return raw;
    return raw;
  }

  function loadGsi() {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
    if (typeof document === "undefined") return Promise.reject(new Error("구글 로그인을 불러올 수 없습니다."));
    return new Promise((resolve, reject) => {
      const done = () => {
        const start = Date.now();
        const wait = () => {
          if (window.google && window.google.accounts && window.google.accounts.oauth2) resolve();
          else if (Date.now() - start > 8000) reject(new Error("구글 로그인 준비에 실패했습니다."));
          else setTimeout(wait, 40);
        };
        wait();
      };
      const existing = document.querySelector("script[data-gsi]");
      if (existing) {
        if (window.google && window.google.accounts) done();
        else {
          existing.addEventListener("load", done, { once: true });
          existing.addEventListener("error", () => reject(new Error("구글 로그인 스크립트를 불러오지 못했습니다.")), { once: true });
        }
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.dataset.gsi = "1";
      script.onload = done;
      script.onerror = () => reject(new Error("구글 로그인 스크립트를 불러오지 못했습니다. 네트워크를 확인해 주세요."));
      document.head.appendChild(script);
    });
  }

  function requestToken(prompt) {
    const clientId = getClientId();
    if (!clientId) return Promise.reject(new Error("구글 OAuth 클라이언트 ID를 먼저 저장해 주세요."));
    return loadGsi().then(
      () =>
        new Promise((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            reject(new Error("구글 로그인 시간이 초과되었습니다."));
          }, 120000);
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: SCOPE,
            callback: (resp) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              if (!resp || resp.error || !resp.access_token) {
                reject(new Error((resp && (resp.error_description || resp.error)) || "구글 로그인에 실패했습니다."));
                return;
              }
              const expiresIn = Number(resp.expires_in || 3600);
              storageSet(
                TOKEN_KEY,
                JSON.stringify({
                  access_token: resp.access_token,
                  expires_at: Date.now() + Math.max(60, expiresIn - 90) * 1000,
                })
              );
              storageSet(LINK_KEY, "1");
              resolve(resp.access_token);
            },
            error_callback: (err) => {
              if (settled) return;
              settled = true;
              clearTimeout(timer);
              reject(new Error((err && (err.type || err.message)) || "구글 로그인이 취소되었습니다."));
            },
          });
          client.requestAccessToken({ prompt: prompt || "" });
        })
    );
  }

  function ensureToken(interactive) {
    const existing = readToken();
    if (existing) return Promise.resolve(existing);
    if (!interactive) return Promise.resolve("");
    return requestToken(wasLinked() ? "" : "consent");
  }

  async function gfetch(url, token, options) {
    const opts = options || {};
    const headers = { Authorization: `Bearer ${token}` };
    if (opts.body) headers["Content-Type"] = "application/json";
    const res = await fetch(url, { ...opts, headers });
    if (res.status === 401) {
      storageRemove(TOKEN_KEY);
      throw new Error("구글 로그인이 만료되었습니다. 다시 연결해 주세요.");
    }
    return res;
  }

  async function readError(res) {
    let detail = "";
    try {
      const data = await res.json();
      detail = (data.error && data.error.message) || data.error_description || "";
    } catch (_) {
      detail = "";
    }
    return detail ? `${res.status} ${detail}` : `요청 실패 (${res.status})`;
  }

  async function pool(items, limit, fn) {
    const queue = items.slice();
    if (!queue.length) return;
    let firstErr = null;
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length && !firstErr) {
        const item = queue.shift();
        try {
          await fn(item);
        } catch (err) {
          firstErr = err;
        }
      }
    });
    await Promise.all(workers);
    if (firstErr) throw firstErr;
  }

  async function fetchCalendars(token) {
    const items = [];
    let pageToken = "";
    do {
      const q = new URLSearchParams({ maxResults: "250" });
      if (pageToken) q.set("pageToken", pageToken);
      const res = await gfetch(`${API}/users/me/calendarList?${q}`, token);
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return items;
  }

  function rememberChoices(list) {
    calendarChoices = list.filter(isWritable).map((cal) => ({ id: cal.id, name: calendarLabel(cal) || cal.id }));
    try {
      sessionStorage.setItem(CHOICES_KEY, JSON.stringify(calendarChoices));
    } catch (_) {
      /* ignore */
    }
  }

  function loadChoices() {
    if (calendarChoices.length) return calendarChoices;
    try {
      const raw = sessionStorage.getItem(CHOICES_KEY);
      if (raw) calendarChoices = JSON.parse(raw) || [];
    } catch (_) {
      calendarChoices = [];
    }
    return calendarChoices;
  }

  function pickCalendar(list) {
    const writable = list.filter(isWritable);
    const saved = storageGet(CAL_KEY) || "";
    const picked = storageGet(PICK_KEY) === "1";
    if (picked && saved) {
      const chosen = writable.find((cal) => cal.id === saved);
      if (chosen) return chosen;
    }
    const name = wantedName();
    const exact = writable.filter((cal) => calendarLabel(cal) === name);
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return exact.find((cal) => cal.id === saved) || exact[0];
    const fuzzy = writable.filter((cal) => calendarLabel(cal).includes(name));
    if (fuzzy.length === 1) return fuzzy[0];
    if (saved) {
      const found = writable.find((cal) => cal.id === saved);
      if (found) return found;
    }
    return null;
  }

  async function listEvents(calendarId, token) {
    const items = [];
    let pageToken = "";
    do {
      const q = new URLSearchParams({
        maxResults: "250",
        singleEvents: "false",
        showDeleted: "false",
        timeMin: "1990-01-01T00:00:00+09:00",
        timeMax: "2036-01-01T00:00:00+09:00",
      });
      if (pageToken) q.set("pageToken", pageToken);
      const res = await gfetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events?${q}`, token);
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return items;
  }

  async function upsert(calendarId, token, eventId, body) {
    const url = `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const payload = { ...body, reminders: { useDefault: true } };
    let res = await gfetch(url, token, { method: "PUT", body: JSON.stringify(payload) });
    if (res.status === 404 || res.status === 410) {
      res = await gfetch(`${API}/calendars/${encodeURIComponent(calendarId)}/events`, token, {
        method: "POST",
        body: JSON.stringify({ ...payload, id: eventId }),
      });
    }
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  async function patchEvent(calendarId, token, eventId, body) {
    const url = `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const res = await gfetch(url, token, { method: "PATCH", body: JSON.stringify(body) });
    if (res.status === 404 || res.status === 410) throw new Error("404 notFound");
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  async function deleteEvent(calendarId, token, eventId) {
    const url = `${API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const res = await gfetch(url, token, { method: "DELETE" });
    if (res.status === 204 || res.status === 404 || res.status === 410) return;
    if (!res.ok) throw new Error(await readError(res));
  }

  function shouldImport(parsed, g) {
    if (!parsed || !parsed.date) return false;
    if (parsed.status === "cancelled") return false;
    if (parsed.recurringEventId) return false;
    const type = (g && g.eventType) || "default";
    return type === "default";
  }

  function normTitle(s) {
    return String(s || "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function findLinkable(events, parsed) {
    const same = events.filter((ev) => !ev.gcalId && ev.date === parsed.date && normTitle(ev.title) === normTitle(parsed.title));
    return same.find((ev) => ev.kind === parsed.kind) || same[0] || null;
  }

  function preferredMember() {
    const saved = storageGet("family-hub-preferred-member");
    return saved || "jaesang";
  }

  function eventFromParsed(parsed) {
    const h = host();
    const kind = parsed.kind === "todo" ? "todo" : "schedule";
    const memberId = parsed.memberId || (kind === "todo" ? preferredMember() : "family");
    const doneDates = {};
    if (kind === "todo") {
      (parsed.doneDatesList || []).forEach((d) => {
        doneDates[d] = true;
      });
      if (parsed.done && parsed.date) doneDates[parsed.date] = true;
    }
    return {
      id: h.newId(),
      kind,
      title: parsed.title,
      memberId,
      date: parsed.date,
      endDate: parsed.endDate || "",
      allDay: parsed.allDay,
      startTime: parsed.startTime || "09:00",
      endTime: parsed.endTime || "10:00",
      repeat: parsed.repeat || "none",
      weekdays: parsed.weekdays || [],
      repeatUntil: parsed.repeatUntil || "",
      note: parsed.note || "",
      doneDates,
      excludeDates: parsed.excludeDates || [],
      overrides: {},
      gcalId: parsed.googleId,
      gcalImported: true,
      gcalSyncedAt: parsed.updated || "",
    };
  }

  async function pushOne(calendarId, token, item) {
    const body = { ...item.body };
    const hasRule = Array.isArray(body.recurrence) && body.recurrence.length > 0;
    if (!hasRule) {
      if (item.imported && !item.occurrence) body.recurrence = null;
      else delete body.recurrence;
    }
    if (item.imported && !item.occurrence) {
      delete body.colorId;
      return patchEvent(calendarId, token, item.googleId, body);
    }
    return upsert(calendarId, token, item.googleId, body);
  }

  async function doSync(opts) {
    const h = host();
    if (!h) throw new Error("앱이 아직 준비되지 않았습니다.");
    const auto = Boolean(opts && opts.auto);
    setBusy(true);
    h.setSyncing(true);
    try {
      if (!h.ready()) throw new Error("가족 일정을 불러온 뒤에 동기화할 수 있어요.");
      if (!getClientId()) throw new Error("구글 OAuth 클라이언트 ID를 먼저 저장해 주세요.");
      const token = await ensureToken(!auto);
      if (!token) {
        setStatus("구글 로그인이 만료되었습니다. 「다시 연결하고 동기화」를 눌러 주세요.", true);
        return;
      }
      setStatus("가족 캘린더를 찾는 중…");
      const calendars = await fetchCalendars(token);
      rememberChoices(calendars);
      const cal = pickCalendar(calendars);
      if (!cal) {
        setStatus(`쓸 수 있는 「${wantedName()}」 캘린더가 없습니다. 아래에서 캘린더를 고르고 다시 동기화해 주세요.`, true);
        if (h.refresh) h.refresh();
        return;
      }
      storageSet(CAL_KEY, cal.id);
      const label = calendarLabel(cal) || wantedName();
      setStatus(`「${label}」 캘린더와 맞추는 중…`);
      const events = h.events();
      const listed = await listEvents(cal.id, token);
      const byHub = new Map();
      const foreign = [];
      listed.forEach((g) => {
        if (!g || g.status === "cancelled") return;
        const hid = g.extendedProperties && g.extendedProperties.private && g.extendedProperties.private.familyHubId;
        if (hid) byHub.set(hid, g);
        else foreign.push(g);
      });

      let changed = false;
      events.forEach((ev) => {
        if (!ev || (ev.kind !== "schedule" && ev.kind !== "todo")) return;
        const remote = byHub.get(ev.id);
        if (!remote || hubWins(ev, remote)) return;
        const parsed = parseGoogleEvent(remote);
        if (!parsed) return;
        applyParsed(ev, parsed);
        changed = true;
      });

      if (importEnabled()) {
        foreign.forEach((g) => {
          const parsed = parseGoogleEvent(g);
          if (!shouldImport(parsed, g)) return;
          if (events.some((ev) => ev.gcalId === g.id)) return;
          const link = findLinkable(events, parsed);
          if (link) {
            link.gcalId = g.id;
            link.gcalImported = true;
            if (!link.gcalSyncedAt) link.gcalSyncedAt = g.updated || "";
            changed = true;
            return;
          }
          events.push(eventFromParsed(parsed));
          changed = true;
        });
      }

      const desired = buildDesired(events, (id) => h.memberName(id));
      const wanted = new Set(desired.map((item) => item.familyHubId));
      const toDelete = [];
      byHub.forEach((g, hid) => {
        if (!wanted.has(hid)) toDelete.push(g);
      });

      let done = 0;
      const total = Math.max(1, desired.length + toDelete.length);
      const removedLocal = [];
      await pool(desired, 4, async (item) => {
        const ev = events.find((row) => row.id === item.localId);
        try {
          const result = await pushOne(cal.id, token, item);
          if (ev && !item.occurrence) {
            const synced = (result && result.updated) || new Date().toISOString();
            if (ev.gcalId !== item.googleId || ev.gcalSyncedAt !== synced) changed = true;
            ev.gcalId = item.googleId;
            ev.gcalSyncedAt = synced;
          }
        } catch (err) {
          if (item.imported && ev && /404|notFound/i.test(String(err && err.message))) {
            removedLocal.push(ev.id);
            changed = true;
          } else throw err;
        } finally {
          done += 1;
          setStatus(`동기화 중… ${done}/${total}`);
        }
      });

      if (removedLocal.length) {
        for (let i = events.length - 1; i >= 0; i -= 1) {
          if (removedLocal.indexOf(events[i].id) !== -1) events.splice(i, 1);
        }
      }

      await pool(toDelete, 4, async (g) => {
        await deleteEvent(cal.id, token, g.id);
        done += 1;
        setStatus(`동기화 중… ${Math.min(done, total)}/${total}`);
      });

      lastSignature = syncSignature(events);
      if (changed && h.saveQuiet) h.saveQuiet();
      const when = new Date();
      storageSet(LAST_KEY, when.toISOString());
      setStatus(`「${label}」 캘린더와 맞췄습니다. ${formatWhen(when)}`);
      if (!auto && h.toast) h.toast(`구글 「${label}」 캘린더와 동기화했습니다.`);
      if (h.refresh) h.refresh();
    } catch (err) {
      const msg = friendlyError(err);
      setStatus(msg, true);
      if (h.toast && (!auto || /만료|로그인|클라이언트/.test(msg))) h.toast(msg);
      if (h.refresh) h.refresh();
    } finally {
      setBusy(false);
      h.setSyncing(false);
    }
  }

  function sync(opts) {
    if (syncPromise) return syncPromise;
    syncPromise = doSync(opts).finally(() => {
      syncPromise = null;
    });
    return syncPromise;
  }

  function onLocalChange() {
    const h = host();
    if (!h || !h.ready() || !autoEnabled() || !readToken() || !getClientId()) return;
    const sig = syncSignature(h.events());
    if (sig && sig === lastSignature) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(() => {
      sync({ auto: true });
    }, 1500);
  }

  function disconnect() {
    storageRemove(TOKEN_KEY);
    storageRemove(LINK_KEY);
    clearTimeout(autoTimer);
    setStatus("구글 계정 연결을 해제했습니다. 가족 캘린더에 이미 올라간 일정은 그대로 남습니다.");
    const h = host();
    if (h && h.toast) h.toast("구글 계정 연결을 해제했습니다.");
    if (h && h.refresh) h.refresh();
  }

  function statusLine() {
    if (statusText) return statusText;
    const last = storageGet(LAST_KEY);
    if (last) {
      const date = new Date(last);
      if (!Number.isNaN(date.getTime())) return `마지막 동기화 ${formatWhen(date)}`;
    }
    if (getClientId()) return "아직 이 기기에서 동기화하지 않았습니다.";
    return "구글 클라우드 OAuth 클라이언트 ID를 저장하면 가족 캘린더와 연결할 수 있습니다.";
  }

  function mount(el) {
    if (!el) return;
    const clientId = getClientId();
    const linked = wasLinked();
    const live = Boolean(readToken());
    const choices = loadChoices();
    const savedCal = storageGet(CAL_KEY) || "";
    const choiceHtml = choices.length
      ? `<label>동기화할 캘린더
          <select id="gcal-calendar">
            ${choices
              .map((cal) => `<option value="${esc(cal.id)}" ${cal.id === savedCal ? "selected" : ""}>${esc(cal.name)}</option>`)
              .join("")}
          </select>
        </label>`
      : "";
    const actions = clientId
      ? `<div class="gcal-actions">
          <button class="primary" type="button" id="${live ? "gcal-sync" : "gcal-connect"}" data-gcal-busy ${busy ? "disabled" : ""}>${
          live ? "지금 동기화" : linked ? "다시 연결하고 동기화" : "가족 캘린더 연결"
        }</button>
          ${linked ? `<button type="button" id="gcal-disconnect" data-gcal-busy ${busy ? "disabled" : ""}>연결 해제</button>` : ""}
        </div>`
      : "";
    el.innerHTML = `<div class="stack">
      <p id="gcal-status" class="gcal-status${statusError ? " is-error" : ""}">${esc(statusLine())}</p>
      ${actions}
      ${
        clientId
          ? `<label class="check-row"><input type="checkbox" id="gcal-auto" ${autoEnabled() ? "checked" : ""} /><span>저장할 때마다 자동 동기화</span></label>
             <label class="check-row"><input type="checkbox" id="gcal-import" ${importEnabled() ? "checked" : ""} /><span>가족 캘린더의 다른 일정도 허브로 가져오기</span></label>
             ${choiceHtml}`
          : ""
      }
      <details class="gcal-advanced" ${clientId ? "" : "open"}>
        <summary>구글 연결 설정</summary>
        <div class="stack">
          <p class="hint">Google Cloud에서 OAuth 클라이언트 ID(웹 애플리케이션)를 만든 뒤 붙여 넣으세요. 승인된 자바스크립트 원본에는 ${esc(
            originHint()
          )} 를 넣고, Google Calendar API를 사용 설정하세요. 동의 화면이 테스트 모드이면 본인 구글 계정을 테스트 사용자로 추가해야 합니다.</p>
          <label>OAuth 클라이언트 ID
            <input id="gcal-client-id" autocomplete="off" placeholder="1234567890-xxxx.apps.googleusercontent.com" value="${esc(clientId)}" />
          </label>
          <button type="button" id="gcal-save-client">클라이언트 ID 저장</button>
        </div>
      </details>
      <p class="hint">할 일은 가족 캘린더 일정으로 올라가며, 완료하면 제목 앞에 ✓가 붙습니다. 반복 일정은 반복 규칙으로 맞추고, 그날만 수정한 일정은 그 날짜만 따로 올립니다.</p>
    </div>`;
  }

  function onClick(e) {
    const target = e.target;
    if (!target || !target.id) return;
    if (target.id === "gcal-save-client") {
      const input = document.getElementById("gcal-client-id");
      const id = input ? input.value.trim() : "";
      const h = host();
      if (!validClientId(id)) {
        setStatus("클라이언트 ID는 ….apps.googleusercontent.com 형식이어야 합니다.", true);
        if (h && h.toast) h.toast("클라이언트 ID 형식을 확인해 주세요.");
        const el = document.getElementById("gcal-status");
        if (el) {
          el.textContent = statusText;
          el.classList.toggle("is-error", true);
        }
        return;
      }
      storageSet(CLIENT_KEY, id);
      setStatus("클라이언트 ID를 이 기기에 저장했습니다.");
      if (h && h.toast) h.toast("클라이언트 ID를 저장했습니다.");
      if (h && h.refresh) h.refresh();
    }
    if (target.id === "gcal-connect" || target.id === "gcal-sync") sync({ auto: false });
    if (target.id === "gcal-disconnect") disconnect();
  }

  function onChange(e) {
    const target = e.target;
    if (!target || !target.id) return;
    if (target.id === "gcal-auto") storageSet(AUTO_KEY, target.checked ? "1" : "0");
    if (target.id === "gcal-import") storageSet(IMPORT_KEY, target.checked ? "1" : "0");
    if (target.id === "gcal-calendar") {
      storageSet(CAL_KEY, target.value);
      storageSet(PICK_KEY, "1");
      const name = target.selectedOptions && target.selectedOptions[0] ? target.selectedOptions[0].textContent.trim() : "선택한 캘린더";
      setStatus(`다음 동기화부터 「${name}」 캘린더에 맞춥니다. 이전 캘린더에 이미 만든 일정은 그대로 남습니다.`);
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", onClick);
    document.addEventListener("change", onChange);
  }

  window.FamilyHubGcal = {
    mount,
    onLocalChange,
    syncNow() {
      return sync({ auto: false });
    },
  };

  window.FamilyHubGcalDebug = {
    addDaysYmd,
    googleEventId,
    overrideGoogleId,
    buildGoogleEvent,
    buildOverrideEvent,
    parseGoogleEvent,
    hubWins,
    syncSignature,
    buildDesired,
    seoulParts,
    wallTime,
  };
})();
