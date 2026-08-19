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

const form = document.getElementById("expense-form");
const categorySelect = document.getElementById("category");
const dateInput = document.getElementById("date");
const formError = document.getElementById("form-error");
const totalSpendingEl = document.getElementById("total-spending");
const expenseListEl = document.getElementById("expense-list");
const listEmptyEl = document.getElementById("list-empty");
const chartEmptyEl = document.getElementById("chart-empty");
const breakdownBody = document.getElementById("breakdown-body");
const chartCanvas = document.getElementById("category-chart");

let categoryChart = null;

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

async function loadCategories() {
  const res = await fetch(`${API_BASE}/categories`);
  const categories = await res.json();
  categorySelect.innerHTML = categories
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");
}

async function loadExpenses() {
  const res = await fetch(`${API_BASE}/expenses`);
  const expenses = await res.json();
  renderExpenseList(expenses);
}

async function loadSummary() {
  const res = await fetch(`${API_BASE}/summary`);
  const summary = await res.json();
  renderSummary(summary);
}

function renderExpenseList(expenses) {
  listEmptyEl.hidden = expenses.length > 0;
  expenseListEl.innerHTML = expenses
    .map(
      (e) => `
      <li class="expense-item">
        <span class="cat-dot" style="background:${categoryColor(e.category)}"></span>
        <span class="expense-amount">${formatCurrency(e.amount)}</span>
        <span class="expense-meta">
          <span class="note">${e.category}${e.note ? " — " + escapeHtml(e.note) : ""}</span>
        </span>
        <span class="expense-date">${formatDate(e.date)}</span>
        <button class="delete-btn" data-id="${e.id}" aria-label="Delete expense">Delete</button>
      </li>`
    )
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
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.hidden = true;

  const payload = {
    amount: form.amount.value,
    category: form.category.value,
    date: form.date.value,
    note: form.note.value.trim() || null,
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
  await refreshAll();
});

expenseListEl.addEventListener("click", async (event) => {
  const btn = event.target.closest(".delete-btn");
  if (!btn) return;

  const id = btn.dataset.id;
  btn.disabled = true;
  const res = await fetch(`${API_BASE}/expenses/${id}`, { method: "DELETE" });
  if (res.ok) {
    await refreshAll();
  } else {
    btn.disabled = false;
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  loadSummary();
});

(async function init() {
  dateInput.valueAsDate = new Date();
  await loadCategories();
  await refreshAll();
})();
