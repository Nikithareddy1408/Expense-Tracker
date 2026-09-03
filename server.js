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
  const { amount, category, date, note, card } = req.body ?? {};

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

  const stmt = db.prepare(
    "INSERT INTO expenses (amount, category, date, note, card) VALUES (?, ?, ?, ?, ?)"
  );
  const result = stmt.run(parsedAmount, category, date, note ?? null, resolvedCard);

  const created = db
    .prepare("SELECT id, amount, category, date, note, card, created_at FROM expenses WHERE id = ?")
    .get(result.lastInsertRowid);

  res.status(201).json(created);
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

  res.status(204).end();
});

// GET /api/summary - total spending and spending by category
app.get("/api/summary", (req, res) => {
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
