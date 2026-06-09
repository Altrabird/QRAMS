/* config.js — connection + session state kept in localStorage.
   The teacher pastes their Apps Script /exec URL once (Settings → Connection),
   and it is remembered on this device. */

const QRAMS = {
  // ===========================================================================
  // BACKEND ADDRESS — your Google Apps Script Web App URL (must end in /exec).
  // Filled in once here so the app connects automatically (no connection popup).
  // A teacher can still override it per-device in Settings → Connection.
  // To point at a different backend later, just replace the URL on the next line.
  // ===========================================================================
  DEFAULT_API_URL: 'https://script.google.com/macros/s/AKfycbzOmpiOP12bcjt43mBOLg8byafrWIJ9rNkvduwxSJIj3BmBmCZIEr3xgzEiv9pwLenR/exec',

  // Where we remember things on this device.
  KEYS: {
    API: 'qrams_api_url',
    TOKEN: 'qrams_session_token',
    USER: 'qrams_user',
    THEME: 'qrams_theme',
    GAMIFY: 'qrams_gamify',
  },

  // Mirror of the backend enums so dropdowns stay in sync (see Config.gs).
  ENUMS: {
    taskStatus: ['Active', 'Paused', 'Completed', 'Archived'],
    qrStatus: ['Active', 'Disabled', 'Completed', 'Expired'],
    progress: ['Not Started', 'Opened', 'Started', 'In Progress', 'Submitted', 'Reviewed', 'Completed'],
    completionMode: ['auto', 'manual', 'form', 'quiz', 'evidence', 'time'],
    entityType: ['student', 'group', 'class', 'custom'],
    rewardType: ['privilege', 'item', 'recognition'],
    certScope: ['task', 'campaign'],
  },

  // Strip Google's account-selector segment (…/macros/u/6/s/… → …/macros/s/…) so the
  // QR links work for PUPILS, who are not signed into the teacher's Google account.
  _cleanExec(u) { return String(u || '').trim().replace(/\/macros\/u\/\d+\/s\//, '/macros/s/'); },
  getApiUrl() { return this._cleanExec(localStorage.getItem(this.KEYS.API) || this.DEFAULT_API_URL); },
  setApiUrl(u) { localStorage.setItem(this.KEYS.API, this._cleanExec(u)); },

  getToken() { return localStorage.getItem(this.KEYS.TOKEN) || ''; },
  getUser() { try { return JSON.parse(localStorage.getItem(this.KEYS.USER)); } catch (e) { return null; } },
  setSession(token, user) {
    localStorage.setItem(this.KEYS.TOKEN, token);
    localStorage.setItem(this.KEYS.USER, JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem(this.KEYS.TOKEN);
    localStorage.removeItem(this.KEYS.USER);
  },
  isLoggedIn() { return !!this.getToken() && !!this.getUser(); },

  // Phase 2: remember whether gamification is on (drives menu visibility).
  getGamify() { return localStorage.getItem(this.KEYS.GAMIFY) === 'true'; },
  setGamify(on) { localStorage.setItem(this.KEYS.GAMIFY, on ? 'true' : 'false'); },
};
