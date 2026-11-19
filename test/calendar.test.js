const test = require("node:test");
const assert = require("node:assert/strict");
const { calendarDays, shiftCalendar, addDays } = require("../calendar");

test("weeks start on Monday, including Sundays and year boundaries", () => {
  const days = calendarDays("2027-01-03", "week");
  assert.equal(days.length, 7);
  assert.equal(days[0], "2026-12-28");
  assert.equal(days[6], "2027-01-03");
  assert.deepEqual(calendarDays("2026-12-28", "week"), days);
});

test("months include leap days and complete surrounding weeks", () => {
  const leap = calendarDays("2024-02-29", "month");
  assert.equal(leap[0], "2024-01-29");
  assert.equal(leap.at(-1), "2024-03-03");
  assert.ok(leap.includes("2024-02-29"));
  const sixWeeks = calendarDays("2026-03-31", "month");
  assert.equal(sixWeeks.length, 42);
  assert.equal(sixWeeks[0], "2026-02-23");
  assert.equal(sixWeeks.at(-1), "2026-04-05");
  assert.equal(calendarDays("2021-02-15", "month").length, 28);
});

test("navigation handles month ends and year rollover without skipping months", () => {
  assert.equal(shiftCalendar("2024-01-31", "month", 1), "2024-02-01");
  assert.equal(shiftCalendar("2026-01-31", "month", -1), "2025-12-01");
  assert.equal(shiftCalendar("2026-12-31", "month", 1), "2027-01-01");
  assert.equal(shiftCalendar("2026-12-31", "week", 1), "2027-01-07");
  assert.equal(shiftCalendar("2026-01-01", "week", -1), "2025-12-25");
});

test("local calendar dates stay consecutive through daylight-saving changes", () => {
  const original = process.env.TZ;
  try {
    for (const timezone of ["UTC", "America/New_York", "America/Sao_Paulo", "Pacific/Auckland"]) {
      process.env.TZ = timezone;
      assert.equal(addDays("2026-03-08", 1), "2026-03-09");
      assert.equal(addDays("2026-11-01", 1), "2026-11-02");
      const days = calendarDays("2026-03-08", "month");
      assert.equal(days.length, 42);
      assert.equal(new Set(days).size, 42);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
