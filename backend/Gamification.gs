/**
 * Gamification.gs  — POINTS · BADGES · LEADERBOARD · REWARDS
 * =============================================================================
 * Phase 2. Everything here is OPTIONAL: it only runs when the school turns on
 * the `gamificationEnabled` setting. When it's off, scans behave exactly like
 * Phase 1 (no extra work, no slowdown).
 *
 * Design (kept deliberately simple):
 *  - POINTS are an append-only LEDGER (Points_Log). Earning = a positive row,
 *    spending a reward = a negative row. A pupil's balance = the sum of rows.
 *    This gives a full history and makes rewards "just work".
 *  - BADGES: definitions live in the Badges sheet; the moment a pupil earns one
 *    we write a row to Student_Badges so we never award the same badge twice.
 *  - Heavy reads (totals, badge checks) happen on completion only, and the
 *    dashboard/leaderboard results are cached — so the scan path stays fast.
 * =============================================================================
 */

/* ----------------------- master on/off switch ----------------------- */

/**
 * Is gamification switched on? Cached for 60s so we don't read the Settings
 * sheet on every single scan. saveSetting() clears this cache instantly.
 */
function isGamificationOn() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('gamiOn');
  if (cached !== null) return cached === '1';
  var on = String((getSettings() || {}).gamificationEnabled) === 'true';
  cache.put('gamiOn', on ? '1' : '0', 60);
  return on;
}

/* ============================= POINTS ============================= */

/** Add (or subtract, if negative) points for a pupil. Appends one ledger row. */
function awardPoints(entityId, taskId, points, reason) {
  entityId = clean(entityId);
  points = Number(points) || 0;
  if (!entityId || !points) return null; // nothing to record
  var row = {
    logId: uid('PT'), entityId: entityId, taskId: clean(taskId),
    points: points, reason: clean(reason), timestamp: nowIso(),
  };
  appendRow(SHEETS.POINTS_LOG, row);
  invalidateDashboard();
  return row;
}

/** A single pupil's current points balance (sum of their ledger rows). */
function getStudentPoints(entityId) {
  return findWhere(SHEETS.POINTS_LOG, 'entityId', entityId)
    .reduce(function (sum, r) { return sum + (Number(r.points) || 0); }, 0);
}

/** Map of every pupil's balance: { entityId: total }. One pass over the ledger. */
function getAllPoints() {
  var map = {};
  readAll(SHEETS.POINTS_LOG).forEach(function (r) {
    map[r.entityId] = (map[r.entityId] || 0) + (Number(r.points) || 0);
  });
  return map;
}

/* ============================= BADGES ============================= */

function listBadges() { return readAll(SHEETS.BADGES); }

/** Create or update a badge definition (admin/teacher). */
function saveBadge(payload) {
  var common = {
    name: clean(payload.name), description: clean(payload.description),
    icon: clean(payload.icon) || '🏅', criteria: clean(payload.criteria),
  };
  if (!common.name) throw new Error('Badge name is required.');
  if (payload.badgeId) return updateWhere(SHEETS.BADGES, 'badgeId', payload.badgeId, common);
  var ids = readAll(SHEETS.BADGES).map(function (b) { return b.badgeId; });
  common.badgeId = nextId('B', ids);
  common.createdAt = nowIso();
  appendRow(SHEETS.BADGES, common);
  return common;
}

/** Give a pupil a badge, but only if they don't already have it. */
function awardBadge(entityId, badgeId, reason) {
  var has = findWhere(SHEETS.STUDENT_BADGES, 'entityId', entityId)
    .some(function (r) { return String(r.badgeId) === String(badgeId); });
  if (has) return null;
  var row = {
    logId: uid('BDG'), entityId: clean(entityId), badgeId: clean(badgeId),
    reason: clean(reason), awardedAt: nowIso(),
  };
  appendRow(SHEETS.STUDENT_BADGES, row);
  return row;
}

/**
 * Check every badge rule for one pupil and award any newly-earned badges.
 * Called after a task is completed (and on every scan, for 'first_scan').
 * Returns the list of badges just awarded (for a nice "you earned X!" message).
 */
function checkBadges(entityId) {
  if (!isGamificationOn()) return [];
  var badges = listBadges();
  if (!badges.length) return [];

  // Already-earned set, so we skip them quickly.
  var earned = {};
  findWhere(SHEETS.STUDENT_BADGES, 'entityId', entityId)
    .forEach(function (r) { earned[r.badgeId] = true; });

  // Compute the stats the rules need — once.
  var myQrs = findWhere(SHEETS.QR_CODES, 'entityId', entityId);
  var stats = {
    entityId: entityId,
    completed: myQrs.filter(function (q) { return q.progress === 'Completed'; }).length,
    scans: myQrs.reduce(function (n, q) { return n + (Number(q.scanCount) || 0); }, 0),
    points: getStudentPoints(entityId),
  };

  var newly = [];
  badges.forEach(function (b) {
    if (earned[b.badgeId]) return;            // already has it
    if (badgeMet(b.criteria, stats)) {
      awardBadge(entityId, b.badgeId, 'Auto: ' + b.criteria);
      newly.push(b);
    }
  });
  return newly;
}

/** Decide whether a badge's criteria string is satisfied by the pupil's stats. */
function badgeMet(criteria, stats) {
  criteria = String(criteria || '').trim();
  if (criteria === 'first_scan') return stats.scans >= 1;
  if (criteria === 'perfect_campaign') return hasPerfectCampaign(stats.entityId);
  var m = criteria.match(/^(tasks|points):(\d+)$/);
  if (m) {
    var n = parseInt(m[2], 10);
    if (m[1] === 'tasks') return stats.completed >= n;
    if (m[1] === 'points') return stats.points >= n;
  }
  return false;
}

