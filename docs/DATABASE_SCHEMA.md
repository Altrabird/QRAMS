# QRAMS — Database Schema (Google Sheets)

One spreadsheet, many tabs. Every tab is created automatically by `setupDatabase()`.
Columns are read **by name**, so you can safely append new columns without breaking code.

Legend: 🔑 = primary key · ⏱ = timestamp (ISO) · 🟦 = Phase 1 (used now) · 🟨 = Phase 2 stub (created, not yet wired to UI)

---

## 🟦 Users — login accounts
| Column | Type | Notes |
|---|---|---|
| userId 🔑 | text | `U001`, `U002`… |
| name | text | Display name |
| email | text | Used to log in (unique) |
| role | enum | `admin` \| `teacher` \| `viewer` |
| pinHash | text | SHA-256 hash of the PIN (never store the PIN) |
| status | text | `Active` \| `Disabled` |
| createdAt ⏱ | datetime | |

## 🟦 Campaigns — top of the hierarchy (CAMPAIGN → TASK → QR)
| Column | Type | Notes |
|---|---|---|
| campaignId 🔑 | text | `CAMP001` |
| name | text | e.g. "English Week 2026" |
| description | text | |
| subject | text | |
| program | text | School program / initiative |
| startDate | date | |
| endDate | date | |
| status | enum | `Draft` \| `Active` \| `Paused` \| `Completed` \| `Archived` |
| teacherInCharge | text | |
| notes | text | |
| createdAt ⏱ | datetime | |

## 🟦 Tasks — a single master link to be split
| Column | Type | Notes |
|---|---|---|
| taskId 🔑 | text | `TASK001` |
| campaignId | text | FK → Campaigns (optional) |
| title | text | |
| description | text | |
| subject | text | |
| teacherName | text | |
| dueDate | date | drives "overdue" |
| category | text | Worksheet, Quiz, Reading… |
| **masterLink** | url | the ONE link every QR redirects to |
| completionMode | enum | `auto` \| `manual` \| `form` \| `quiz` \| `evidence` \| `time` |
| pointsValue | number | points awarded on completion |
| status | enum | `Active` \| `Paused` \| `Completed` \| `Archived` |
| createdAt ⏱ / updatedAt ⏱ | datetime | |

## 🟦 Students
| Column | Type | Notes |
|---|---|---|
| studentId 🔑 | text | `STU001` (auto if blank on import) |
| name | text | |
| className | text | e.g. "3 Cerdik" |
| groupId | text | FK → Groups (optional) |
| gender | text | optional |
| notes | text | |
| createdAt ⏱ | datetime | |

## 🟦 Groups
| Column | Type | Notes |
|---|---|---|
| groupId 🔑 | text | `GRP001` |
| name | text | |
| className | text | |
| memberIds | text | comma-separated studentIds |
| notes / createdAt ⏱ | | |

## 🟦 QR_Codes — the heart: one row per unique QR
| Column | Type | Notes |
|---|---|---|
| **token** 🔑 | text | `TASK001-STU001-K7Q2` — unique, encoded in the QR |
| taskId | text | FK → Tasks |
| entityType | enum | `student` \| `group` \| `class` \| `teacher` \| `event` \| `custom` |
| entityId | text | who/what this QR belongs to |
| label | text | display name on the QR card |
| className | text | denormalized for fast dashboard grouping |
| status | enum | `Active` \| `Disabled` \| `Completed` \| `Expired` |
| progress | enum | `Not Started` → `Opened` → `Started` → `In Progress` → `Submitted` → `Reviewed` → `Completed` |
| firstScan ⏱ / lastScan ⏱ | datetime | |
| scanCount | number | incremented on every scan |
| completedAt ⏱ | datetime | |
| points | number | awarded on completion |
| remarks | text | teacher notes |
| createdAt ⏱ | datetime | |

## 🟦 Scan_Logs — full scan history (append-only)
| Column | Type | Notes |
|---|---|---|
| logId 🔑 | text | |
| token | text | FK → QR_Codes |
| taskId / entityId | text | |
| timestamp ⏱ | datetime | |
| deviceType | text | mobile \| tablet \| desktop \| unknown |
| userAgent | text | trimmed |
| action | text | `scan` |

## 🟦 Completion_Logs — evidence/review trail (append-only)
| Column | Type | Notes |
|---|---|---|
| logId 🔑 | text | |
| token / taskId / entityId | text | |
| method | text | manual, form, quiz, evidence… |
| status | text | `Completed` |
| durationSec | number | optional |
| evidence | url | optional uploaded link |
| reviewedBy | text | teacher name |
| notes | text | |
| timestamp ⏱ | datetime | |

## 🟦 Settings — key/value app config
| Column | Type |
|---|---|
| key 🔑 | text (`schoolName`, `gamificationEnabled`, `theme`) |
| value | text |
| updatedAt ⏱ | datetime |

---

## 🟨 Phase 2 stubs (created empty, documented, no UI yet)

These exist so you never rebuild the spreadsheet later — just switch them on.

| Sheet | Purpose | Key columns |
|---|---|---|
| **Points_Log** | gamification ledger | logId, entityId, taskId, points, reason, timestamp |
| **Badges** | digital badges | badgeId, name, description, icon, criteria, createdAt |
| **Rewards** | redeemable rewards | rewardId, name, description, cost, type, createdAt |
| **Attendance** | merge attendance into the ecosystem | logId, studentId, date, status, recordedBy, timestamp |
| **Teacher_Notes** | feedback / intervention notes | noteId, entityId, taskId, author, type, note, timestamp |

---

## Scaling notes (10,000+ rows)
- Reads pull a whole sheet in **one** `getValues()` call, then work in memory — fast.
- The dashboard is **aggregated once and cached** (5 min) via `CacheService`.
- Writes are wrapped in **`LockService`** so concurrent scans never corrupt `scanCount`.
- Bulk inserts use **one batched `setValues()`** instead of row-by-row appends.
- Scan/Completion logs are **append-only** (cheap) — never updated in place.
