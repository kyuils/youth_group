// Sheet.gs — typed sheet I/O helpers.

function isActive_(v) {
  if (v === undefined || v === null || v === '') return true; // empty defaults to active
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v).trim().toUpperCase();
  return s !== 'FALSE' && s !== 'NO' && s !== '0' && s !== 'N';
}

const SHEET_NAMES = {
  STUDENTS: 'STUDENTS',
  TEACHERS: 'TEACHERS',
  ATTENDANCE: 'ATTENDANCE',
  PRAYERS: 'PRAYERS',
  NEWCOMER_PROGRESS: 'NEWCOMER_PROGRESS',
  RAW_CLASS: '2026 반편성',
};

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('SHEET_ID Script Property not set');
  return SpreadsheetApp.openById(id);
}

function getSheet_(name) {
  const sh = getSpreadsheet_().getSheetByName(name);
  if (!sh) throw new Error('Sheet not found: ' + name);
  return sh;
}

// Returns array of objects keyed by header row.
function readTable_(name) {
  const sh = getSheet_(name);
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return { headers: [], rows: [] };
  const last = sh.getLastRow();
  if (last < 2) return { headers: sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String), rows: [] };
  const values = sh.getRange(1, 1, last, lastCol).getValues();
  const headers = values[0].map(String);
  const rows = values.slice(1).map((row) => {
    const obj = { _rowIndex: 0 };
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  rows.forEach((r, i) => r._rowIndex = i + 2); // sheet row number (1-based, header is row 1)
  return { headers, rows };
}

function appendRow_(name, headerOrderedValues) {
  getSheet_(name).appendRow(headerOrderedValues);
}

function updateRowByIndex_(name, rowIndex, headerOrderedValues) {
  const sh = getSheet_(name);
  sh.getRange(rowIndex, 1, 1, headerOrderedValues.length).setValues([headerOrderedValues]);
}

// Build a value array in header order from a partial object.
function rowFromObj_(headers, obj) {
  return headers.map((h) => (obj[h] === undefined ? '' : obj[h]));
}

// CacheService.put has a 100KB per-value limit. Larger payloads throw.
// safeCachePut_ silently skips caching if the payload would exceed that limit
// (or if the cache write fails for any other reason).
function safeCachePut_(cache, key, value, seconds) {
  try {
    if (typeof value !== 'string') value = JSON.stringify(value);
    if (value.length > 95000) return false; // leave headroom under 100KB
    cache.put(key, value, seconds);
    return true;
  } catch (e) {
    return false;
  }
}

function safeCacheGet_(cache, key) {
  try {
    const raw = cache.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// Lookup helpers
function lookupTeacher(email) {
  const cache = CacheService.getScriptCache();
  let rows = safeCacheGet_(cache, 'TEACHERS_v1');
  if (!rows) {
    rows = readTable_(SHEET_NAMES.TEACHERS).rows;
    safeCachePut_(cache, 'TEACHERS_v1', rows, 300); // 5 min
  }
  const lower = String(email).toLowerCase().trim();
  const found = rows.find((r) => String(r.email || '').toLowerCase().trim() === lower && isActive_(r.active));
  if (!found) return null;
  return {
    email: lower,
    name: String(found['이름']),
    role: String(found.role || 'teacher'),
    title: String(found.title || ''),
  };
}

function listStudentsForTeacher(teacherName, opts) {
  const cache = CacheService.getScriptCache();
  // STUDENTS can be large (200+ rows × 15 cols with PII). Cache a minimal
  // projection that fits well under 100KB rather than the raw rows.
  let minimal = safeCacheGet_(cache, 'STUDENTS_MIN_v1');
  if (!minimal) {
    const rows = readTable_(SHEET_NAMES.STUDENTS).rows;
    minimal = rows.map((r) => ({
      id: r.id,
      '반': r['반'],
      '이름': r['이름'],
      '학년': r['학년'],
      '성별': r['성별'],
      active: r.active,
    }));
    safeCachePut_(cache, 'STUDENTS_MIN_v1', minimal, 300);
  }
  const includeAll = opts && opts.includeAll === true;
  if (includeAll) {
    return minimal.filter((r) => isActive_(r.active));
  }
  return minimal.filter((r) => String(r['반']).trim() === teacherName.trim() && isActive_(r.active));
}

function listNewcomers() {
  const cache = CacheService.getScriptCache();
  let minimal = safeCacheGet_(cache, 'STUDENTS_MIN_v1');
  if (!minimal) {
    const rows = readTable_(SHEET_NAMES.STUDENTS).rows;
    minimal = rows.map((r) => ({
      id: r.id,
      '반': r['반'],
      '이름': r['이름'],
      '학년': r['학년'],
      '성별': r['성별'],
      active: r.active,
    }));
    safeCachePut_(cache, 'STUDENTS_MIN_v1', minimal, 300);
  }
  return minimal.filter((r) => String(r['반']).trim() === '새가족' && isActive_(r.active));
}

function getNextStudentId_() {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.RAW_CLASS);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.RAW_CLASS);
  const last = sh.getLastRow();
  if (last < 2) return 1;
  const vals = sh.getRange(2, 1, last - 1, 1).getValues();
  let maxId = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = vals[i][0];
    const n = Number(v);
    if (!isNaN(n) && n > maxId) maxId = n;
  }
  return maxId + 1;
}