/** True if the pupil has at least one campaign where ALL their tasks are done. */
function hasPerfectCampaign(entityId) {
  var myQrs = findWhere(SHEETS.QR_CODES, 'entityId', entityId);
  if (!myQrs.length) return false;
  var campOf = {};
  listTasks().forEach(function (t) { campOf[t.taskId] = t.campaignId || ''; });
  var byCamp = {};
  myQrs.forEach(function (q) {
    var c = campOf[q.taskId] || '';
    if (!c) return;
    byCamp[c] = byCamp[c] || { total: 0, done: 0 };
    byCamp[c].total++;
    if (q.progress === 'Completed') byCamp[c].done++;
  });
  return Object.keys(byCamp).some(function (c) {
    return byCamp[c].total > 0 && byCamp[c].total === byCamp[c].done;
  });
}

/** Badges a pupil has earned, joined with their definitions (icon, name, …). */
function getStudentBadges(entityId) {
  var defs = {};
  listBadges().forEach(function (b) { defs[b.badgeId] = b; });
  return findWhere(SHEETS.STUDENT_BADGES, 'entityId', entityId).map(function (e) {
    var d = defs[e.badgeId] || {};
    return {
      badgeId: e.badgeId, name: d.name || e.badgeId, icon: d.icon || '🏅',
      description: d.description || '', awardedAt: e.awardedAt,
    };
  });
}

/* =========================== LEADERBOARD =========================== */

/**
 * Ranked list of pupils by points (then by tasks completed). Optionally
 * filtered to one class. Joins in points (ledger) and badge counts.
 */
function getLeaderboard(filterClass) {
  var pointsMap = getAllPoints();
  var badgeCount = {};
  readAll(SHEETS.STUDENT_BADGES).forEach(function (r) {
    badgeCount[r.entityId] = (badgeCount[r.entityId] || 0) + 1;
  });

  var board = {};
  readAll(SHEETS.QR_CODES).forEach(function (q) {
    if (q.entityType !== 'student' && q.entityType !== 'group') return;
    if (filterClass && String(q.className) !== String(filterClass)) return;
    var k = q.entityId;
    board[k] = board[k] || { entityId: q.entityId, label: q.label, className: q.className || '', completed: 0 };
    if (q.progress === 'Completed') board[k].completed++;
  });

  return Object.keys(board).map(function (k) {
    var b = board[k];
    b.points = pointsMap[k] || 0;
    b.badges = badgeCount[k] || 0;
    return b;
  }).sort(function (a, b) {
    return b.points - a.points || b.completed - a.completed;
  });
}

/* ============================= REWARDS ============================= */

function listRewards() { return readAll(SHEETS.REWARDS); }

/** Create or update a reward (admin/teacher). */
function saveReward(payload) {
  var common = {
    name: clean(payload.name), description: clean(payload.description),
    cost: Number(payload.cost) || 0,
    type: ENUMS.rewardType.indexOf(payload.type) !== -1 ? payload.type : 'item',
    status: ENUMS.rewardStatus.indexOf(payload.status) !== -1 ? payload.status : 'Active',
  };
  if (!common.name) throw new Error('Reward name is required.');
  if (payload.rewardId) return updateWhere(SHEETS.REWARDS, 'rewardId', payload.rewardId, common);
  var ids = readAll(SHEETS.REWARDS).map(function (r) { return r.rewardId; });
  common.rewardId = nextId('R', ids);
  common.createdAt = nowIso();
  appendRow(SHEETS.REWARDS, common);
  return common;
}

/**
 * Redeem a reward for a pupil. Checks they can afford it, then records the
 * spend as a NEGATIVE ledger row (so their balance updates automatically).
 */
function redeemReward(payload) {
  var reward = findOne(SHEETS.REWARDS, 'rewardId', payload.rewardId);
  if (!reward) throw new Error('Reward not found.');
  if (String(reward.status) === 'Disabled') throw new Error('That reward is switched off.');

  var entityId = clean(payload.entityId);
  if (!entityId) throw new Error('Choose a pupil to redeem for.');

  var balance = getStudentPoints(entityId);
  var cost = Number(reward.cost) || 0;
  if (balance < cost) throw new Error('Not enough points (' + balance + ' / ' + cost + ').');

  awardPoints(entityId, '', -cost, 'reward:' + reward.rewardId + ' — ' + reward.name);
  return { entityId: entityId, spent: cost, balance: balance - cost, reward: reward.name };
}

/** Delete a badge definition and any "earned" records for it. */
function deleteBadge(badgeId) {
  if (!findOne(SHEETS.BADGES, 'badgeId', badgeId)) throw new Error('Badge not found.');
  deleteWhere(SHEETS.BADGES, 'badgeId', badgeId);
  deleteAllWhere(SHEETS.STUDENT_BADGES, 'badgeId', badgeId);
  return { deleted: badgeId };
}

/** Delete a reward definition (past redemptions stay in the points ledger). */
function deleteReward(rewardId) {
  if (!findOne(SHEETS.REWARDS, 'rewardId', rewardId)) throw new Error('Reward not found.');
  deleteWhere(SHEETS.REWARDS, 'rewardId', rewardId);
  return { deleted: rewardId };
}
