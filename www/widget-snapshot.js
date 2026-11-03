(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.FamilyHubWidgetSnapshot = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function ymd(d) {
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function parseYmd(s) {
    const [y, m, d] = String(s || "").split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function eventSpanEnd(ev) {
    const end = String((ev && ev.endDate) || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) return end;
    return (ev && ev.date) || "";
  }

  function occursOn(ev, date) {
    const key = ymd(date);
    if (((ev && ev.excludeDates) || []).includes(key)) return false;
    if (ev && ev.overrides && ev.overrides[key]) return true;
    if (!ev || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date || "")) return false;
    const start = parseYmd(ev.date);
    if (date < start) return false;
    if (!ev.repeat || ev.repeat === "none") {
      const end = parseYmd(eventSpanEnd(ev) || ev.date);
      return date <= end;
    }
    if (ev.repeatUntil && date > parseYmd(ev.repeatUntil)) return false;
    if (ev.repeat === "daily") return true;
    if (ev.repeat === "weekly") {
      const days = ev.weekdays && ev.weekdays.length ? ev.weekdays : [start.getDay()];
      return days.includes(date.getDay());
    }
    if (ev.repeat === "monthly") return date.getDate() === start.getDate();
    return false;
  }

  function itemFrom(ev, day) {
    const key = ymd(day);
    const override = (ev.overrides && ev.overrides[key]) || {};
    const occ = { ...ev, ...override };
    const allDay = Boolean(occ.allDay);
    const due = parseYmd(key);
    return {
      memberId: occ.memberId || "",
      kind: ev.kind === "todo" ? "todo" : "schedule",
      title: occ.title || "(제목 없음)",
      allDay,
      time: allDay ? "" : String(occ.startTime || ""),
      done: ev.kind === "todo" && Boolean(ev.doneDates && ev.doneDates[key]),
      overdue: false,
      due: "",
      dueLabel: "",
      _due: due,
    };
  }

  function overdueItems(events, day) {
    const list = events || [];
    let scanEnd = addDays(day, -365);
    list.forEach((ev) => {
      if (!ev || ev.kind !== "todo" || !/^\d{4}-\d{2}-\d{2}$/.test(ev.date || "")) return;
      const start = parseYmd(ev.date);
      if (start < day && start < scanEnd) scanEnd = start;
    });
    const items = [];
    for (let d = addDays(day, -1); d >= scanEnd; d = addDays(d, -1)) {
      list.forEach((ev) => {
        if (!ev || ev.kind !== "todo" || !occursOn(ev, d)) return;
        const key = ymd(d);
        if (ev.doneDates && ev.doneDates[key]) return;
        const item = itemFrom(ev, d);
        item.allDay = true;
        item.time = "";
        item.done = false;
        item.overdue = true;
        item.due = key;
        item.dueLabel = `${d.getMonth() + 1}/${d.getDate()}`;
        items.push(item);
      });
    }
    items.sort((a, b) => a._due - b._due || String(a.title).localeCompare(String(b.title), "ko"));
    return items;
  }

  function itemsOn(events, day) {
    const own = (events || [])
      .filter((ev) => ev && (ev.kind === "schedule" || ev.kind === "todo") && occursOn(ev, day))
      .map((ev) => itemFrom(ev, day))
      .sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        if (a.time !== b.time) return a.time < b.time ? -1 : 1;
        if (a.kind !== b.kind) return a.kind === "schedule" ? -1 : 1;
        return String(a.title).localeCompare(String(b.title), "ko");
      });
    return overdueItems(events, day).concat(own).map((item) => {
      const copy = { ...item };
      delete copy._due;
      return copy;
    });
  }

  function build(events, today) {
    const start = parseYmd(today);
    const dates = {};
    for (let i = 0; i < 21; i += 1) {
      const day = addDays(start, i);
      dates[ymd(day)] = itemsOn(events, day);
    }
    return { dates };
  }

  return { build, itemsOn, occursOn };
});