// Defense against CSV/Sheet formula injection.
// Google Sheets evaluates cells starting with = + - @ as formulas, which lets
// a malicious whitelisted user smuggle =IMPORTDATA(...) and exfiltrate the
// owner's PII when the sheet is opened or exported. Prefix such inputs with
// a single quote so they are stored as literal text.
function sanitizeCell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function appendNewcomerRow_(obj) {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.RAW_CLASS);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.RAW_CLASS);
  // Column layout: A=번호, B=교사명(공란), C=이름, D=출결(공란), E=성별,
  //   F=연락처, G=생년월일, H=초등학교(공란), I=학교, J=학년, K=신급(공란),
  //   L=부/모(공란), M=부모님연락처, N=비고([새가족] prefix), O=주소, P=반=새가족
  // All free-text fields are passed through sanitizeCell_ to neutralize
  // Google Sheets formula injection (=, +, -, @ prefix).
  const row = [
    obj['번호'],                                  // A (number, safe)
    '',                                           // B 교사명 공란
    sanitizeCell_(obj['이름']),                   // C
    '',                                           // D 출결 공란
    sanitizeCell_(obj['성별']),                   // E
    sanitizeCell_(obj['연락처']),                 // F
    sanitizeCell_(obj['생년월일']),               // G
    '',                                           // H 초등학교 공란
    sanitizeCell_(obj['학교']),                   // I
    sanitizeCell_(obj['학년']),                   // J
    '',                                           // K 신급 공란
    '',                                           // L 부/모 공란
    sanitizeCell_(obj['부모님연락처']),           // M
    '[새가족] ' + sanitizeCell_(obj['비고'] || ''), // N (prefix is constant, OK)
    sanitizeCell_(obj['주소']),                   // O
    '새가족',                                     // P (constant, OK)
  ];
  sh.appendRow(row);
}

function updateClassInRawSheet_(studentId, newTeacher) {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.RAW_CLASS);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.RAW_CLASS);
  const last = sh.getLastRow();
  if (last < 2) return;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  let targetRow = -1;
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(studentId)) {
      targetRow = i + 2;
      break;
    }
  }
  if (targetRow < 0) throw new Error('Student not found in raw sheet: ' + studentId);
  // Update P column (col 16) to newTeacher
  sh.getRange(targetRow, 16).setValue(newTeacher);
  // Remove [새가족] prefix from N column (col 14)
  const noteCell = sh.getRange(targetRow, 14);
  let note = String(noteCell.getValue() || '');
  if (note.startsWith('[새가족] ')) {
    note = note.substring('[새가족] '.length).trimStart();
  } else if (note.startsWith('[새가족]')) {
    note = note.substring('[새가족]'.length).trimStart();
  }
  noteCell.setValue(note);
}

