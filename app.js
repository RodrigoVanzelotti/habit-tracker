const STORAGE_KEY = "habit-tracker-v1";
const SHEET_API = "/api/sheets";

const defaultState = {
  habits: [
    { id: "exercise", name: "Exercise", emoji: "🏃", type: "positive", target: 5, period: "week" },
    { id: "read", name: "Read", emoji: "📖", type: "positive", target: 20, period: "month" },
    { id: "smoke", name: "No smoking", emoji: "🚭", type: "negative", target: 6, period: "week" }
  ],
  checkins: []
};

let state = loadState();
let sheetsConfigured = false;
let sheetPassword = "";

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function isoDate(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(`${date}T12:00:00`);
  copy.setDate(copy.getDate() + days);
  return isoDate(copy);
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function hasCheckin(habitId, date = isoDate()) {
  return state.checkins.some((item) => item.habitId === habitId && item.date === date);
}

function toggleCheckin(habitId) {
  const date = isoDate();
  const index = state.checkins.findIndex((item) => item.habitId === habitId && item.date === date);
  if (index >= 0) state.checkins.splice(index, 1);
  else state.checkins.push({ habitId, date, value: true });
  saveState();
  renderCheckins();
  renderDashboard();
  syncCheckin(habitId, date);
}

async function syncCheckin(habitId, date) {
  if (!sheetsConfigured) return;
  const done = hasCheckin(habitId, date);
  await fetch(`${SHEET_API}?action=checkin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ habitId, date, value: done })
  }).catch(() => {});
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
    button.addEventListener("click", () => toggleCheckin(button.dataset.habitId));
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

async function syncFromSheets() {
  if (!sheetsConfigured) return;
  const params = new URLSearchParams({
    action: "getState",
    password: sheetPassword
  });
  const response = await fetch(SHEET_API + "?" + params.toString())
    .then((res) => res.json()).catch(() => null);
  if (response && response.habits) {
    state.habits = response.habits;
    state.checkins = response.checkins || [];
    saveState();
  }
}

async function saveHabit(habit) {
  saveState();
  if (!sheetsConfigured) return;
  await fetch(`${SHEET_API}?action=saveHabit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(habit)
  }).catch(() => {});
}

async function login(password) {
  const config = await fetch("/api/config").then((res) => res.json()).catch(() => ({}));
  if (config.passwordConfigured) {
    const result = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password })
    }).then((res) => res.json()).catch(() => ({ ok: false }));
    if (result.ok && config.sheetsConfigured) sheetPassword = password;
    return result.ok;
  }

  if (config.sheetsConfigured) {
    const params = new URLSearchParams({ action: "verifyPassword", password });
    const result = await fetch(SHEET_API + "?" + params.toString())
      .then((res) => res.json()).catch(() => ({ ok: false }));
    if (result.ok) sheetPassword = password;
    return Boolean(result.ok);
  }

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
document.getElementById("add-habit-button").addEventListener("click", () => {
  document.getElementById("habit-dialog").showModal();
});

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
  state.habits.push(habit);
  await saveHabit(habit);
  form.reset();
  form.elements.emoji.value = "✨";
  document.getElementBy("habit-dialog").close();
  renderCheckins();
  renderDashboard();
});

document.getElementById("password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.getElementById("password-input").value;
  const unlocked = await login(password);
  if (unlocked) {
    document.getElementById("password-screen").classList.add("hidden");
    sessionStorage.setItem("habit-unlocked", "true");
    await syncFromSheets();
    renderCheckins();
    renderDashboard();
  } else {
    document.getElementById("password-error").textContent = "Incorrect password.";
  }
});

async function initialize() {
  const now = new Date();
  document.getElementById("today-label").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  document.getElementById("checkin-date").textContent = now.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  const config = await fetch("/api/config").then((res) => res.json()).catch(() => ({}));
  sheetsConfigured = Boolean(config.sheetsConfigured);
  if (sheetPassword) await syncFromSheets();
  renderCheckins();
  renderDashboard();
  if (!sheetsConfigured && sessionStorage.getItem("habit-unlocked") === "true") {
    document.getElementById("password-screen").classList.add("hidden");
  }
}

initialize();
