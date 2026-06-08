# QRAMS — API Reference

Base URL = your Apps Script Web App deployment, ending in `/exec`.

- **Reads** → `GET  {base}?action=<name>&token=<session>&...`
- **Writes** → `POST {base}` with a JSON body `{ "action": "...", "token": "...", ... }`
  sent as **`Content-Type: text/plain`** (avoids a CORS preflight Apps Script can't answer).
- **Scan** → `GET {base}?id=<token>` returns an HTML redirect page (not JSON).

### Response envelope
```json
{ "ok": true,  "data": <any> }
{ "ok": false, "error": "message", "code": "ERROR" }
```

### Auth
Call `login` → receive `{ token, user }`. Send `token` on every other call.
Sessions live 6 hours (server-side cache). Roles: `admin`, `teacher`, `viewer`.
Scanning needs **no** token.

---

## Scan (public, no auth)
`GET {base}?id=TASK001-STU001-K7Q2`
Logs the scan, advances progress, auto-completes if the task is `auto` mode,
then redirects the pupil to the task's `masterLink`. Never errors to the pupil.

---

## Auth
| Action | Method | Body / Params | Returns |
|---|---|---|---|
| `ping` | GET | — | `{app, version, time}` (health check) |
| `login` | POST | `email, pin` | `{token, user:{userId,name,role,email}}` |
| `logout` | POST | `token` | `true` |

## Reads (GET) — any signed-in role
| Action | Params | Returns |
|---|---|---|
| `dashboard` | — | aggregated cards, charts, leaderboard |
| `listCampaigns` | — | `[campaign…]` |
| `listTasks` | — | `[task…]` |
| `getTask` | `taskId` | `task` |
| `listStudents` | — | `[student…]` |
| `listGroups` | — | `[group…]` |
| `listQRCodes` | `taskId?` | `[qr…]` (all, or for one task) |
| `getQR` | `qrToken` | `qr` |
| `getQRDetail` | `qrToken` | `{qr, task, scans[], completions[]}` |
| `getSettings` | — | `{key: value, …}` |

## Writes (POST) — admin or teacher unless noted
| Action | Body | Returns |
|---|---|---|
| `saveTask` | task fields (`taskId` to update) | saved task |
| `setTaskStatus` | `taskId, status` | updated task |
| `duplicateTask` | `taskId` | new task |
| `saveCampaign` | campaign fields | saved campaign |
| `importStudents` | `rows:[{name,studentId?,className?,group?,gender?,notes?}]` | `{added, skipped, students[]}` |
| `generateQRBatch` | `taskId, entityType, entityIds?[]/className?/labels?[]` | `{created, skipped, qrCodes[]}` |
| `updateQR` | `token, label?/status?/progress?/remarks?/entityId?` | updated qr |
| `setQRStatus` | `qrToken, status` | updated qr |
| `regenerateQR` | `qrToken` | qr with new token |
| `markComplete` | `token, method?, evidence?, reviewedBy?, notes?` | updated qr |
| `saveSetting` *(admin)* | `key, value` | saved setting |
| `createUser` *(admin)* | `name, email, role, pin` | new user (no hash) |

---

## The QR Splitter — `generateQRBatch`

Splits ONE task into MANY unique QR codes. Skips entities that already have a QR
for that task (collision-proof — safe to re-run).

```jsonc
// Whole class
{ "action":"generateQRBatch", "token":"…",
  "taskId":"TASK001", "entityType":"class", "className":"3 Cerdik" }

// Selected students
{ "action":"generateQRBatch", "token":"…",
  "taskId":"TASK001", "entityType":"student", "entityIds":["STU001","STU002"] }

// Custom labels (events, corners, stations…)
{ "action":"generateQRBatch", "token":"…",
  "taskId":"TASK001", "entityType":"custom", "labels":["Reading Corner","Library"] }
```

Each created QR gets a token `TASK001-STU001-K7Q2`; encode `{base}?id=<token>`
into the QR image (the frontend's `QRGen` does this for you).

---

## Example: fetch from JavaScript
```js
// read
const r = await fetch(`${BASE}?action=listTasks&token=${SESSION}`).then(r=>r.json());

// write (note text/plain!)
const res = await fetch(BASE, {
  method:'POST',
  headers:{'Content-Type':'text/plain;charset=utf-8'},
  body: JSON.stringify({ action:'saveTask', token:SESSION, title:'Reading', masterLink:'https://…' })
}).then(r=>r.json());
```

## Errors you may see
| Message | Cause |
|---|---|
| `Not signed in (session expired)` | token missing/expired → log in again |
| `Your role (viewer) cannot perform this action` | write attempted by a viewer |
| `A valid http(s) master link is required` | bad/empty URL on a task |
| `Task not found` | wrong `taskId` |
