const STORAGE_KEY = "habit-tracker-v1";
const STATE_API = "/api/state";

const defaultState = {
  habits: [
    { id: "exercise", name: "Exercise", emoji: "🏃", type: "positive", target: 5, period: "week" },
    { id: "read", name: "Read", emoji: "📖", type: "positive", target: 20, period: "month" },
    { id: "smoke", name: "No smoking", emoji: "🚭", type: "negative", target: 6, period: "week" }
  ],
  checkins: []
};

let state = loadState();
let storageConfigured = false;
let calendarView = "month";
let calendarAnchor = isoDate();

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  if (!storageConfigured) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function request(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
  const data = await response.json();
  if (response.status === 401) document.getElementById("password-screen").classList.remove("hidden");
  if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
  return data;
}

function showSaveError(error) {
  document.getElementById("save-error").textContent = `Could not save: ${error.message}`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function hasCheckin(habitId, date = isoDate()) {
  return state.checkins.some((item) => item.habitId === habitId && item.date === date);
}

async function toggleCheckin(habitId, button) {
  const date = isoDate();
  button.disabled = true;
  try {
    if (storageConfigured) await request(`${STATE_API}?action=checkin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habitId, date, value: !hasCheckin(habitId, date) })
    });
    const index = state.checkins.findIndex((item) => item.habitId === habitId && item.date === date);
    if (index >= 0) state.checkins.splice(index, 1);
    else state.checkins.push({ habitId, date, value: true });
    saveState();
    document.getElementById("save-error").textContent = "";
    renderCheckins();
    renderDashboard();
  } catch (error) {
    showSaveError(error);
  } finally {
    button.disabled = false;
  }
}

function renderCheckins() {
  const list = document.getElementById("habit-list");
  list.innerHTML = state.habits.map((habit) => {
    const done = hasCheckin(habit.id);
    const periodLabel = habit.period === "month" ? "month" : "week";
    const actionLabel = habit.type === "negative" ? "avoided" : "checked";
    return `
      <article class="habit-row ${habit.type}">
        <div class="habit-emoji">${escapeHtml(habit.emoji)}</div>
        <div class="habit-info">
          <h3>${escapeHtml(habit.name)}</h3>
          <div class="habit-meta">${habit.target}× per ${periodLabel} · ${done ? actionLabel : "not done"}</div>
        </div>
        <button class="check-button ${done ? "done" : ""}" type="button" data-habit-id="${escapeHtml(habit.id)}"
          aria-label="${done ? "Undo" : "Check"} ${escapeHtml(habit.name)}" aria-pressed="${done}">✓</button>
      </article>`;
  }).join("");

  list.querySelectorAll("[data-habit-id]").forEach((button) => {
    button.addEventListener("click", () => toggleCheckin(button.dataset.habitId, button));
  });

  const complete = state.habits.length
    ? Math.round(state.habits.filter((habit) => hasCheckin(habit.id)).length / state.habits.length * 100)
    : 0;
  document.getElementById("daily-progress").textContent = `${complete}% complete`;
}

function countInRange(habitId, start, end) {
  return state.checkins.filter((item) =>
    item.habitId === habitId && item.date >= start && item.date <= end
  ).length;
}

function periodStart(habit) {
  const today = isoDate();
  if (habit.period === "month") return `${today.slice(0, 7)}-01`;
  const date = new Date(`${today}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  return isoDate(date);
}

function renderDashboard() {
  const habitFilter = document.getElementById("habit-filter");
  const selected = habitFilter.value || "all";
  const period = Number(document.getElementById("period-filter").value);
  const end = isoDate();
  const start = addDays(end, -(period - 1));
  const habits = state.habits.filter((habit) => selected === "all" || habit.id === selected);

  habitFilter.innerHTML = '<option value="all">All habits</option>' + state.habits.map((habit) =>
    `<option value="${escapeHtml(habit.id)}">${escapeHtml(habit.emoji)} ${escapeHtml(habit.name)}</option>`
  ).join("");
  habitFilter.value = selected;

  const totalCheckins = habits.reduce((sum, habit) => sum + countInRange(habit.id, start, end), 0);
  const possibleDays = period * habits.length;
  const consistency = possibleDays ? Math.round(totalCheckins / possibleDays * 100) : 0;
  const currentStreak = longestStreak(habits);
  document.getElementById("summary-grid").innerHTML = `
    <article class="summary-card"><span>Check-ins</span><strong>${totalCheckins}</strong></article>
    <article class="summary-card"><span>Consistency</span><strong>${consistency}%</strong></article>
    <article class="summary-card"><span>Best streak</span><strong>${currentStreak} days</strong></article>`;

  document.getElementById("chart-range").textContent = `${period} days`;
  const chart = document.getElementById("consistency-chart");
  chart.innerHTML = "";
  for (let offset = period - 1; offset >= 0; offset--) {
    const date = addDays(end, -offset);
    const count = habits.reduce((sum, habit) => sum + (hasCheckin(habit.id, date) ? 1 : 0), 0);
    const height = habits.length ? Math.round(count / habits.length * 100) : 0;
    const isNegative = habits.length === 1 && habits[0].type === "negative";
    chart.insertAdjacentHTML("beforeend",
      `<div class="bar-wrap" title="${date}: ${count}"><div class="bar ${isNegative ? "negative" : ""}" style="height:${height}%"></div></div>`
    );
  }

  renderMilestones(habits);
  renderCalendar(habits);
}

function renderCalendar(habits) {
  const days = calendarDays(calendarAnchor, calendarView);
  const today = isoDate();
  const formatter = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", ...(calendarView === "week" ? { day: "numeric" } : {}) });
  const asDate = (day) => new Date(`${day}T12:00:00`);
  document.getElementById("calendar-title").textContent = calendarView === "week"
    ? formatter.formatRange(asDate(days[0]), asDate(days[6]))
    : formatter.format(asDate(calendarAnchor));
  document.querySelectorAll(".calendar-view").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === calendarView));
  });
  const headings = days.slice(0, 7).map((day) => `<th scope="col">${asDate(day).toLocaleDateString(undefined, { weekday: "short" })}</th>`).join("");
  const rows = [];
  for (let index = 0; index < days.length; index += 7) {
    rows.push("<tr>" + days.slice(index, index + 7).map((day) => {
      const count = habits.filter((habit) => hasCheckin(habit.id, day)).length;
      const outside = calendarView === "month" && day.slice(0, 7) !== calendarAnchor.slice(0, 7);
      const status = day > today ? "Future date" : habits.length ? `${count} of ${habits.length} habits checked` : "No habits";
      return `<td class="calendar-day ${outside ? "outside-month" : ""} ${count ? "has-checkins" : ""} ${habits.length && count === habits.length ? "complete" : ""}">
        <time datetime="${day}" ${day === today ? 'aria-current="date"' : ""}>${Number(day.slice(8))}</time>
        <span class="calendar-count" aria-label="${day}: ${status}">${day > today || !habits.length ? "&mdash;" : `${count}/${habits.length}`}</span>
      </td>`;
    }).join("") + "</tr>");
  }
  document.getElementById("calendar-table").innerHTML = `<thead><tr>${headings}</tr></thead><tbody>${rows.join("")}</tbody>`;
}

