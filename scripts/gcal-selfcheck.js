const fs = require("fs");
const path = require("path");

function memStore() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function json(status, data) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => data,
  };
}

global.localStorage = memStore();
global.sessionStorage = memStore();
global.window = global;
global.FAMILY_HUB_GCAL = { clientId: "", calendarName: "가족" };
eval(fs.readFileSync(path.join(__dirname, "..", "gcal.js"), "utf8"));

const dbg = window.FamilyHubGcalDebug;

const weekly = {
  id: "abcdef01",
  kind: "todo",
  title: "숙제",
  memberId: "sua",
  date: "2026-11-03",
  allDay: false,
  startTime: "16:00",
  endTime: "17:00",
  repeat: "weekly",
  weekdays: [2, 4],
  repeatUntil: "2026-12-31",
  note: "수학",
  doneDates: { "2026-11-03": true },
  excludeDates: ["2026-11-10"],
  overrides: { "2026-11-17": { title: "숙제 미룸", allDay: true, note: "" } },
};
const body = dbg.buildGoogleEvent(weekly, { memberName: "유수아" });
assert(body.summary === "할일 · 숙제", "weekly todo summary");
assert(body.start.dateTime === "2026-11-03T16:00:00" && body.start.timeZone === "Asia/Seoul", "seoul start");
assert(body.end.dateTime === "2026-11-03T17:00:00", "seoul end");
assert(body.recurrence[0] === "RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20261231T145959Z", body.recurrence[0]);
assert(body.recurrence[1].includes("20261110T160000") && body.recurrence[1].includes("20261117T160000"), body.recurrence[1]);
assert(body.description.includes("유수아") && body.description.includes("수학"), "description");
assert(body.description.includes("완료: 2026-11-03"), "done line");
assert(body.extendedProperties.private.familyHubKind === "todo", "kind prop");
assert(body.colorId === "10", "member color");
const desired = dbg.buildDesired(
  [weekly, { id: "sched1", kind: "schedule", title: "병원", memberId: "sua", date: "2026-11-03", allDay: true, repeat: "none" }],
  () => "유수아",
  (id) => (id === "sua" ? "수아" : "")
);
assert(desired.length === 1 && desired[0].localId === "sched1", "only schedules are prepared for Google");
assert(desired[0].body.summary === "(수아) 병원", desired[0].body.summary);

const over = dbg.buildOverrideEvent(weekly, "2026-11-17", weekly.overrides["2026-11-17"], { memberName: "유수아" });
assert(over.summary === "할일 · 숙제 미룸", over.summary);
assert(over.start.date === "2026-11-17" && over.end.date === "2026-11-18", "override all day");
assert(over.extendedProperties.private.familyHubId === "abcdef01@2026-11-17", "override id");
assert(dbg.overrideGoogleId(weekly.id, "2026-11-17") !== dbg.googleEventId(weekly.id), "override google id differs");

const parsed = dbg.parseGoogleEvent({
  id: "x",
  status: "confirmed",
  summary: body.summary,
  description: body.description,
  start: body.start,
  end: body.end,
  recurrence: body.recurrence,
  extendedProperties: body.extendedProperties,
});
assert(parsed.title === "숙제" && parsed.kind === "todo", "parsed title");
assert(parsed.repeat === "weekly" && parsed.weekdays.join() === "2,4", "parsed weekdays");
assert(parsed.repeatUntil === "2026-12-31", parsed.repeatUntil);
assert(parsed.startTime === "16:00" && parsed.endTime === "17:00", "parsed times");
assert(parsed.note === "", "hub description is not a note");
assert(parsed.doneDatesList.join() === "2026-11-03", "done dates");
assert(parsed.excludeDates.includes("2026-11-10") && parsed.excludeDates.includes("2026-11-17"), "exdates");

const trip = dbg.buildGoogleEvent(
  {
    id: "abcde",
    kind: "schedule",
    title: "여행",
    memberId: "family",
    date: "2026-11-03",
    endDate: "2026-11-05",
    allDay: true,
    repeat: "none",
  },
  { memberName: "공통", memberTag: "공통" }
);
assert(trip.summary === "(공통) 여행", trip.summary);
assert(trip.start.date === "2026-11-03" && trip.end.date === "2026-11-06", "inclusive span to exclusive end");
const tripBack = dbg.parseGoogleEvent({
  id: "y",
  summary: trip.summary,
  start: trip.start,
  end: trip.end,
  extendedProperties: trip.extendedProperties,
});
assert(tripBack.title === "여행", tripBack.title);
assert(tripBack.date === "2026-11-03" && tripBack.endDate === "2026-11-05" && tripBack.allDay, "span roundtrip");

