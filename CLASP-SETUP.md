# Deploying the backend with clasp (no more copy-paste)

Until now every backend change meant: copy `QRAMS-AppsScript.gs` → paste into the
Apps Script editor → **Deploy → New version**. `clasp` replaces all of that with
**one command**, and your `/exec` URL never changes.

## One-time setup (~5 minutes)

1. **Turn on the Apps Script API** (once per Google account):
   open <https://script.google.com/home/usersettings> and switch
   **Google Apps Script API** to **On**.

2. **Sign in to clasp** (opens your browser; approve access):
   ```powershell
   clasp login
   ```

3. **Find your Script ID**: Apps Script editor → ⚙ **Project Settings** → copy
   **Script ID**. (This is the long ID — *not* the `AKfycb…` in your /exec URL.)

4. **Link this folder to your script:**
   ```powershell
   .\clasp-setup.ps1 -ScriptId <PASTE_YOUR_SCRIPT_ID>
   ```

Done — you only do that once.

## Every time you change the backend

```powershell
.\clasp-deploy.ps1
```

This pushes `backend\*.gs` and **redeploys the same web app**, so the `/exec` URL
stays identical — nothing to re-paste, no "New version" to click.

> If you changed **columns** in `Config.gs` (the `SHEETS` schema), also run
> `setupDatabase()` once from the editor afterwards so the new columns are added.

## Good to know
- The first `clasp-deploy.ps1` reorganises the remote project back into the
  separate files (`Api.gs`, `Code.gs`, `Config.gs`, …). It's the **same code** the
  combined file contained — just tidier.
- `clasp login` credentials live in `.clasprc.json`, and the project link in
  `.clasp.json`. Both are **git-ignored** on purpose — don't commit them.
- clasp pushes from the `backend\` folder only (set in `.clasp.json` → `rootDir`).
- The old `QRAMS-AppsScript.gs` combined file still works as a manual fallback if
  you ever can't use clasp — but day-to-day you won't need it.
