/* config.js — connection + session state kept in localStorage.
   The teacher pastes their Apps Script /exec URL once (Settings → Connection),
   and it is remembered on this device. */

const QRAMS = {
  // Where we remember things on this device.
  KEYS: {
    API: 'qrams_api_url',
    TOKEN: 'qrams_session_token',
    USER: 'qrams_user',
    THEME: 'qrams_theme',
  },

  // Mirror of the backend enums so dropdowns stay in sync (see Config.gs).
  ENUMS: {
    taskStatus: ['Active', 'Paused', 'Completed', 'Archived'],
    qrStatus: ['Active', 'Disabled', 'Completed', 'Expired'],
    progress: ['Not Started', 'Opened', 'Started', 'In Progress', 'Submitted', 'Reviewed', 'Completed'],
    completionMode: ['auto', 'manual', 'form', 'quiz', 'evidence', 'time'],
    entityType: ['student', 'group', 'class', 'custom'],
  },

  getApiUrl() { return localStorage.getItem(this.KEYS.API) || ''; },
  setApiUrl(u) { localStorage.setItem(this.KEYS.API, (u || '').trim()); },

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
};
