// app.js
// All the frontend logic: talks to the Express API, renders the expense
// list, the summary stat, and the category bar chart, and wires up the
// add/delete forms. No build step — plain JS loaded straight in the browser.

const API_BASE = "/api";

const CATEGORY_COLOR_VAR = {
  Food: "--cat-food",
  Transport: "--cat-transport",
  Rent: "--cat-rent",
  Entertainment: "--cat-entertainment",
  Other: "--cat-other",
};

// One emoji per category, shown next to each transaction as a lightweight
// stand-in for a proper icon set.
const CATEGORY_ICON = {
  Food: "☕",
  Transport: "🚗",
  Rent: "🏠",
  Entertainment: "🎬",
  Other: "🛍️",
};

// A transaction is treated as "Pending" if its date is today or yesterday,
// and "Posted" once it's 2+ days old — mimicking how real card transactions
// take a day or two to settle.
const PENDING_WINDOW_DAYS = 1;

// Rule-based merchant -> category matching, the same "bank auto-categorize"
// logic used both when typing a merchant into the add-expense form and when
// simulating new synced-in card activity. Keyword lists are checked in
// order, first match wins.
const MERCHANT_CATEGORY_RULES = [
  {
    category: "Food",
    keywords: [
      "starbucks", "coffee", "chipotle", "mcdonald", "trader joe",
      "whole foods", "doordash", "grubhub", "pizza", "cafe", "restaurant",
      "deli", "bakery", "uber eats",
    ],
  },
  {
    category: "Transport",
    keywords: [
      "uber", "lyft", "shell", "chevron", "exxon", "parking", "transit",
      "metro", "delta", "united airlines", "gas station", "car rental",
    ],
  },
  {
    category: "Entertainment",
    keywords: [
      "netflix", "spotify", "hulu", "amc", "movie", "cinema", "steam",
      "concert", "theater", "ticketmaster",
    ],
  },
  {
    category: "Rent",
    keywords: ["rent", "landlord", "property management", "apartments"],
  },
  {
    category: "Other",
    keywords: [
      "amazon", "target", "walmart", "pharmacy", "cvs", "walgreens",
      "gym", "subscription",
    ],
  },
];

function categorizeMerchant(text) {
  const lower = text.toLowerCase();
  for (const rule of MERCHANT_CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.category;
  }
  return null;
}

// A pool of realistic merchant names for "Simulate Card Sync", each one
// deliberately chosen to match a keyword above so it lands in the right
// category, plus a plausible amount range for that kind of purchase.
const SYNC_MERCHANT_POOL = [
  { name: "Starbucks", minAmount: 3.5, maxAmount: 9 },
  { name: "Chipotle", minAmount: 8, maxAmount: 16 },
  { name: "Trader Joe's", minAmount: 15, maxAmount: 65 },
  { name: "Whole Foods Market", minAmount: 20, maxAmount: 90 },
  { name: "DoorDash", minAmount: 12, maxAmount: 40 },
  { name: "Uber", minAmount: 8, maxAmount: 35 },
  { name: "Lyft", minAmount: 8, maxAmount: 30 },
  { name: "Shell Gas Station", minAmount: 25, maxAmount: 60 },
  { name: "Delta Air Lines", minAmount: 120, maxAmount: 450 },
  { name: "Netflix", minAmount: 9, maxAmount: 20 },
  { name: "Spotify", minAmount: 9, maxAmount: 15 },
  { name: "AMC Theatres", minAmount: 12, maxAmount: 45 },
  { name: "Steam", minAmount: 5, maxAmount: 60 },
  { name: "Amazon", minAmount: 10, maxAmount: 120 },
  { name: "Target", minAmount: 15, maxAmount: 85 },
  { name: "CVS Pharmacy", minAmount: 6, maxAmount: 40 },
];

function randomMerchant() {
  return SYNC_MERCHANT_POOL[Math.floor(Math.random() * SYNC_MERCHANT_POOL.length)];
}

