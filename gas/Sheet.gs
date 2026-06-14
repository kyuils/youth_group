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
  NEWCOMER: '새가족부',          // v1.4: 새가족 전용 탭 (등록은 여기, 등반 시 RAW_CLASS로 복사)
  RAW_CLASS: '2026 반편성',
};

// v1.4 새가족부 탭 컬럼 순서 (등록·등반·교육 관리용).
const NEWCOMER_HEADERS = ['id','이름','성별','연락처','생년월일','학교','학년','부모님연락처','주소','비고','등반반','등반일','active'];

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

// Phantom-row aware table reader. STUDENTS (ArrayFormula view) carries tens of
// thousands of blank spill rows, so a full-width read of getLastRow() costs
// seconds. Read the key column first (1 col), find the true last data row,
// then read only that many full-width rows (~16x less I/O).
function readTableSmart_(name, keyHeader) {
  const sh = getSheet_(name);
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return { headers: [], rows: [] };
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const lastMeta = sh.getLastRow();
  if (lastMeta < 2) return { headers, rows: [] };
  const keyIdx = headers.indexOf(keyHeader);
  let lastData = lastMeta;
  if (keyIdx >= 0) {
    const keyVals = sh.getRange(2, keyIdx + 1, lastMeta - 1, 1).getValues();
    lastData = 1;
    for (let i = keyVals.length - 1; i >= 0; i--) {
      if (String(keyVals[i][0] == null ? '' : keyVals[i][0]).trim() !== '') { lastData = i + 2; break; }
    }
    if (lastData < 2) return { headers, rows: [] };
  }
  const values = sh.getRange(2, 1, lastData - 1, lastCol).getValues();
  const rows = values.map((row, i) => {
    const obj = { _rowIndex: i + 2 };
    headers.forEach((h, j) => obj[h] = row[j]);
    return obj;
  });
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

// STUDENTS minimal projection loader — single source for the cached
// (id/반/이름/학년/성별/active) list. Smart read skips phantom rows, so a
// cache miss costs one narrow column scan + ~220 full rows instead of 50k.
function loadStudentsMin_() {
  const cache = CacheService.getScriptCache();
  // v3: 연락처 추가 (명단 전화 아이콘 #11 / 현황 결석자 연락 칩). v2 캐시와 키가 달라
  // 배포 직후 자연히 새 프로젝션으로 채워진다.
  let minimal = safeCacheGet_(cache, 'STUDENTS_MIN_v3');
  if (!minimal) {
    const rows = readTableSmart_(SHEET_NAMES.STUDENTS, '이름').rows;
    minimal = rows.map((r) => ({
      id: r.id,
      '반': r['반'],
      '이름': r['이름'],
      '학년': r['학년'],
      '성별': r['성별'],
      '연락처': r['연락처'],
      active: r.active,
    }));
    // 10 min — writes invalidate via invalidateCache_, so longer TTL is safe.
    safeCachePut_(cache, 'STUDENTS_MIN_v3', minimal, 600);
  }
  return minimal;
}

// v1.4: 새가족부 탭 읽기 (객체 배열, _rowIndex 포함). 캐시 5분.
function readNewcomerTab_() {
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(SHEET_NAMES.NEWCOMER);
  if (!sh) return []; // 탭 미생성 시 빈 목록 (마이그레이션 전 하위호환)
  const last = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  if (last < 2 || lastCol < 1) return [];
  const values = sh.getRange(1, 1, last, lastCol).getValues();
  const headers = values[0].map(String);
  return values.slice(1).map((row, i) => {
    const obj = { _rowIndex: i + 2 };
    headers.forEach((h, j) => obj[h] = row[j]);
    return obj;
  }).filter((r) => String(r['이름'] || '').trim() !== '');
}

// 새가족부 학생을 출석/권한 코드가 기대하는 최소 형태로 변환 (반='새가족' 합성).
function newcomerAsMin_(r) {
  return {
    id: r.id,
    '반': '새가족',
    '이름': r['이름'],
    '학년': r['학년'],
    '성별': r['성별'],
    '연락처': r['연락처'],
    active: r.active,
  };
}

function listStudentsForTeacher(teacherName, opts) {
  const minimal = loadStudentsMin_();
  const includeAll = opts && opts.includeAll === true;
  // Filter out blank rows: a row needs both a non-empty 이름 AND a non-empty 반.
  // This prevents phantom rows (sheet pre-allocates blank rows or empty
  // ArrayFormula slots) from being counted as students.
  const hasContent = (r) => String(r['이름'] || '').trim() !== '' && String(r['반'] || '').trim() !== '';
  if (includeAll) {
    return minimal.filter((r) => hasContent(r) && isActive_(r.active));
  }
  return minimal.filter((r) => hasContent(r) && String(r['반']).trim() === teacherName.trim() && isActive_(r.active));
}

// v1.4: 새가족부 탭에서 활성 새가족 읽기. graduated 플래그/등반정보 포함.
function listNewcomers() {
  return readNewcomerTab_()
    .filter((r) => isActive_(r.active))
    .map((r) => ({
      id: r.id,
      '반': '새가족',
      '이름': r['이름'],
      '학년': r['학년'],
      '성별': r['성별'],
      '연락처': r['연락처'],
      graduatedTo: String(r['등반반'] || ''),
      graduatedOn: r['등반일'] ? formatDate_(r['등반일']) : '',
      _rowIndex: r._rowIndex,
    }));
}

function getNextStudentId_() {
  let maxId = 0;
  const scan = (sh) => {
    if (!sh) return;
    const last = sh.getLastRow();
    if (last < 2) return;
    const vals = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      const n = Number(vals[i][0]);
      if (!isNaN(n) && n > maxId) maxId = n;
    }
  };
  const ss = getSpreadsheet_();
  const raw = ss.getSheetByName(SHEET_NAMES.RAW_CLASS);
  if (!raw) throw new Error('Sheet not found: ' + SHEET_NAMES.RAW_CLASS);
  scan(raw);
  scan(ss.getSheetByName(SHEET_NAMES.NEWCOMER)); // 새가족부 id와도 충돌 방지
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

// v1.4: 새가족 등록은 별도 '새가족부' 탭에 기록 (등반 시 RAW_CLASS로 복사).
function appendNewcomerRow_(obj) {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.NEWCOMER);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.NEWCOMER + ' (마이그레이션 migration_v14_newcomer_tab 실행 필요)');
  // NEWCOMER_HEADERS 순서: id,이름,성별,연락처,생년월일,학교,학년,부모님연락처,주소,비고,등반반,등반일,active
  const rowObj = {
    id: obj['번호'],
    '이름': sanitizeCell_(obj['이름']),
    '성별': sanitizeCell_(obj['성별']),
    '연락처': sanitizeCell_(obj['연락처']),
    '생년월일': sanitizeCell_(obj['생년월일']),
    '학교': sanitizeCell_(obj['학교']),
    '학년': sanitizeCell_(obj['학년']),
    '부모님연락처': sanitizeCell_(obj['부모님연락처']),
    '주소': sanitizeCell_(obj['주소']),
    '비고': sanitizeCell_(obj['비고'] || ''),
    '등반반': '',
    '등반일': '',
    'active': true,
  };
  sh.appendRow(rowFromObj_(NEWCOMER_HEADERS, rowObj));
}

