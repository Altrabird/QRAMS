# QRAMS — QR Assignment Management System

Split **one** master task link into **many unique QR codes** — one per pupil, group,
class or event — then track every scan and completion live, all stored in
**Google Sheets**. Built for schools: simple, fast, mobile-first, installable.

> **Master link** → **unique token** → **person/group** → **task progress** → **dashboard**

---

## ✨ What it does (Phase 1)

- 🔗 **Master Link Manager** — one task, one link, many trackable copies.
- ✂️ **QR Splitter** — generate unique QR codes per student / class / custom label. No duplicates, ever.
- 🖨️ **QR Generation** — print sheets, download **PNG / PDF / ZIP**, with names & class on each card.
- 📲 **Scan flow** — pupil scans → scan is logged → redirected to the master link. No login needed.
- 📊 **Live dashboard** — totals, completion %, overdue, daily scans, class performance, leaderboard.
- 🔍 **Per-QR tracking** — scan history, progress, completion, remarks, regenerate/disable.
- 👥 **Bulk import** — paste CSV or upload a file.
- 🌗 **Dark/light**, responsive, **installable PWA** with offline shell.
- 🔐 **Role-based login** (admin / teacher / viewer) + token validation, sanitization, http-only links.

## 🧱 Architecture

```
┌────────────────┐   fetch (JSON)    ┌────────────────────────┐   read/write   ┌───────────────┐
│  Frontend PWA  │ ────────────────▶ │  Google Apps Script    │ ─────────────▶ │ Google Sheets │
│ Bootstrap 5 +  │ ◀──────────────── │  Web App (doGet/doPost)│ ◀───────────── │  (database)   │
│ vanilla JS     │                   │  + scan redirect       │                └───────────────┘
└────────────────┘                   └───────────▲────────────┘
        ▲                                         │  ?id=<token>  (logs + redirects)
        │ install / open                          │
   👩‍🏫 Teacher                               📱 Pupil scans QR
```

- **No build step.** Plain HTML/CSS/JS — a teacher can read and edit every file.
- **Hosting:** deploy the script once; open the frontend locally or host free on GitHub Pages / Netlify.

## 📂 Folder structure

```
QRAMS/
├── backend/      Google Apps Script (paste into script.google.com)
│   ├── Config.gs      sheet + column definitions (edit here to add fields)
│   ├── Setup.gs       setupDatabase() — one-click install + sample data
│   ├── Database.gs    generic sheet CRUD + LockService + batching
│   ├── Utils.gs       tokens, sanitization, JSON responses
│   ├── Auth.gs        role-based login (admin/teacher/viewer)
│   ├── Api.gs         tasks, QR splitter, scan, completion, dashboard
│   ├── Code.gs        doGet/doPost router + scan-redirect page
│   └── appsscript.json
├── frontend/     the PWA
│   ├── index.html · manifest.webmanifest · service-worker.js
│   ├── css/styles.css
│   └── js/ config · api · ui · qr · app .js
└── docs/
    ├── SETUP.md            ← start here (15-min deploy)
    ├── DATABASE_SCHEMA.md  ← every sheet & column
    ├── API.md              ← all endpoints
    ├── TESTING.md          ← go-live checklist
    └── sample-students.csv
```

## 🚀 Quick start

1. Read **[docs/SETUP.md](docs/SETUP.md)** (≈15 minutes, no coding).
2. Create a Sheet → paste `backend/` into Apps Script → run `setupDatabase()`.
3. **Deploy → Web app → Anyone**, copy the `/exec` URL.
4. Open `frontend/index.html`, paste the URL in **Settings → Connection**.
5. Log in: **admin@school.edu / 1234** → create a task → generate QR codes → print.

## 🗺️ Roadmap (designed-in, not bolted-on)

Phase 1 keeps the UI light, but the database and architecture already reserve room
for the full **School Digital Task Ecosystem** — switch these on without a rebuild:

| Phase 2+ | Status |
|---|---|
| Campaign management UI (sheet + `campaignId` already wired) | scaffolded |
| Gamification: points, badges, certificates (`Points_Log`, `Badges`, `Rewards`) | sheets ready |
| Attendance + merit points (`Attendance`) | sheet ready |
| Teacher feedback / intervention notes (`Teacher_Notes`) | sheet ready |
| Heatmap drill-downs, parent reports, QR-verifiable certificates | planned |

## 🔐 Security notes

Token validation, server + client sanitization (XSS), http(s)-only master links,
role-gated writes, `LockService` against race conditions, and unguessable QR tokens
(random suffix). Suitable for a classroom kiosk; see `docs/TESTING.md` §H.

## 🧩 Tech

Bootstrap 5 · Chart.js · QRious · JSZip · jsPDF · Google Apps Script · Google Sheets.

---

*Built incrementally per the project's phase plan. Phase 1 = lightweight, fast, deployable.*