function randomAmount(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function todayDateStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

const form = document.getElementById("expense-form");
const categorySelect = document.getElementById("category");
const cardSelect = document.getElementById("card");
const dateInput = document.getElementById("date");
const noteInput = document.getElementById("note");
const autoCatHint = document.getElementById("auto-cat-hint");
const cardsListEl = document.getElementById("cards-list");
const formError = document.getElementById("form-error");
const historyDialog = document.getElementById("history-dialog");
const historySubtitle = document.getElementById("history-subtitle");
const historyTimeline = document.getElementById("history-timeline");
const historyCloseBtn = document.getElementById("history-close");
const totalSpendingEl = document.getElementById("total-spending");
const expenseListEl = document.getElementById("expense-list");
const listEmptyEl = document.getElementById("list-empty");
const listNoMatchEl = document.getElementById("list-no-match");
const chartEmptyEl = document.getElementById("chart-empty");
const breakdownBody = document.getElementById("breakdown-body");
const chartCanvas = document.getElementById("category-chart");
const syncStatusEl = document.getElementById("sync-status");
const exportBtn = document.getElementById("export-btn");

const filterSearchEl = document.getElementById("filter-search");
const filterDateFromEl = document.getElementById("filter-date-from");
const filterDateToEl = document.getElementById("filter-date-to");
const filterCategoryEl = document.getElementById("filter-category");
const filterCardEl = document.getElementById("filter-card");
const filterClearBtn = document.getElementById("filter-clear");

let categoryChart = null;
let allExpenses = [];
let lastSyncedAt = null;
let categoryManuallySet = false;

function categoryColor(category) {
  const varName = CATEGORY_COLOR_VAR[category] || "--cat-other";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Whole-day difference between a "YYYY-MM-DD" expense date and today,
// ignoring time-of-day so it lines up with how the date picker stores dates.
function daysSince(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const txDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  txDate.setHours(0, 0, 0, 0);
  return Math.round((today - txDate) / 86400000);
}

function transactionStatus(dateStr) {
  const age = daysSince(dateStr);
  return age <= PENDING_WINDOW_DAYS ? "Pending" : "Posted";
}

// SQLite's datetime('now') stores UTC as "YYYY-MM-DD HH:MM:SS" with no
// timezone marker, so it has to be told it's UTC before parsing, or the
// browser would read it as local time and skew every timestamp shown.
function formatDateTime(sqliteTimestamp) {
  const date = new Date(sqliteTimestamp.replace(" ", "T") + "Z");
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---- Last synced indicator -------------------------------------------
// Shows how long ago the data was last fetched, in words, and keeps that
// wording fresh every 30s without re-fetching anything from the server.

function formatRelativeTime(date) {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "Synced just now";
  if (seconds < 60) return `Synced ${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Synced ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `Synced ${hours} hour${hours === 1 ? "" : "s"} ago`;
}

function updateSyncStatus() {
  if (!lastSyncedAt) return;
  syncStatusEl.textContent = formatRelativeTime(lastSyncedAt);
}

function markSynced() {
  lastSyncedAt = new Date();
  updateSyncStatus();
}

setInterval(updateSyncStatus, 30000);

// ---- Loading data -------------------------------------------------------

async function loadCategories() {
  const res = await fetch(`${API_BASE}/categories`);
  const categories = await res.json();
  categorySelect.innerHTML = categories
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
  filterCategoryEl.insertAdjacentHTML(
    "beforeend",
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")
  );
}

async function loadCards() {
  const res = await fetch(`${API_BASE}/cards`);
  const cards = await res.json();
  cardSelect.innerHTML = cards
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
  filterCardEl.insertAdjacentHTML(
    "beforeend",
    cards.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")
  );
  renderCardsList(cards);
}

// ---- Auto-categorize (add-expense form) ------------------------------
// Once a card is selected and a merchant/note is typed, guess the category
// from the same rules used for card sync, the way a bank auto-tags a new
// transaction. A manual category change "wins" and stops further
// auto-filling until the form is reset.

function maybeAutoCategorize() {
  if (categoryManuallySet) return;
  const merchantText = noteInput.value.trim();
  if (!cardSelect.value || !merchantText) return;

  const match = categorizeMerchant(merchantText);
  if (match) {
    categorySelect.value = match;
    autoCatHint.hidden = false;
  }
}

noteInput.addEventListener("input", maybeAutoCategorize);
cardSelect.addEventListener("change", maybeAutoCategorize);

categorySelect.addEventListener("change", () => {
  categoryManuallySet = true;
  autoCatHint.hidden = true;
});

async function loadExpenses() {
  const res = await fetch(`${API_BASE}/expenses`);
  allExpenses = await res.json();
  applyFilters();
}

async function loadSummary() {
  const res = await fetch(`${API_BASE}/summary`);
  const summary = await res.json();
  renderSummary(summary);
}

// ---- Search & filter ------------------------------------------------

function getFilteredExpenses() {
  const query = filterSearchEl.value.trim().toLowerCase();
  const dateFrom = filterDateFromEl.value;
  const dateTo = filterDateToEl.value;
  const category = filterCategoryEl.value;
  const card = filterCardEl.value;

  return allExpenses.filter((e) => {
    if (query) {
      const haystack = `${e.note || ""} ${e.category}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (dateFrom && e.date < dateFrom) return false;
    if (dateTo && e.date > dateTo) return false;
    if (category && e.category !== category) return false;
    if (card && e.card !== card) return false;
    return true;
  });
}

function applyFilters() {
  const filtered = getFilteredExpenses();
  renderExpenseList(filtered);
}

[filterSearchEl, filterDateFromEl, filterDateToEl, filterCategoryEl, filterCardEl].forEach((el) => {
  el.addEventListener("input", applyFilters);
});

filterClearBtn.addEventListener("click", () => {
  filterSearchEl.value = "";
  filterDateFromEl.value = "";
  filterDateToEl.value = "";
  filterCategoryEl.value = "";
  filterCardEl.value = "";
  applyFilters();
});

// ---- Rendering ------------------------------------------------------

function renderExpenseList(expenses) {
  const hasAny = allExpenses.length > 0;
  listEmptyEl.hidden = hasAny;
  listNoMatchEl.hidden = !hasAny || expenses.length > 0;

  expenseListEl.innerHTML = expenses
    .map((e) => {
      const status = transactionStatus(e.date);
      const badgeClass = status === "Pending" ? "badge-pending" : "badge-posted";
      const icon = CATEGORY_ICON[e.category] || CATEGORY_ICON.Other;
      return `
      <li class="expense-item">
        <span class="cat-icon" title="${e.category}" aria-hidden="true">${icon}</span>
        <span class="expense-amount">${formatCurrency(e.amount)}</span>
        <span class="expense-meta">
          <span class="note">${e.category}${e.note ? " — " + escapeHtml(e.note) : ""}</span>
          <span class="expense-card">${escapeHtml(e.card || "Cash")}</span>
        </span>
        <span class="status-badge ${badgeClass}">${status}</span>
        <span class="expense-date">${formatDate(e.date)}</span>
        <button class="history-btn" data-id="${e.id}" aria-label="View history" title="View history">🕘</button>
        <button class="delete-btn" data-id="${e.id}" aria-label="Delete expense">Delete</button>
      </li>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderSummary(summary) {
  totalSpendingEl.textContent = formatCurrency(summary.total);

  breakdownBody.innerHTML = summary.byCategory
    .map(
      (row) => `
      <tr>
        <td><span class="cat-dot" style="background:${categoryColor(row.category)};display:inline-block;margin-right:6px;"></span>${row.category}</td>
        <td>${formatCurrency(row.total)}</td>
      </tr>`
    )
    .join("");

  chartEmptyEl.hidden = summary.byCategory.length > 0;
  chartCanvas.style.display = summary.byCategory.length > 0 ? "block" : "none";

  renderChart(summary.byCategory);
}

function renderChart(byCategory) {
  const labels = byCategory.map((r) => r.category);
  const data = byCategory.map((r) => r.total);
  const colors = byCategory.map((r) => categoryColor(r.category));

  const textSecondary = getComputedStyle(document.documentElement)
    .getPropertyValue("--text-secondary")
    .trim();
  const gridline = getComputedStyle(document.documentElement).getPropertyValue("--gridline").trim();

  if (categoryChart) {
    categoryChart.destroy();
  }

  if (byCategory.length === 0) {
    return;
  }

  categoryChart = new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderRadius: 4,
          barThickness: 22,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => formatCurrency(ctx.parsed.x),
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: gridline },
          ticks: {
            color: textSecondary,
            callback: (value) => formatCurrency(value),
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: textSecondary },
        },
      },
    },
  });
}

async function refreshAll() {
  await Promise.all([loadExpenses(), loadSummary()]);
  markSynced();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;

  const payload = {
    amount: form.amount.value,
    category: form.category.value,
    date: form.date.value,
    note: form.note.value.trim() || null,
    card: form.card.value,
    source: "manual entry",
    // The auto-cat hint is only visible when the current category value
    // came from categorizeMerchant() and hasn't been overridden since.
    autoCategorized: !autoCatHint.hidden,
  };

  const res = await fetch(`${API_BASE}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    formError.textContent = err.error || "Something went wrong adding that expense.";
    formError.hidden = false;
    return;
  }

  form.reset();
  dateInput.valueAsDate = new Date();
  categoryManuallySet = false;
  autoCatHint.hidden = true;
  await refreshAll();
});

// ---- Cards & "Simulate Card Sync" ------------------------------------

function renderCardsList(cards) {
  cardsListEl.innerHTML = cards
    .map(
      (c) => `
      <li class="card-row">
        <span class="card-name">${escapeHtml(c)}</span>
        <span class="sync-msg" hidden></span>
        <button type="button" class="sync-btn" data-card="${escapeHtml(c)}">Simulate Card Sync</button>
      </li>`
    )
    .join("");
}

cardsListEl.addEventListener("click", async (event) => {
  const btn = event.target.closest(".sync-btn");
  if (!btn) return;

  const card = btn.dataset.card;
  const row = btn.closest(".card-row");
  const msgEl = row.querySelector(".sync-msg");
  const originalLabel = btn.textContent;

  btn.disabled = true;
  btn.textContent = "Syncing…";
  msgEl.hidden = true;

  const count = 3 + Math.floor(Math.random() * 3); // 3-5 new transactions
  const today = todayDateStr();
  let created = 0;

  for (let i = 0; i < count; i++) {
    const merchant = randomMerchant();
    const category = categorizeMerchant(merchant.name) || "Other";
    const amount = randomAmount(merchant.minAmount, merchant.maxAmount);

    const res = await fetch(`${API_BASE}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount,
        category,
        date: today,
        note: merchant.name,
        card,
        source: "card sync",
        autoCategorized: true,
      }),
    });
    if (res.ok) created++;
  }

  await refreshAll();

  btn.disabled = false;
  btn.textContent = originalLabel;
  msgEl.textContent = `+${created} new transaction${created === 1 ? "" : "s"} synced`;
  msgEl.hidden = false;
  setTimeout(() => {
    msgEl.hidden = true;
  }, 5000);
});

expenseListEl.addEventListener("click", async (event) => {
  const deleteBtn = event.target.closest(".delete-btn");
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    deleteBtn.disabled = true;
    const res = await fetch(`${API_BASE}/expenses/${id}`, { method: "DELETE" });
    if (res.ok) {
      await refreshAll();
    } else {
      deleteBtn.disabled = false;
    }
    return;
  }

  const historyBtn = event.target.closest(".history-btn");
  if (historyBtn) {
    openHistory(Number(historyBtn.dataset.id));
  }
});

// ---- View history dialog ----------------------------------------------

async function openHistory(id) {
  const res = await fetch(`${API_BASE}/expenses/${id}/events`);
  if (!res.ok) return;
  const events = await res.json();

  const expense = allExpenses.find((e) => e.id === id);
  historySubtitle.textContent = expense
    ? `${formatCurrency(expense.amount)} — ${expense.category}${expense.note ? " — " + expense.note : ""}`
    : "";

  historyTimeline.innerHTML = events.length
    ? events
        .map(
          (ev) => `
      <li class="history-event">
        <span class="history-dot" aria-hidden="true"></span>
        <div class="history-content">
          <span class="history-label">${escapeHtml(ev.detail)}</span>
          <span class="history-time">${formatDateTime(ev.created_at)}</span>
        </div>
      </li>`
        )
        .join("")
    : '<li class="history-empty">No events recorded yet.</li>';

  historyDialog.showModal();
}

historyCloseBtn.addEventListener("click", () => historyDialog.close());

// ---- CSV export -------------------------------------------------------

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsv(expenses) {
  const header = ["Date", "Category", "Note", "Card", "Status", "Amount"];
  const rows = expenses.map((e) => [
    e.date,
    e.category,
    e.note || "",
    e.card || "Cash",
    transactionStatus(e.date),
    e.amount.toFixed(2),
  ]);
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

exportBtn.addEventListener("click", async () => {
  const filtered = getFilteredExpenses();
  if (filtered.length === 0) return;

  const csv = buildCsv(filtered);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `statement-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  await fetch(`${API_BASE}/expenses/export-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: filtered.map((e) => e.id) }),
  });
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  loadSummary();
});

(async function init() {
  dateInput.valueAsDate = new Date();
  await Promise.all([loadCategories(), loadCards()]);
  await refreshAll();
})();
