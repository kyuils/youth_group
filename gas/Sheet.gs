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
  return { email: lower, name: String(found['이름']), role: String(found.role || 'teacher') };
}

function listStudentsForTeacher(teacherName) {
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
  return minimal.filter((r) => String(r['반']).trim() === teacherName.trim() && isActive_(r.active));
}

function findStudentById_(id) {
  const all = readTable_(SHEET_NAMES.STUDENTS).rows;
  return all.find((r) => String(r.id) === String(id));
}

function invalidateCache_(keys) {
  const c = CacheService.getScriptCache();
  (keys || ['STUDENTS_MIN_v1', 'TEACHERS_v1', 'ATT_IDX_v1']).forEach((k) => c.remove(k));
}
