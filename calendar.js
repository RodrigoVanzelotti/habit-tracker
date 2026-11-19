function isoDate(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(`${date}T12:00:00`);
  copy.setDate(copy.getDate() + days);
  return isoDate(copy);
}

function calendarDays(anchor, view) {
  const date = new Date(`${anchor}T12:00:00`);
  if (view === "month") date.setDate(1);
  const first = isoDate(date);
  const start = addDays(first, -((date.getDay() + 6) % 7));
  const last = view === "week" ? addDays(start, 6)
    : isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
  const end = view === "week" ? last
    : addDays(last, (7 - new Date(`${last}T12:00:00`).getDay()) % 7);
  const days = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

function shiftCalendar(anchor, view, direction) {
  if (view === "week") return addDays(anchor, direction * 7);
  const date = new Date(`${anchor}T12:00:00`);
  date.setDate(1);
  date.setMonth(date.getMonth() + direction);
  return isoDate(date);
}

if (typeof module !== "undefined") module.exports = { isoDate, addDays, calendarDays, shiftCalendar };