// 새가족부 학생 한 명을 RAW_CLASS(2026 반편성)로 복사 — 등반 시. 같은 id 사용해
// 출석 이력(studentId 키)이 그대로 이어진다. P열(반)에 교사명을 넣어 교사 명단에 노출.
function copyNewcomerToRawSheet_(studentId, newTeacher) {
  const nc = readNewcomerTab_().find((r) => String(r.id) === String(studentId));
  if (!nc) throw new Error('새가족부에서 학생을 찾을 수 없습니다: ' + studentId);
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.RAW_CLASS);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.RAW_CLASS);
  // 이미 RAW_CLASS에 같은 id가 있으면 (중복 복사 방지) P열만 갱신.
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = sh.getRange(2, 1, last - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(studentId)) {
        sh.getRange(i + 2, 16).setValue(sanitizeCell_(newTeacher)); // P=반
        return;
      }
    }
  }
  // RAW_CLASS 컬럼: A=번호,B=교사명,C=이름,D=출결,E=성별,F=연락처,G=생년월일,
  //   H=초등학교,I=학교,J=학년,K=신급,L=부/모,M=부모님연락처,N=비고,O=주소,P=반
  const row = [
    nc.id,                               // A
    sanitizeCell_(newTeacher),           // B 교사명
    sanitizeCell_(nc['이름']),           // C
    '',                                  // D 출결
    sanitizeCell_(nc['성별']),           // E
    sanitizeCell_(nc['연락처']),         // F
    sanitizeCell_(nc['생년월일']),       // G
    '',                                  // H 초등학교
    sanitizeCell_(nc['학교']),           // I
    sanitizeCell_(nc['학년']),           // J
    '',                                  // K 신급
    '',                                  // L 부/모
    sanitizeCell_(nc['부모님연락처']),   // M
    sanitizeCell_(nc['비고']),           // N
    sanitizeCell_(nc['주소']),           // O
    sanitizeCell_(newTeacher),           // P 반=교사명
  ];
  // 팬텀 행 회피: 이름 컬럼(C)을 위로 스캔해 실제 마지막 데이터 행을 찾는다.
  const lastMetaRow = sh.getLastRow();
  let lastDataRow = 2;
  if (lastMetaRow >= 3) {
    const names = sh.getRange(3, 3, lastMetaRow - 2, 1).getValues();
    for (let i = names.length - 1; i >= 0; i--) {
      if (String(names[i][0] == null ? '' : names[i][0]).trim() !== '') { lastDataRow = i + 3; break; }
    }
  }
  sh.getRange(lastDataRow + 1, 1, 1, row.length).setValues([row]);
}