function readNewcomerProgress_() {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.NEWCOMER_PROGRESS);
  if (!sh) return [];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
  const headers = values[0].map(String);
  return values.slice(1).map((row, i) => {
    const obj = { _rowIndex: i + 2 };
    headers.forEach((h, j) => obj[h] = row[j]);
    return obj;
  });
}

function upsertNewcomerProgress_(studentId, week, completed, recorder) {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.NEWCOMER_PROGRESS);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.NEWCOMER_PROGRESS);
  const last = sh.getLastRow();
  const now = new Date().toISOString();
  const todayDate = formatDate_(new Date());
  const weekKey = String(week) + '주';
  const weekDateKey = String(week) + '주_날짜';
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(studentId)) {
        const rowIndex = i + 2;
        // Read existing row to update
        const rowData = sh.getRange(rowIndex, 1, 1, sh.getLastColumn()).getValues()[0];
        const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
        const weekCol = headers.indexOf(weekKey);
        const weekDateCol = headers.indexOf(weekDateKey);
        const recorderCol = headers.indexOf('기록자email');
        const updatedCol = headers.indexOf('갱신시각');
        if (weekCol >= 0) sh.getRange(rowIndex, weekCol + 1).setValue(completed ? true : false);
        if (weekDateCol >= 0) sh.getRange(rowIndex, weekDateCol + 1).setValue(completed ? todayDate : '');
        if (recorderCol >= 0) sh.getRange(rowIndex, recorderCol + 1).setValue(recorder);
        if (updatedCol >= 0) sh.getRange(rowIndex, updatedCol + 1).setValue(now);
        return;
      }
    }
  }
  // Not found — append new row
  const student = findStudentById_(studentId);
  const studentName = student ? String(student['이름'] || '') : '';
  const headers14 = ['학생id','학생이름','1주','2주','3주','4주','1주_날짜','2주_날짜','3주_날짜','4주_날짜','등반일','등반반','기록자email','갱신시각'];
  const newRow = [
    String(studentId), studentName,
    false, false, false, false, '', '', '', '',
    '', '', recorder, now,
  ];
  const weekIdx = headers14.indexOf(weekKey);
  const weekDateIdx = headers14.indexOf(weekDateKey);
  if (weekIdx >= 0) newRow[weekIdx] = completed ? true : false;
  if (weekDateIdx >= 0) newRow[weekDateIdx] = completed ? todayDate : '';
  sh.appendRow(newRow);
}

function recordGraduation_(studentId, targetTeacher, recorder) {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.NEWCOMER_PROGRESS);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.NEWCOMER_PROGRESS);
  const now = new Date().toISOString();
  const todayDate = formatDate_(new Date());
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(studentId)) {
        const rowIndex = i + 2;
        const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
        const gradDateCol = headers.indexOf('등반일');
        const gradClassCol = headers.indexOf('등반반');
        const recorderCol = headers.indexOf('기록자email');
        const updatedCol = headers.indexOf('갱신시각');
        if (gradDateCol >= 0) sh.getRange(rowIndex, gradDateCol + 1).setValue(todayDate);
        if (gradClassCol >= 0) sh.getRange(rowIndex, gradClassCol + 1).setValue(targetTeacher);
        if (recorderCol >= 0) sh.getRange(rowIndex, recorderCol + 1).setValue(recorder);
        if (updatedCol >= 0) sh.getRange(rowIndex, updatedCol + 1).setValue(now);
        return;
      }
    }
  }
  // No progress row yet — create one with graduation info
  const student = findStudentById_(studentId);
  const studentName = student ? String(student['이름'] || '') : '';
  sh.appendRow([
    String(studentId), studentName,
    false, false, false, false, '', '', '', '',
    todayDate, targetTeacher, recorder, now,
  ]);
}

function findStudentById_(id) {
  const all = readTable_(SHEET_NAMES.STUDENTS).rows;
  return all.find((r) => String(r.id) === String(id));
}

function invalidateCache_(keys) {
  const c = CacheService.getScriptCache();
  (keys || ['STUDENTS_MIN_v1', 'TEACHERS_v1', 'ATT_IDX_v1']).forEach((k) => c.remove(k));
}
