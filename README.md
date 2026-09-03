# 💰 Expense Tracker

A full-stack expense tracking web app with smart automation features, inspired by real-world finance apps like Monarch Money — built to demonstrate production-style app development, including traceability, auto-categorization, and simulated bank-style data sync.

**Live demo:** https://expense-tracker-1f7h.onrender.com

> ⚠️ **Demo Mode:** This app uses simulated card and transaction data for demonstration purposes only. No real bank accounts, credit cards, or financial data are ever collected or connected. Card numbers shown (e.g. `**** **** **** 4242`) are fake, similar to standard developer test card numbers used by real payment platforms like Stripe.

---

## ✨ Features

### Core Tracking
- Add, view, and delete expenses with amount, category, date, and notes
- Visual spending breakdown by category (bar/pie chart)
- Running total and monthly summaries

### Smart Automation
- **Auto-categorization** — typing a merchant name (e.g. "Starbucks") automatically suggests the right category, using rule-based merchant matching
- **Simulated Card Sync** — click "Simulate Card Sync" on any demo card to auto-generate realistic new transactions, already categorized, mimicking how real bank-linked apps import activity
- **Biggest spending category insight** — automatically calculates and highlights which category you're spending the most on each month

### Traceability & Observability
- **Per-expense audit trail** — click "View History" on any expense to see its full journey: created → categorized → included in exports
- `/health` endpoint — reports app status and uptime
- `/metrics` endpoint — reports total requests, errors, average response time, and usage stats
- Request logging middleware — every request logged with method, path, status, and response time
- Visible **Activity Log** panel showing recent actions in the app

### User Experience
- Search and filter transactions by merchant, date range, category, and card
- Transaction status badges (Pending/Posted), mimicking real bank settlement timing
- Merchant category icons for quick visual scanning
- "Last synced" live-updating timestamp
- CSV statement export (respects active filters)
- Demo data regeneration for fresh, realistic test data on demand

---

## 🛠️ Tech Stack

- **Backend:** Node.js + Express
- **Database:** SQLite (via Node's built-in `node:sqlite` module — no native compilation required)
- **Frontend:** Vanilla HTML/CSS/JavaScript, Chart.js for visualizations
- **Deployment:** Render

---

## 🚀 Running Locally

```bash
git clone https://github.com/Nikithareddy1408/expense-tracker.git
cd expense-tracker/backend
npm install
npm start
```

Then open [http://localhost:3003](http://localhost:3003) in your browser.

---

## 📊 API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/expenses` | List all expenses (supports search/filter query params) |
| `POST /api/expenses` | Add a new expense (auto-categorizes based on note text) |
| `GET /api/expenses/:id/history` | Get the full audit trail for a specific expense |
| `GET /api/cards` | List demo cards |
| `POST /api/cards/:id/sync` | Simulate a card sync (generates new demo transactions) |
| `GET /api/statement` | Export current filtered view as CSV |
| `GET /health` | App health check |
| `GET /metrics` | Usage metrics and stats |

---

## 🧠 Design Notes

This project intentionally does **not** integrate with real banks (e.g. via Plaid or similar services), since that requires financial licensing and security compliance outside the scope of a learning project. Instead, it focuses on building the *intelligence layer* real finance apps are known for — automated categorization, pattern-based insights, and full traceability — on top of safe, clearly-labeled simulated data.

---

## 📝 License

Built as a learning project. Feel free to explore and adapt.
