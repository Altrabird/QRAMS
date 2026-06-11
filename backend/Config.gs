/**
 * Config.gs
 * =============================================================================
 * SINGLE SOURCE OF TRUTH for the whole backend.
 *
 * Every sheet name and every column lives here. The rest of the code reads
 * columns BY NAME (never by a hard-coded number), so you can safely add a
 * column to any sheet below and nothing else breaks.
 *
 * Beginner tip: if you want a new field, just add its name to the SCHEMA array
 * for that sheet, re-run `setupDatabase()`, and it appears everywhere.
 * =============================================================================
 */

/** App-wide settings. */
const CONFIG = {
  APP_NAME: 'QRAMS — QR Assignment Management System',
  VERSION: '1.0.0',

  // How long (seconds) to cache hot lookups (token -> task) and the dashboard.
  CACHE_SECONDS: 300,

  // Default master link used if a QR's task somehow has none (safety net).
  FALLBACK_REDIRECT: 'https://www.google.com',

  // The public quiz-player page (part of the frontend on GitHub Pages).
  // New QR codes point HERE — a clean URL with no Google account/sandbox issues.
  PLAYER_URL: 'https://altrabird.github.io/QRAMS/quiz.html',

  // Roles allowed in the system.
  ROLES: ['admin', 'teacher', 'viewer'],
};

/**
 * Sheet (tab) names. Keep them here so a rename is a one-line change.
 */
const SHEETS = {
  USERS: 'Users',
  CAMPAIGNS: 'Campaigns',
  TASKS: 'Tasks',
  STUDENTS: 'Students',
  GROUPS: 'Groups',
  QR_CODES: 'QR_Codes',
  SCAN_LOGS: 'Scan_Logs',
  COMPLETION_LOGS: 'Completion_Logs',
  SETTINGS: 'Settings',
  // ---- Phase 2 stubs (created empty + documented, no UI yet) ----
  POINTS_LOG: 'Points_Log',
  BADGES: 'Badges',
  REWARDS: 'Rewards',
  ATTENDANCE: 'Attendance',
  TEACHER_NOTES: 'Teacher_Notes',
  // ---- Phase 2 (now live) ----
  STUDENT_BADGES: 'Student_Badges', // which pupil earned which badge (1 row each)
  CERTIFICATES: 'Certificates',     // issued, QR-verifiable certificates
  TASK_APPS: 'Task_Apps',           // teacher-pasted quiz/app HTML that QRAMS hosts itself
  QUIZ_QUESTIONS: 'Quiz_Questions', // built-in quiz questions (one row per question)
};

/**
 * Column schema for each sheet (the header row).
 * Order here = column order in the sheet.
 */
const SCHEMA = {
  Users: ['userId', 'name', 'email', 'role', 'pinHash', 'status', 'createdAt'],

  Campaigns: [
    'campaignId', 'name', 'description', 'subject', 'program',
    'startDate', 'endDate', 'status', 'teacherInCharge', 'notes', 'createdAt',
  ],

  Tasks: [
    'taskId', 'campaignId', 'title', 'description', 'subject', 'teacherName',
    'dueDate', 'category', 'masterLink', 'appType', 'completionMode', 'pointsValue',
    'status', 'createdAt', 'updatedAt',
  ],

  Students: ['studentId', 'name', 'className', 'groupId', 'gender', 'notes', 'createdAt'],

  Groups: ['groupId', 'name', 'className', 'memberIds', 'notes', 'createdAt'],

  QR_Codes: [
    'token', 'taskId', 'entityType', 'entityId', 'label', 'className',
    'status', 'progress', 'firstScan', 'lastScan', 'scanCount',
    'completedAt', 'points', 'score', 'maxScore', 'remarks', 'createdAt',
  ],

  Scan_Logs: [
    'logId', 'token', 'taskId', 'entityId', 'timestamp',
    'deviceType', 'userAgent', 'action',
  ],

  Completion_Logs: [
    'logId', 'token', 'taskId', 'entityId', 'method',
    'status', 'score', 'maxScore', 'durationSec', 'evidence', 'reviewedBy', 'notes', 'timestamp',
  ],

  Settings: ['key', 'value', 'updatedAt'],

  // ---- Phase 2 stubs ----
  Points_Log: ['logId', 'entityId', 'taskId', 'points', 'reason', 'timestamp'],
  Badges: ['badgeId', 'name', 'description', 'icon', 'criteria', 'createdAt'],
  Rewards: ['rewardId', 'name', 'description', 'cost', 'type', 'status', 'createdAt'],
  Attendance: ['logId', 'studentId', 'date', 'status', 'recordedBy', 'timestamp'],
  Teacher_Notes: ['noteId', 'entityId', 'taskId', 'author', 'type', 'note', 'timestamp'],

  // ---- Phase 2 (now live) ----
  // One row each time a pupil earns a badge (lets us never award the same one twice).
  Student_Badges: ['logId', 'entityId', 'badgeId', 'reason', 'awardedAt'],
  // One row per issued certificate. `token` is the value the QR on the cert encodes.
  Certificates: [
    'certId', 'token', 'entityId', 'entityName', 'scope', 'scopeId',
    'title', 'issuedBy', 'issuedAt', 'status',
  ],

  // ---- Task output integration ----
  // Quiz/app HTML pasted by a teacher that QRAMS hosts and serves itself.
  Task_Apps: ['taskId', 'html', 'updatedAt'],

  // Built-in quizzes: ONE ROW PER QUESTION — teachers can even edit these
  // directly in the sheet. `correct` is the letter A/B/C/D. Leave optionC/D
  // blank for 2- or 3-option questions.
  Quiz_Questions: ['taskId', 'qNo', 'question', 'optionA', 'optionB', 'optionC', 'optionD', 'correct'],
};

/** Valid status / progress values (used for validation + UI dropdowns). */
const ENUMS = {
  campaignStatus: ['Draft', 'Active', 'Paused', 'Completed', 'Archived'],
  taskStatus: ['Active', 'Paused', 'Completed', 'Archived'],
  qrStatus: ['Active', 'Disabled', 'Completed', 'Expired'],
  progress: ['Not Started', 'Opened', 'Started', 'In Progress', 'Submitted', 'Reviewed', 'Completed'],
  completionMode: ['auto', 'manual', 'form', 'quiz', 'evidence', 'time'],
  entityType: ['student', 'group', 'class', 'teacher', 'event', 'custom'],
  // 'link' = external master link · 'quiz' = built-in quiz (Quiz_Questions sheet,
  // played on the QRAMS player page) · 'hosted' = teacher-pasted HTML served by GAS
  appType: ['link', 'quiz', 'hosted'],
  quizCorrect: ['A', 'B', 'C', 'D'],

  // ---- Phase 2 ----
  // Badge rules live as a short text string in the Badges sheet's `criteria`
  // column. checkBadges() understands these shapes:
  //   'first_scan'        → earned on the pupil's very first scan
  //   'tasks:N'           → earned after completing N tasks   (e.g. 'tasks:5')
  //   'points:N'          → earned after reaching N points    (e.g. 'points:100')
  //   'perfect_campaign'  → earned when every task in a campaign is done
  rewardType: ['privilege', 'item', 'recognition'],
  rewardStatus: ['Active', 'Disabled'],
  certScope: ['task', 'campaign'],
  certStatus: ['Valid', 'Revoked'],
};
