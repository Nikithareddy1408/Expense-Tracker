// db.js
// Sets up the SQLite database connection and makes sure the "expenses"
// table exists. Uses Node's built-in `node:sqlite` module, so there is
// no native module to compile — it just works out of the box.

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "expenses.db");
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    amount REAL NOT NULL,
    category TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

// The "card" column was added after the table already existed in some
// setups, so it's applied as a migration rather than in CREATE TABLE above.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we just try it and ignore
// the error if the column is already there.
try {
  db.exec("ALTER TABLE expenses ADD COLUMN card TEXT");
} catch (err) {
  if (!/duplicate column/i.test(err.message)) throw err;
}

// The audit trail: one row per thing that happened to an expense (created,
// auto-categorized, included in a summary calculation, exported). Kept in
// its own table, separate from system-level server logs, so each expense's
// journey can be looked up and shown on its own.
db.exec(`
  CREATE TABLE IF NOT EXISTS expense_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    detail TEXT NOT NULL,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

module.exports = db;