// 새가족부 행에 등반반/등반일 기록 (등반 후에도 명단에 남아 배경색으로 구분 — 새가족#4).
function markNewcomerGraduated_(studentId, newTeacher) {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.NEWCOMER);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.NEWCOMER);
  const last = sh.getLastRow();
  if (last < 2) return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const idCol = headers.indexOf('id');
  const gradClassCol = headers.indexOf('등반반');
  const gradDateCol = headers.indexOf('등반일');
  const ids = sh.getRange(2, idCol + 1, last - 1, 1).getValues();
  const today = formatDate_(new Date());
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(studentId)) {
      const row = i + 2;
      if (gradClassCol >= 0) sh.getRange(row, gradClassCol + 1).setValue(sanitizeCell_(newTeacher));
      if (gradDateCol >= 0) sh.getRange(row, gradDateCol + 1).setValue(today);
      return;
    }
  }
}

// 새가족부 행 부분 수정 (학생 정보 편집 #5 — 새가족 대상).
function updateNewcomerRow_(studentId, fields) {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.NEWCOMER);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.NEWCOMER);
  const last = sh.getLastRow();
  if (last < 2) return false;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const idCol = headers.indexOf('id');
  const ids = sh.getRange(2, idCol + 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(studentId)) {
      const row = i + 2;
      Object.keys(fields).forEach((k) => {
        const c = headers.indexOf(k);
        if (c >= 0) sh.getRange(row, c + 1).setValue(sanitizeCell_(fields[k]));
      });
      return true;
    }
  }
  return false;
}