const doneTodo = dbg.buildGoogleEvent(
  {
    id: "abcde",
    kind: "todo",
    title: "분리수거",
    memberId: "sumin",
    date: "2026-11-03",
    allDay: true,
    repeat: "none",
    doneDates: { "2026-11-03": true },
  },
  { memberName: "유수민" }
);
assert(doneTodo.summary === "✓ 할일 · 분리수거", doneTodo.summary);
const doneParsed = dbg.parseGoogleEvent({
  id: "z",
  summary: doneTodo.summary,
  start: doneTodo.start,
  end: doneTodo.end,
  extendedProperties: doneTodo.extendedProperties,
});
assert(doneParsed.done && doneParsed.title === "분리수거" && doneParsed.kind === "todo", "done mark roundtrip");

const bumped = dbg.buildGoogleEvent(
  {
    id: "abcde",
    kind: "schedule",
    title: "늦은일정",
    date: "2026-11-03",
    allDay: false,
    startTime: "23:30",
    endTime: "23:00",
    repeat: "none",
  },
  {}
);
assert(bumped.end.dateTime === "2026-11-04T00:30:00", bumped.end.dateTime);

const tagged = dbg.buildGoogleEvent(
  {
    id: "abcde",
    kind: "schedule",
    title: "영어",
    memberId: "sua",
    date: "2026-11-03",
    allDay: true,
    repeat: "none",
  },
  { memberName: "유수아", memberTag: "수아" }
);
assert(tagged.summary === "(수아) 영어", tagged.summary);
const taggedBack = dbg.parseGoogleEvent({
  id: "tag",
  summary: tagged.summary,
  start: tagged.start,
  end: tagged.end,
  extendedProperties: tagged.extendedProperties,
});
assert(taggedBack.title === "영어", "prefix stripped on hub events");
const doubled = dbg.buildGoogleEvent(
  {
    id: "abcde",
    kind: "schedule",
    title: "(수아) 영어",
    memberId: "sua",
    date: "2026-11-03",
    allDay: true,
    repeat: "none",
  },
  { memberTag: "수아" }
);
assert(doubled.summary === "(수아) 영어", doubled.summary);
const imported = dbg.buildGoogleEvent(
  {
    id: "abcde",
    kind: "schedule",
    title: "병원",
    memberId: "family",
    date: "2026-11-03",
    allDay: true,
    repeat: "none",
    gcalImported: true,
  },
  { memberTag: "공통" }
);
assert(imported.summary === "병원", "imported events stay unprefixed");
const silver = dbg.buildGoogleEvent(
  {
    id: "abcde",
    kind: "schedule",
    title: "산책",
    memberId: "chilbok",
    date: "2026-11-03",
    allDay: true,
    repeat: "none",
  },
  { memberTag: "실버" }
);
assert(silver.summary === "(실버) 산책", silver.summary);
const foreignPrefixed = dbg.parseGoogleEvent({
  id: "foreign",
  summary: "(수아) 병원",
  start: { date: "2026-11-04" },
  end: { date: "2026-11-05" },
});
assert(foreignPrefixed.title === "(수아) 병원", "google-native titles keep their own prefix");
assert(
  dbg.needsPush(
    { gcalSyncedAt: "2026-11-03T00:00:00.000Z" },
    { imported: false, body: { summary: "(수아) 영어" } },
    { summary: "영어", updated: "2026-11-03T00:00:00.000Z" }
  ),
  "old google title is rewritten once"
);
assert(
  !dbg.needsPush(
    { gcalSyncedAt: "2026-11-03T00:00:00.000Z" },
    { imported: false, body: { summary: "(수아) 영어" } },
    { summary: "(수아) 영어", updated: "2026-11-03T00:00:00.000Z" }
  ),
  "matching prefix is left alone"
);

