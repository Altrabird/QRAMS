# QRAMS — Testing Checklist

Run through this after deploying. ✅ each item. Most take seconds.

## A. Backend / setup
- [ ] `setupDatabase()` runs without errors and creates all tabs.
- [ ] Sample data appears: 1 campaign, 1 task, 5 students, 5 QR codes.
- [ ] Dropdown validation works on `Tasks.status`, `QR_Codes.progress`, etc.
- [ ] `GET {base}?action=ping` returns `{ok:true, data:{app,version}}` in a browser.

## B. Connection & auth
- [ ] In the app, **Settings → Connection → Test** shows "Connected".
- [ ] Login with `admin@school.edu` / `1234` succeeds.
- [ ] Wrong PIN is rejected with a clear message.
- [ ] After login, the sidebar + dashboard load.
- [ ] Sign out returns to the login screen; protected reads then fail until re-login.

## C. Core workflow (the important one)
- [ ] Create a new Task with a real master link (e.g. a Google Form).
- [ ] QR Generator → pick the task → **Whole class** → Generate → QR cards appear.
- [ ] Re-run Generate for the same class → it reports **skipped** (no duplicates). ✅ collision test
- [ ] Open one QR's scan URL on your **phone** → you land on the master link.
- [ ] Back in the app, that QR now shows `scanCount = 1`, `firstScan`, `lastScan`.
- [ ] Dashboard "Scans Today" and the daily chart reflect the scan (allow ≤5 min cache).

## D. QR generation & export
- [ ] **Print sheet** opens a clean print view (sidebar hidden, 3-per-row).
- [ ] **Download PDF** produces an A4 sheet of QR cards.
- [ ] **Download ZIP** contains one PNG per QR.
- [ ] Single QR **PNG** download works from the QR detail page.
- [ ] Changing the **QR color** re-renders the grid.

## E. Tracking & completion
- [ ] Click a QR card → QR Detail shows tracking + scan history.
- [ ] **Mark complete** sets progress = Completed and writes a Completion_Logs row.
- [ ] **Disable** a QR → scanning it still redirects but does **not** increment count.
- [ ] **Regenerate** issues a new token and routes to the new detail page.
- [ ] Auto-mode task: a single scan flips progress straight to `Completed`.

## F. Students & import
- [ ] Add a single student via the modal.
- [ ] Bulk Import: paste CSV → **Preview** shows valid/invalid counts.
- [ ] Import → students appear in the Students list; duplicates are skipped.

## G. UI / UX / PWA
- [ ] Dark/light toggle works and persists after refresh.
- [ ] Layout is usable on a phone (sidebar collapses to a menu button).
- [ ] Toasts appear for success/error actions.
- [ ] (Hosted on https) Browser offers **Install app**; it opens standalone.
- [ ] (Offline) After first load, the shell still opens with the network off
      (live data calls fail gracefully with an error state).

## H. Security
- [ ] A `viewer` account cannot create/edit (server rejects writes).
- [ ] Pasting `<script>` into a task title is stored/displayed as plain text (no execution).
- [ ] A task with a `javascript:` master link is rejected (must be http/https).
- [ ] Guessing a neighbour's token fails (random suffix) — only valid tokens redirect.

## I. Scale sanity (optional)
- [ ] Import ~200 students, generate QRs for all → completes in one batch.
- [ ] Dashboard still loads quickly (cached aggregate).

---

### Known Phase-1 limits (by design)
- Gamification, badges, certificates, campaigns UI, heatmap drill-downs, parent
  reports → **Phase 2** (sheets already scaffolded).
- Auth is lightweight PIN-based (suitable for a classroom kiosk, not banking).
- Apps Script quotas apply (generous for a school; see Google's limits).