// RAW_CLASS(2026 반편성) 고정 컬럼 매핑 — appendNewcomerRow_/updateClassInRawSheet_와
// 동일한 검증된 레이아웃. RAW_CLASS는 헤더가 1~2행일 수 있어 헤더명 조회 대신 위치를 쓴다.
// A=1 번호(id), B=2 교사명, C=3 이름, D=4 출결, E=5 성별, F=6 연락처, G=7 생년월일,
// H=8 초등학교, I=9 학교, J=10 학년, K=11 신급, L=12 부/모, M=13 부모님연락처, N=14 비고, O=15 주소, P=16 반
const RAW_CLASS_COL = {
  '이름': 3, '성별': 5, '연락처': 6, '생년월일': 7, '초등학교': 8, '학교': 9,
  '학년': 10, '신급': 11, '부/모': 12, '부모님연락처': 13, '비고': 14, '주소': 15,
};

// RAW_CLASS 학생 정보 수정 (학생 정보 편집 #5 — 일반 학생 대상). id(A)/반(P)은 변경하지 않는다.
function updateStudentInRawSheet_(studentId, fields) {
  const sh = getSpreadsheet_().getSheetByName(SHEET_NAMES.RAW_CLASS);
  if (!sh) throw new Error('Sheet not found: ' + SHEET_NAMES.RAW_CLASS);
  const last = sh.getLastRow();
  if (last < 2) return false;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues(); // A=번호(id)
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(studentId)) {
      const row = i + 2;
      Object.keys(fields).forEach((k) => {
        const col = RAW_CLASS_COL[k];
        if (col) sh.getRange(row, col).setValue(sanitizeCell_(fields[k]));
      });
      return true;
    }
  }
  return false;
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
  sh.getRange(targetRow, 16).setValue(sanitizeCell_(newTeacher));
  // Update N column (col 14): remove [새가족] prefix, append [등반: YYYY-MM-DD] note
  const noteCell = sh.getRange(targetRow, 14);
  let note = String(noteCell.getValue() || '');
  if (note.startsWith('[새가족] ')) {
    note = note.substring('[새가족] '.length).trimStart();
  } else if (note.startsWith('[새가족]')) {
    note = note.substring('[새가족]'.length).trimStart();
  }
  // Append graduation date marker so 2026 반편성 sheet alone tells the full story.
  const d = new Date();
  const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const marker = '[등반:' + dateStr + ' → ' + newTeacher + ']';
  note = (note ? note + ' ' : '') + marker;
  noteCell.setValue(sanitizeCell_(note));
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
  const student = findStudentMinById_(studentId);
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
  const student = findStudentMinById_(studentId);
  const studentName = student ? String(student['이름'] || '') : '';
  sh.appendRow([
    String(studentId), studentName,
    false, false, false, false, '', '', '', '',
    todayDate, targetTeacher, recorder, now,
  ]);
}

// Full-row lookup (all PII columns) — for getStudentDetail. v1.4: 새가족부 탭도 조회.
function findStudentById_(id) {
  const all = readTableSmart_(SHEET_NAMES.STUDENTS, '이름').rows;
  const found = all.find((r) => String(r.id) === String(id));
  if (found) return found;
  // 등반 전 새가족은 STUDENTS(2026 반편성)에 없으므로 새가족부 탭에서 찾아 반='새가족'으로 반환.
  const nc = readNewcomerTab_().find((r) => String(r.id) === String(id));
  if (nc) {
    const out = {};
    Object.keys(nc).forEach((k) => { out[k] = nc[k]; });
    out['반'] = '새가족';
    return out;
  }
  return undefined;
}

// Cached minimal lookup (id/반/이름/학년/성별/연락처/active) — for permission checks
// and attendance writes. v1.4: STUDENTS에 없으면 새가족부 탭에서 찾는다.
function findStudentMinById_(id) {
  const inStudents = loadStudentsMin_().find((r) => String(r.id) === String(id));
  if (inStudents) return inStudents;
  const nc = readNewcomerTab_().find((r) => String(r.id) === String(id) && isActive_(r.active));
  return nc ? newcomerAsMin_(nc) : null;
}

function invalidateCache_(keys) {
  const c = CacheService.getScriptCache();
  (keys || ['STUDENTS_MIN_v3', 'TEACHERS_v1', 'ATT_IDX_v1']).forEach((k) => c.remove(k));
}
