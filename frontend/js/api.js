/* api.js — the ONLY place that talks to Google Apps Script.
   ---------------------------------------------------------------------------
   GET  = reads  ->  fetch(URL?action=...&token=...)
   POST = writes ->  fetch(URL, { body: JSON, content-type: text/plain })

   Why text/plain on POST? A JSON content-type makes the browser send a CORS
   "preflight" OPTIONS request, which Apps Script cannot answer — the call would
   fail. text/plain is a "simple request" (no preflight). The server still
   JSON.parses the body. This is the standard, reliable GAS pattern.            */

const Api = {
  async _get(action, params = {}) {
    const url = QRAMS.getApiUrl();
    if (!url) throw new Error('No API URL set. Open Settings → Connection.');
    const q = new URLSearchParams(Object.assign({ action, token: QRAMS.getToken() }, params));
    const res = await fetch(url + '?' + q.toString(), { method: 'GET' });
    return this._parse(res);
  },

  async _post(action, body = {}) {
    const url = QRAMS.getApiUrl();
    if (!url) throw new Error('No API URL set. Open Settings → Connection.');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ action, token: QRAMS.getToken() }, body)),
    });
    return this._parse(res);
  },

  async _parse(res) {
    let json;
    try { json = await res.json(); }
    catch (e) { throw new Error('Server did not return JSON. Check the API URL / deployment.'); }
    if (!json.ok) throw new Error(json.error || 'Request failed.');
    return json.data;
  },

  // ---- Auth ----
  ping() { return this._get('ping'); },
  login(email, pin) { return this._post('login', { email, pin }); },
  logout() { return this._post('logout', { token: QRAMS.getToken() }); },

  // ---- Reads ----
  dashboard() { return this._get('dashboard'); },
  listCampaigns() { return this._get('listCampaigns'); },
  listTasks() { return this._get('listTasks'); },
  getTask(taskId) { return this._get('getTask', { taskId }); },
  listStudents() { return this._get('listStudents'); },
  listGroups() { return this._get('listGroups'); },
  listQRCodes(taskId) { return this._get('listQRCodes', taskId ? { taskId } : {}); },
  getQR(qrToken) { return this._get('getQR', { qrToken }); },
  getQRDetail(qrToken) { return this._get('getQRDetail', { qrToken }); },
  getSettings() { return this._get('getSettings'); },

  // ---- Phase 2 reads ----
  getCampaign(campaignId) { return this._get('getCampaign', { campaignId }); },
  leaderboard(className) { return this._get('leaderboard', className ? { className } : {}); },
  listBadges() { return this._get('listBadges'); },
  getStudentBadges(entityId) { return this._get('getStudentBadges', { entityId }); },
  getStudentPoints(entityId) { return this._get('getStudentPoints', { entityId }); },
  listRewards() { return this._get('listRewards'); },
  listCertificates(scopeId) { return this._get('listCertificates', scopeId ? { scopeId } : {}); },
  getCertificate(certToken) { return this._get('getCertificate', { certToken }); },

  // ---- Writes ----
  saveTask(task) { return this._post('saveTask', task); },
  setTaskStatus(taskId, status) { return this._post('setTaskStatus', { taskId, status }); },
  duplicateTask(taskId) { return this._post('duplicateTask', { taskId }); },
  saveCampaign(c) { return this._post('saveCampaign', c); },
  importStudents(rows) { return this._post('importStudents', { rows }); },
  generateQRBatch(payload) { return this._post('generateQRBatch', payload); },
  updateQR(payload) { return this._post('updateQR', payload); },
  setQRStatus(qrToken, status) { return this._post('setQRStatus', { qrToken, status }); },
  regenerateQR(qrToken) { return this._post('regenerateQR', { qrToken }); },
  markComplete(payload) { return this._post('markComplete', payload); },
  saveSetting(key, value) { return this._post('saveSetting', { key, value }); },

  // ---- Phase 2 writes ----
  saveBadge(badge) { return this._post('saveBadge', badge); },
  awardPoints(payload) { return this._post('awardPoints', payload); },
  saveReward(reward) { return this._post('saveReward', reward); },
  redeemReward(payload) { return this._post('redeemReward', payload); },
  issueCertificate(payload) { return this._post('issueCertificate', payload); },
  revokeCertificate(certToken) { return this._post('revokeCertificate', { certToken }); },

  // ---- Deletions ----
  deleteTask(taskId) { return this._post('deleteTask', { taskId }); },
  deleteStudent(studentId) { return this._post('deleteStudent', { studentId }); },
  deleteQR(qrToken) { return this._post('deleteQR', { qrToken }); },
  deleteCampaign(campaignId) { return this._post('deleteCampaign', { campaignId }); },
  deleteBadge(badgeId) { return this._post('deleteBadge', { badgeId }); },
  deleteReward(rewardId) { return this._post('deleteReward', { rewardId }); },
};
