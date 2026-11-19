/**
 * Google Apps Script web app for the Habit Tracker.
 * Deploy with Execute as: Me and access: Anyone.
 *
 * Settings sheet:
 * A1=key, B1=value
 * A2=password, B2=your-private-password
 */
function doGet(event) {
  const action = (event.parameter.action || "").toString();
  if (action === "verifyPassword") {
    return json({ ok: verifyPassword(event.parameter.password) });
  }
  if (action === "getState") {
    return verifyPassword(event.parameter.password)
      ? json(getState())
      : json({ error: "Unauthorized" });
  }
  return json({ error: "Unknown action" });
}

function doPost(event) {
  const body = event.postData && event.postData.contents
    ? JSON.parse(event.postData.contents)
    : {};
  const action = (event.parameter.action || "").toString();
  if (action === "saveHabit") {
    saveHabit(body);
    return json({ ok: true });
  }
  if (action === "checkin") {
    saveCheckin(body);
    return json({ ok: true });
  }
  return json({ error: "Unknown action" });
}

function sheetNamed(name) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  return spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
}

function verifyPassword(password) {
  const configured = sheetNamed("Settings").getRange("B2").getValue().toString();
  return Boolean(configured && password && password === configured);
}

function getState() {
  const habitsSheet = sheetNamed("Habits");
  const checkinsSheet = sheetNamed("CheckIns");
  const habitsValues = habitsSheet.getDataRange().getDisplayValues();
  const checkinsValues = checkinsSheet.getDataRange().getDisplayValues();

  const habits = habitsValues.length > 1 ? habitsValues.slice(1).filter(row => row[0]).map(row => ({
    id: row[0],
    name: row[1],
    emoji: row[2],
    type: row[3],
    target: Number(row[4] || 1),
    period: row[5] || "week"
  })) : [];

  const checkins = checkinsValues.length > 1
    ? checkinsValues.slice(1).filter(row => row[0] && row[2] === "TRUE").map(row => ({
      habitId: row[0],
      date: row[1],
      value: true
    })) : [];

  return { habits, checkins };
}

function saveHabit(habit) {
  const sheet = sheetNamed("Habits");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["id", "name", "emoji", "type", "target", "period"]);
  }
  sheet.appendRow([habit.id, habit.name, habit.emoji, habit.type, habit.target, habit.period]);
}

function saveCheckin(checkin) {
  const sheet = sheetNamed("CheckIns");
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(["habitId", "date", "value"]);
  }
  const values = sheet.getDataRange().getValues();
  for (let row = 1; row < values.length; row++) {
    if (values[row][0] === checkin.habitId && values[row][1].toString() === checkin.date) {
      sheet.getRange(row + 1, 3).setValue(Boolean(checkin.value));
      return;
    }
  }
  sheet.appendRow([checkin.habitId, checkin.date, Boolean(checkin.value)]);
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