const seoul = dbg.seoulParts("2026-11-03T15:00:00Z");
assert(seoul.date === "2026-11-04" && seoul.time === "00:00", JSON.stringify(seoul));
assert(dbg.hubWins({}, { updated: "2026-11-03T00:00:00Z" }), "first sync hub wins");
assert(
  dbg.hubWins({ gcalSyncedAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T02:00:00.000Z" }, { updated: "2026-11-03T01:00:00.000Z" }),
  "newer hub edit wins"
);
assert(!dbg.hubWins({ gcalSyncedAt: "2026-11-03T00:00:00.000Z" }, { updated: "2026-11-03T01:00:00.000Z" }), "newer google edit wins");

const gid = dbg.googleEventId("11111111-2222-3333-4444-555555555555");
assert(/^[a-v0-9]{5,1024}$/.test(gid) && !gid.includes("-"), gid);

const calls = [];
global.fetch = async (url, opts = {}) => {
  const method = opts.method || "GET";
  const parsedBody = opts.body ? JSON.parse(opts.body) : null;
  calls.push({ url: String(url), method, body: parsedBody });
  if (String(url).includes("/calendarList")) {
    return json(200, {
      items: [
        { id: "fam", summary: "가족", accessRole: "owner" },
        { id: "work", summary: "업무", accessRole: "reader" },
      ],
    });
  }
  if (method === "GET" && String(url).includes("/events")) {
    return json(200, {
      items: [
        {
          id: "g-foreign",
          summary: "병원",
          status: "confirmed",
          eventType: "default",
          start: { date: "2026-11-04" },
          end: { date: "2026-11-05" },
        },
        {
          id: "g-old",
          summary: "지운일정",
          status: "confirmed",
          start: { date: "2026-11-01" },
          end: { date: "2026-11-02" },
          extendedProperties: { private: { familyHub: "1", familyHubId: "deleted-1" } },
        },
      ],
    });
  }
  if (method === "DELETE") return { status: 204, ok: true, json: async () => ({}) };
  if (method === "PUT" || method === "PATCH" || method === "POST") {
    return json(200, { ...parsedBody, id: parsedBody.id || "created", updated: "2026-11-03T01:00:00.000Z" });
  }
  return json(404, { error: { message: "missing" } });
};

const events = [
  {
    id: "11111111-2222-3333-4444-555555555555",
    kind: "schedule",
    title: "영어",
    memberId: "sua",
    date: "2026-11-03",
    allDay: true,
    repeat: "none",
    startTime: "09:00",
    endTime: "10:00",
    note: "학원",
    doneDates: {},
    excludeDates: [],
    overrides: {},
  },
];
let saved = 0;
global.FamilyHubGcalHost = {
  ready: () => true,
  events: () => events,
  memberName: () => "유수아",
  memberTag: (id) => (id === "sua" ? "수아" : ""),
  saveQuiet: () => {
    saved += 1;
  },
  setSyncing() {},
  toast() {},
  refresh() {},
  newId: () => "new-hospital",
};
global.google = {
  accounts: {
    oauth2: {
      initTokenClient(cfg) {
        return {
          requestAccessToken() {
            cfg.callback({ access_token: "tok", expires_in: 3600 });
          },
        };
      },
    },
  },
};
localStorage.setItem("family-hub-gcal-client-id", "123-abc.apps.googleusercontent.com");

window.FamilyHubGcal.syncNow()
  .then(async () => {
    const english = events.find((ev) => ev.title === "영어");
    const hospital = events.find((ev) => ev.title === "병원");
    assert(events.length === 2, `expected 2 events, got ${events.map((ev) => ev.title).join(",")}`);
    assert(english.gcalId === gid, `gcal id ${english.gcalId}`);
    assert(english.gcalSyncedAt === "2026-11-03T01:00:00.000Z", "synced at");
    assert(hospital && hospital.gcalImported && hospital.gcalId === "g-foreign", "imported hospital");
    assert(hospital.date === "2026-11-04" && hospital.allDay && hospital.memberId === "family" && hospital.kind === "schedule", "hospital fields");
    const put = calls.find((call) => call.method === "PUT" && call.body && call.body.summary === "(수아) 영어");
    assert(put, "put english");
    assert(put.body.start.date === "2026-11-03" && put.body.end.date === "2026-11-04", "english all-day range");
    assert(put.body.description.includes("학원") && put.body.description.includes("유수아"), "english description");
    assert(put.body.extendedProperties.private.familyHubId === english.id, "hub id");
    assert(put.url.includes("/calendars/fam/"), put.url);
    assert(!calls.some((call) => call.method === "PATCH"), "leave unchanged imported events untouched");
    assert(calls.some((call) => call.method === "DELETE" && call.url.includes("g-old")), "delete removed hub event");
    assert(!calls.some((call) => call.url.includes("/calendars/work/")), "do not write read-only calendar");
    assert(saved === 1, `save quiet ${saved}`);

    const before = events.length;
    await window.FamilyHubGcal.syncNow();
    assert(events.length === before, "second sync does not duplicate imports");
    console.log("gcal self-check ok");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
