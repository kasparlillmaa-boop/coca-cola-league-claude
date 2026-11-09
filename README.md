# Coca-Cola League Assistant

A small web app for a private EuroLeague Fantasy group (Kaspar, KJ, MA and ML).
After each round someone enters the four fantasy scores. The app shows the round results,
a running league table and a short text summary of every round.

## Rules

- In every round the **two best scores win** and the **two lowest bring the Coca-Cola**.
- Ties: same score → higher total in the current period → alphabetical order.
- Every **5 rounds form one period** (1–5, 6–10, …). When all five rounds are in, the period
  standings mark the two best and the two lowest. Until then the period is "In progress".
- The league table ranks by total points and also shows Wins and Cokes.
- Points are whole numbers from 0 to 500. Round numbers go from 1 to 100.
- Everyone can look at the results. Adding, editing or deleting a round needs one shared password.

## Pages

League (table + latest summary) · Rounds · Periods · Add round · Sign in

## Environment variables (set them on Railway)

| Variable | Needed | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | Railway PostgreSQL connection. On the app service use the reference `${{Postgres.DATABASE_URL}}`. |
| `EDIT_PASSWORD` | yes | The shared league password for adding and changing scores. Without it nobody can edit. |
| `SESSION_SECRET` | yes | A long random string that signs the login cookie. Without it everyone is signed out on every restart. |
| `PORT` | no | Provided by Railway automatically. Defaults to 3000 if missing. |
| `DATABASE_SSL` | no | Set to `true` only if you use a public database URL that requires SSL. |

Make a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

See `.env.example` for the names (it contains no real values).

## How it is deployed

Railway deploys the `main` branch of this GitHub repo. The app creates its database tables
itself when it starts (SQL files in `migrations/`). There is no local database.
After the first successful deploy, click **Generate Domain** on the app service to get the public URL.

## Commands

- `npm start` – start the app (what Railway runs)
- `npm run build` – checks the syntax of every file and runs all tests; it fails on a real error. Run it before every push.
- `npm test` – only the tests

## Code tour (under 900 lines in `src/`)

| File | What it does |
| --- | --- |
| `src/server.js` | Starts the app: reads settings, runs migrations, listens on `PORT`. |
| `src/app.js` | The web routes (pages, login, forms) and error handling. |
| `src/rules.js` | All league rules: ranking, ties, periods, summary text. No database, no web. |
| `src/validate.js` | Checks what was typed into the form. |
| `src/store.js` | The only file with SQL. |
| `src/db.js` | Database connection and the tiny migration runner. |
| `src/auth.js` | Password check, safe redirects, login attempt limit. |
| `src/views.js` | HTML pages as template strings (values are escaped automatically). |
| `migrations/` | SQL that creates the tables. New changes go in a new numbered file. |
| `test/` | Automated tests. `test-support/` holds the in-memory fake store they use. |

## Why Express?

Express is the most common small Node web framework, and with server-rendered HTML pages the whole app
reads top to bottom: a request comes in, the code reads the database, and a page goes out. There is no
frontend framework to learn on top.