function longestStreak(habits) {
  if (!habits.length) return 0;
  const uniqueDates = [...new Set(state.checkins
    .filter((item) => habits.some((habit) => habit.id === item.habitId))
    .map((item) => item.date))].sort();
  let longest = 0;
  let current = 0;
  let previous;
  for (const date of uniqueDates) {
    current = previous && addDays(previous, 1) === date ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = date;
  }
  return longest;
}

function renderMilestones(habits) {
  const selected = habits.length === 1 ? habits[0] : null;
  const referenceHabits = selected ? [selected] : habits;
  const dates = new Set();
  state.checkins.forEach((item) => {
    if (referenceHabits.some((habit) => habit.id === item.habitId)) dates.add(item.date);
  });
  const streak = longestStreak(referenceHabits);
  const objective = selected
    ? `${selected.target}× per ${selected.period === "month" ? "month" : "week"}`
    : "All habits";
  const milestones = [7, 30, 90, 180, 365];
  document.getElementById("milestones").innerHTML = milestones.map((days) => `
    <div class="milestone ${streak >= days ? "" : "locked"}">
      <div>${streak >= days ? "🏅" : "○"}</div>
      <strong>${days} days</strong>
      <span>${objective}</span>
      <span>${streak >= days ? "Achieved" : `${Math.max(0, days - streak)} to go`}</span>
    </div>`).join("");
}

