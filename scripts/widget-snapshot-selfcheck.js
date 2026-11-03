const snap = require("../widget-snapshot.js");

function assert(cond, msg) {
  if (!cond) {
    console.error(msg);
    process.exit(1);
  }
}

const events = [
  {
    id: "soccer",
    kind: "schedule",
    title: "축구",
    memberId: "sua",
    date: "2026-11-03",
    allDay: false,
    startTime: "16:00",
    repeat: "none",
  },
  {
    id: "homework",
    kind: "todo",
    title: "숙제",
    memberId: "sua",
    date: "2026-11-03",
    allDay: true,
    repeat: "none",
    doneDates: { "2026-11-03": "2026-11-03" },
  },
  {
    id: "piano",
    kind: "schedule",
    title: "피아노",
    memberId: "sumin",
    date: "2026-11-03",
    allDay: true,
    repeat: "none",
  },
  {
    id: "weekly",
    kind: "schedule",
    title: "영어",
    memberId: "sua",
    date: "2026-11-03",
    allDay: false,
    startTime: "15:00",
    repeat: "weekly",
    weekdays: [2],
    repeatUntil: "2026-11-10",
    excludeDates: ["2026-11-10"],
  },
  {
    id: "trip",
    kind: "schedule",
    title: "여행",
    memberId: "family",
    date: "2026-11-03",
    endDate: "2026-11-05",
    allDay: true,
    repeat: "none",
  },
  {
    id: "moved",
    kind: "todo",
    title: "분리수거",
    memberId: "sumin",
    date: "2026-11-01",
    allDay: true,
    repeat: "weekly",
    weekdays: [0],
    overrides: { "2026-11-15": { title: "분리수거 미룸", allDay: true } },
    excludeDates: ["2026-11-08"],
  },
];

const built = snap.build(events, "2026-11-03");
const today = built.dates["2026-11-03"];
assert(today.filter((item) => item.memberId === "sua").map((item) => item.title).join(",") === "숙제,영어,축구", JSON.stringify(today));
assert(today.find((item) => item.title === "숙제").done, "done homework");
assert(today.find((item) => item.title === "축구").time === "16:00", "soccer time");
assert(today.some((item) => item.title === "피아노" && item.memberId === "sumin"), "sumin stays in the payload");
assert(today.some((item) => item.title === "영어"), "weekly tuesday");
assert(!built.dates["2026-11-04"].some((item) => item.title === "영어"), "not wednesday");
assert(!built.dates["2026-11-10"].some((item) => item.title === "영어"), "excluded week");
assert(!built.dates["2026-11-17"].some((item) => item.title === "영어"), "after until");
assert(built.dates["2026-11-04"].some((item) => item.title === "여행" && item.memberId === "family"), "span middle");
assert(built.dates["2026-11-05"].some((item) => item.title === "여행"), "span end");
assert(!built.dates["2026-11-06"].some((item) => item.title === "여행"), "after span");
assert(!built.dates["2026-11-08"].some((item) => item.memberId === "sumin" && item.kind === "todo"), "excluded sunday");
assert(built.dates["2026-11-15"].some((item) => item.title === "분리수거 미룸" && item.memberId === "sumin"), "moved todo");
assert(Object.keys(built.dates).length === 21, "three week window");
console.log("widget snapshot self-check ok");
