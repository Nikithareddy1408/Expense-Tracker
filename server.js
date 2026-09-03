// server.js
// The Express server for the whole app: it serves the frontend's static
// files (HTML/CSS/JS) AND exposes the REST API under /api, all from one
// process and one port — so `npm start` + one URL is all you need.

const path = require("node:path");
const express = require("express");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3003;

const ALLOWED_CATEGORIES = [
  "Food",
  "Transport",
  "Rent",
  "Entertainment",
  "Other",
];

// A fixed set of demo cards, since this project doesn't have real linked
// bank accounts — just enough variety for the card filter to be useful.
const ALLOWED_CARDS = [
  "Visa •••• 4242",
  "Mastercard •••• 8891",
  "Amex •••• 1005",
  "Cash",
];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Records one audit-trail row for an expense. `source` is only meaningful
// for "created" events (manual entry vs. card sync) and is left null
// otherwise.
function logEvent(expenseId, eventType, detail, source = null) {
  db.prepare(
    "INSERT INTO expense_events (expense_id, event_type, detail, source) VALUES (?, ?, ?, ?)"
  ).run(expenseId, eventType, detail, source);
}

// GET /api/expenses - list all expenses, most recent first
app.get("/api/expenses", (req, res) => {
  const rows = db
    .prepare(
      "SELECT id, amount, category, date, note, card, created_at FROM expenses ORDER BY date DESC, id DESC"
    )
    .all();
  res.json(rows);
});

// POST /api/expenses - add a new expense
app.post("/api/expenses", (req, res) => {
  const { amount, category, date, note, card, source, autoCategorized } = req.body ?? {};

  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
    return res
      .status(400)
      .json({ error: "amount must be a positive number" });
  }
  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({
      error: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
    });
  }
  if (!date || Number.isNaN(Date.parse(date))) {
    return res.status(400).json({ error: "date must be a valid date" });
  }
  const resolvedCard = card || "Cash";
  if (!ALLOWED_CARDS.includes(resolvedCard)) {
    return res.status(400).json({
      error: `card must be one of: ${ALLOWED_CARDS.join(", ")}`,
    });
  }
  const resolvedSource = source === "card sync" ? "card sync" : "manual entry";

  const stmt = db.prepare(
    "INSERT INTO expenses (amount, category, date, note, card) VALUES (?, ?, ?, ?, ?)"
  );
  const result = stmt.run(parsedAmount, category, date, note ?? null, resolvedCard);
  const expenseId = result.lastInsertRowid;

  logEvent(expenseId, "created", "Created", resolvedSource);
  if (autoCategorized) {
    logEvent(expenseId, "categorized", `Categorized as ${category}`, resolvedSource);
  }

  const created = db
    .prepare("SELECT id, amount, category, date, note, card, created_at FROM expenses WHERE id = ?")
    .get(expenseId);

  res.status(201).json(created);
});

// GET /api/expenses/:id/events - the audit trail for one expense, oldest first
app.get("/api/expenses/:id/events", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const expense = db.prepare("SELECT id FROM expenses WHERE id = ?").get(id);
  if (!expense) {
    return res.status(404).json({ error: "expense not found" });
  }

  const events = db
    .prepare(
      "SELECT id, event_type, detail, source, created_at FROM expense_events WHERE expense_id = ? ORDER BY created_at ASC, id ASC"
    )
    .all(id);

  res.json(events);
});

// POST /api/expenses/export-log - records an "Exported in statement" event
// for each expense id included in a CSV download.
app.post("/api/expenses/export-log", (req, res) => {
  const { ids } = req.body ?? {};
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }

  for (const id of ids) {
    if (Number.isInteger(id)) {
      logEvent(id, "export", "Exported in statement");
    }
  }

  res.status(204).end();
});

// DELETE /api/expenses/:id - remove an expense
app.delete("/api/expenses/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "invalid id" });
  }

  const result = db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
  if (result.changes === 0) {
    return res.status(404).json({ error: "expense not found" });
  }
  db.prepare("DELETE FROM expense_events WHERE expense_id = ?").run(id);

  res.status(204).end();
});

// GET /api/summary - total spending and spending by category
app.get("/api/summary", (req, res) => {
  // Log a "included in monthly summary" event for each expense the first
  // time it's rolled into a summary calculation today. Deduped by day so
  // routine page refreshes don't spam the audit trail.
  db.exec(`
    INSERT INTO expense_events (expense_id, event_type, detail)
    SELECT id, 'summary', 'Included in monthly summary' FROM expenses
    WHERE id NOT IN (
      SELECT expense_id FROM expense_events
      WHERE event_type = 'summary' AND date(created_at) = date('now')
    )
  `);

  const totalRow = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM expenses")
    .get();

  const byCategory = db
    .prepare(
      "SELECT category, COALESCE(SUM(amount), 0) AS total FROM expenses GROUP BY category ORDER BY total DESC"
    )
    .all();

  res.json({ total: totalRow.total, byCategory });
});

app.get("/api/categories", (req, res) => {
  res.json(ALLOWED_CATEGORIES);
});

app.get("/api/cards", (req, res) => {
  res.json(ALLOWED_CARDS);
});

app.listen(PORT, () => {
  console.log(`Expense tracker running at http://localhost:${PORT}`);
});