async function syncState() {
  if (storageConfigured) state = await request(STATE_API);
}

async function saveHabit(habit) {
  if (storageConfigured) await request(`${STATE_API}?action=saveHabit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(habit)
  });
  state.habits.push(habit);
  saveState();
}

async function login(password) {
  const config = await request("/api/config");
  storageConfigured = config.storageConfigured;
  if (config.passwordConfigured) {
    const result = await request("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    });
    return result.ok;
  }
  if (storageConfigured) throw new Error("Password is not configured");
  return password === "demo";
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`${tab.dataset.tab}-panel`).classList.add("active");
  });
});

document.getElementById("period-filter").addEventListener("change", renderDashboard);
document.getElementById("habit-filter").addEventListener("change", renderDashboard);

document.querySelectorAll(".calendar-view").forEach((button) => {
  button.addEventListener("click", () => {
    calendarView = button.dataset.view;
    renderDashboard();
  });
});

document.querySelectorAll("[data-calendar-step]").forEach((button) => {
  button.addEventListener("click", () => {
    calendarAnchor = shiftCalendar(calendarAnchor, calendarView, Number(button.dataset.calendarStep));
    renderDashboard();
  });
});

document.getElementById("calendar-today").addEventListener("click", () => {
  calendarAnchor = isoDate();
  renderDashboard();
});
document.getElementById("add-habit-button").addEventListener("click", () => {
  document.getElementById("habit-dialog").showModal();
});

const habitForm = document.getElementById("habit-form");
function updateTargetLimit() {
  const max = habitForm.elements.period.value === "week" ? 7 : 31;
  habitForm.elements.target.max = max;
  if (Number(habitForm.elements.target.value) > max) habitForm.elements.target.value = max;
}
habitForm.elements.period.addEventListener("change", updateTargetLimit);
updateTargetLimit();

document.getElementById("habit-form").addEventListener("submit", async (event) => {
  const submitter = event.submitter;
  if (!submitter || submitter.value === "cancel") return;
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const habit = {
    id: `habit-${Date.now()}`,
    name: data.get("name").trim(),
    emoji: data.get("emoji").trim(),
    type: data.get("type"),
    target: Number(data.get("target")),
    period: data.get("period")
  };
  if (!habit.name) return;
  submitter.disabled = true;
  try {
    await saveHabit(habit);
    form.reset();
    updateTargetLimit();
  form.elements.emoji.value = "✨";
    document.getElementById("habit-dialog").close();
    document.getElementById("habit-error").textContent = "";
    renderCheckins();
    renderDashboard();
  } catch (error) {
    document.getElementById("habit-error").textContent = `Could not save: ${error.message}`;
  } finally {
    submitter.disabled = false;
  }
});

document.getElementById("password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("password-input").value;
  try {
    const unlocked = await login(password);
    if (unlocked) {
      await syncState();
      document.getElementById("password-screen").classList.add("hidden");
      sessionStorage.setItem("habit-unlocked", "true");
      renderCheckins();
      renderDashboard();
    } else {
      document.getElementById("password-error").textContent = "Incorrect password.";
    }
  } catch (error) {
    document.getElementById("password-error").textContent = error.message;
  }
});

async function initialize() {
  const now = new Date();
  document.getElementById("today-label").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  document.getElementById("checkin-date").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const config = await request("/api/config");
  storageConfigured = Boolean(config.storageConfigured);
  if (storageConfigured) {
    state = { habits: [], checkins: [] };
    try {
      await syncState();
      document.getElementById("password-screen").classList.add("hidden");
    } catch { /* An absent or expired session keeps the login form visible. */ }
  }
  renderCheckins();
  renderDashboard();
  if (!storageConfigured && !config.passwordConfigured && sessionStorage.getItem("habit-unlocked") === "true") {
    document.getElementById("password-screen").classList.add("hidden");
  }
}

initialize().catch((error) => {
  document.getElementById("password-error").textContent = `Could not connect: ${error.message}`;
});
