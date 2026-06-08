# QRAMS — Setup & Deployment Guide

Follow these steps once. Total time: **about 15 minutes**. No coding required.

---

## Overview

```
[ Phone scans QR ] → [ Apps Script Web App ] → logs scan to [ Google Sheet ] → redirects to your master link
[ Teacher PWA ]   → [ Apps Script Web App ] → reads/writes  [ Google Sheet ]
```

You will:
1. Create a Google Sheet (the database).
2. Paste the backend code into Apps Script and run a one-click setup.
3. Deploy the script as a Web App and copy its URL.
4. Open the frontend and paste that URL into Settings.

---

## STEP 1 — Create the database spreadsheet

1. Go to <https://sheets.google.com> and create a **blank spreadsheet**.
2. Name it e.g. `QRAMS Database`.
3. Leave it open — the script will fill it in automatically.

> You do **not** need to create tabs or headers by hand. `setupDatabase()` does it all.

---

## STEP 2 — Add the backend code (Apps Script)

1. In the spreadsheet menu: **Extensions → Apps Script**. A code editor opens.
2. Delete the default `Code.gs` content.
3. Create one script file per file in the `backend/` folder and paste its contents:
   - `Config.gs`, `Utils.gs`, `Database.gs`, `Setup.gs`, `Auth.gs`, `Api.gs`, `Code.gs`
   - (Use the **+** next to "Files" to add each one. The names must match.)
4. Click the gear ⚙ **Project Settings** → tick **"Show appsscript.json manifest file"**.
   Open `appsscript.json` and replace it with the one from `backend/appsscript.json`
   (adjust `timeZone` if you are not in Malaysia).
5. Save (Ctrl/Cmd + S).

### Run the installer

1. In the toolbar function dropdown, choose **`setupDatabase`**.
2. Click **Run**.
3. The first run asks for **authorization** — click **Review permissions**, pick your
   Google account, **Advanced → Go to (project) → Allow**. (This is normal; the script
   only touches this spreadsheet and makes outgoing requests.)
4. Switch back to the spreadsheet — you'll see all the tabs created and seeded with
   sample data (1 task, 5 students, 5 QR codes).

---

## STEP 3 — Deploy as a Web App

1. In Apps Script: **Deploy → New deployment**.
2. Click the gear next to "Select type" → **Web app**.
3. Configure:
   - **Description**: `QRAMS v1`
   - **Execute as**: **Me** (so it can write to the sheet)
   - **Who has access**: **Anyone** ← required so pupils can scan without a Google login
4. Click **Deploy**, authorize if asked, then **copy the Web app URL**.
   It looks like: `https://script.google.com/macros/s/AKfy…long…/exec`

> **Keep this URL.** It is both your API endpoint and the base of every QR link.

### Re-deploying after code changes
Use **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**.
This keeps the **same URL** (important — your printed QR codes won't break).

---

## STEP 4 — Open the frontend (the teacher app)

You have three options — pick the easiest for you:

| Option | How | Notes |
|---|---|---|
| **A. Open locally** | Double-click `frontend/index.html` | Fast for trying it out. Some browsers limit PWA install on `file://`. |
| **B. GitHub Pages (free)** | Push `frontend/` to a repo → Settings → Pages | Real URL, full PWA install, share with staff. |
| **C. Netlify / Vercel drop** | Drag the `frontend/` folder onto netlify.com/drop | Instant free hosting + HTTPS. |

Then:
1. Open the app. A **Connection settings** box appears → paste your **`/exec` URL** → **Test** → **Save**.
2. Sign in with the seeded admin account:
   - **Email:** `admin@school.edu`  **PIN:** `1234`
3. Change the PIN later in the `Users` sheet (`pinHash` column) — see below.

---

## STEP 5 — First real use

1. **Students → Bulk Import** → paste your class list (CSV) → Import.
2. **Tasks → New Task** → give it a title + your real master link (Google Form, Doc, video…).
3. **QR Generator** → pick the task → **Whole class** → **Generate QR codes**.
4. **Print sheet** / **Download PDF** → hand out or display the QR codes.
5. Pupils scan → they reach your link → the **Dashboard** fills with live tracking.

---

## Managing teacher accounts

Open the **Users** tab in the spreadsheet and add a row:

| userId | name | email | role | pinHash | status | createdAt |
|---|---|---|---|---|---|---|
| U002 | Cikgu Aminah | aminah@school.edu | teacher | *(see below)* | Active | *(today)* |

To set a PIN, run this once in Apps Script (replace the PIN), copy the printed hash
into `pinHash`:

```js
function makePin() { Logger.log(hashPin('5678')); }
```

Roles: **admin** (everything), **teacher** (manage tasks & QR), **viewer** (read-only).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Server did not return JSON" | The API URL is wrong or the deployment isn't "Anyone". Re-check Step 3. |
| Login fails | Confirm the `Users` row exists, `status` = `Active`, and the PIN hash matches. |
| Scans not recorded | Make sure the QR encodes the **`/exec`** URL with `?id=`, and the deployment is current. |
| Dashboard looks empty | Generate QR codes and scan at least one. Data caches for 5 min. |
| Changed code, nothing happened | You must **deploy a new version** (Step 3, re-deploy). |
| Want to wipe test data | Run `resetDatabase()` in Apps Script (keeps headers, reseeds samples). |
