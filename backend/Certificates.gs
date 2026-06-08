/**
 * Certificates.gs  — PRINTABLE, QR-VERIFIABLE CERTIFICATES
 * =============================================================================
 * Phase 2. A teacher issues a certificate to a pupil for finishing a task or a
 * whole campaign. Each certificate gets a random `token`; the printed cert
 * carries a QR encoding  <webapp>/exec?cert=<token>.  Anyone who scans it lands
 * on a verify page proving it's genuine (or that it was revoked / fake).
 *
 * The verify page reuses the SAME doGet redirect pattern as a normal scan, so
 * there's no new infrastructure — see verifyPage() in Code.gs.
 * =============================================================================
 */

/** One certificate by its verify token (used to render / reprint it). */
function getCertificate(token) {
  return findOne(SHEETS.CERTIFICATES, 'token', clean(token));
}

/** All certificates, optionally only those for one task/campaign (scopeId). */
function listCertificates(scopeId) {
  var all = readAll(SHEETS.CERTIFICATES);
  if (!scopeId) return all;
  return all.filter(function (c) { return String(c.scopeId) === String(scopeId); });
}

/**
 * Issue a certificate.
 * payload = {
 *   entityId,            // who it's for (e.g. STU001)
 *   entityName?,         // optional friendly name snapshot
 *   scope: 'task'|'campaign',
 *   scopeId,             // taskId or campaignId
 *   title?,              // optional custom heading
 *   issuedBy?            // teacher name
 * }
 */
function issueCertificate(payload) {
  var scope = ENUMS.certScope.indexOf(payload.scope) !== -1 ? payload.scope : 'task';
  var entityId = clean(payload.entityId);
  if (!entityId) throw new Error('Choose who the certificate is for.');

  // Snapshot a friendly name so the cert still reads well if records change later.
  var entityName = clean(payload.entityName);
  if (!entityName) {
    var stu = findOne(SHEETS.STUDENTS, 'studentId', entityId);
    entityName = stu ? stu.name : entityId;
  }

  // Build a default title from the task/campaign if none was given.
  var title = clean(payload.title);
  if (!title) {
    if (scope === 'campaign') {
      var camp = findOne(SHEETS.CAMPAIGNS, 'campaignId', payload.scopeId);
      title = 'Certificate of Completion — ' + (camp ? camp.name : clean(payload.scopeId));
    } else {
      var task = findOne(SHEETS.TASKS, 'taskId', payload.scopeId);
      title = 'Certificate of Completion — ' + (task ? task.title : clean(payload.scopeId));
    }
  }

  var ids = readAll(SHEETS.CERTIFICATES).map(function (c) { return c.certId; });
  var cert = {
    certId: nextId('CERT', ids),
    token: 'CERT-' + randomSuffix(8),  // the value the verify QR encodes
    entityId: entityId, entityName: entityName,
    scope: scope, scopeId: clean(payload.scopeId),
    title: title, issuedBy: clean(payload.issuedBy),
    issuedAt: nowIso(), status: 'Valid',
  };
  appendRow(SHEETS.CERTIFICATES, cert);
  return cert;
}

/** Mark a certificate as no longer valid (e.g. issued by mistake). */
function revokeCertificate(token) {
  var updated = updateWhere(SHEETS.CERTIFICATES, 'token', clean(token), { status: 'Revoked' });
  if (!updated) throw new Error('Certificate not found.');
  return updated;
}

/**
 * PUBLIC check (no login) used by the verify page when a cert QR is scanned.
 * Returns a small, safe object describing the result.
 */
function verifyCertificate(token) {
  var c = findOne(SHEETS.CERTIFICATES, 'token', clean(token));
  if (!c) return { valid: false, message: 'No certificate matches this code.' };
  if (String(c.status) !== 'Valid') return { valid: false, message: 'This certificate has been revoked.' };
  return {
    valid: true, certId: c.certId, entityName: c.entityName,
    title: c.title, issuedBy: c.issuedBy, issuedAt: c.issuedAt,
  };
}
