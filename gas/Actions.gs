// Actions.gs — action handlers invoked by Code.gs router.

function handleWhoami(body) {
  // authenticate now includes title and permissions
  return authenticate(body);
}

// Minimal roster fields (PII reduced — Section 6.3).
// v1.4: 연락처 추가 — 명단 전화 아이콘(#11) / 현황 결석자 연락 칩.
const ROSTER_FIELDS = ['id', '이름', '학년', '성별', '연락처'];

function handleGetRoster(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;

  const classFilter = body.classFilter;
  // admin with classFilter='all' → return all students
  if (hasPerm_(auth, 'read_all') && classFilter === 'all') {
    const students = listStudentsForTeacher(null, { includeAll: true }).map((s) => {
      const out = {};
      ROSTER_FIELDS.forEach((f) => out[f] = s[f]);
      out['반'] = s['반'];
      return out;
    });
    return { ok: true, teacher: auth.teacher, students };
  }
  // admin with specific classFilter → show that class
  if (hasPerm_(auth, 'read_all') && classFilter && classFilter !== 'all') {
    const students = listStudentsForTeacher(classFilter).map((s) => {
      const out = {};
      ROSTER_FIELDS.forEach((f) => out[f] = s[f]);
      return out;
    });
    return { ok: true, teacher: classFilter, students };
  }
  // Default: own class
  const students = listStudentsForTeacher(auth.teacher).map((s) => {
    const out = {};
    ROSTER_FIELDS.forEach((f) => out[f] = s[f]);
    return out;
  });
  return { ok: true, teacher: auth.teacher, students };
}

function handleGetStudentDetail(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const s = findStudentById_(body.studentId);
  if (!s) return { ok: false, code: 'not_found' };
  // Admin may inspect any student detail. Others must own the class, or the
  // student is a 새가족 and they have write_newcomer permission.
  const isOwn = String(s['반']).trim() === auth.teacher.trim();
  const isAdmin = hasPerm_(auth, 'read_all');
  const isNewcomerAndStaff = String(s['반']).trim() === '새가족' && hasPerm_(auth, 'write_newcomer');
  if (!isOwn && !isAdmin && !isNewcomerAndStaff) {
    logForbidden_(auth, 'getStudentDetail', body);
    return { ok: false, code: 'forbidden' };
  }
  const detail = {};
  ['id','이름','성별','연락처','생년월일','초등학교','학교','학년','신급','부/모','부모님연락처','비고','주소']
    .forEach((f) => detail[f] = s[f]);
  return { ok: true, student: detail };
}

// Attendance =============================================

// v1.1: 8 columns (F=기타내용 inserted between 상태 and 기록자email)
const ATT_HEADERS = ['날짜', '학생id', '학생이름', '반', '상태', '기타내용', '기록자email', '기록시각'];
const VALID_STATUSES = ['P2', 'P3', 'P4', 'ETC', 'ABSENT'];

function handleGetAttendance(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const year = Number(body.year) || new Date().getFullYear();
  const classFilter = body.classFilter;
  const isAllAdmin = hasPerm_(auth, 'read_all') && classFilter === 'all';

  // Cache per (teacher, year). Skips cache for admin-all view because the
  // payload would exceed CacheService 100KB limit.
  const cache = CacheService.getScriptCache();
  const cacheKey = isAllAdmin
    ? null
    : 'ATT_v1_' + auth.teacher + '_' + year;
  if (cacheKey) {
    const hit = safeCacheGet_(cache, cacheKey);
    if (hit) return { ok: true, year, rows: hit, _cached: true };
  }

  const { rows } = readTable_(SHEET_NAMES.ATTENDANCE);
  const out = rows
    .filter((r) => isAllAdmin || String(r['반']).trim() === auth.teacher.trim())
    .filter((r) => {
      const ds = formatDate_(r['날짜']);
      const y = ds.length >= 4 ? Number(ds.substring(0, 4)) : 0;
      return y === year;
    })
    // Skip cleared rows (status '') left behind by NONE/undo — they must not
    // count as a 예배 date in stats/records.
    .filter((r) => String(r['상태'] || '').trim() !== '')
    .map((r) => ({
      date: formatDate_(r['날짜']),
      studentId: String(r['학생id']),
      status: String(r['상태']),
      etcText: String(r['기타내용'] || ''),
      teacher: String(r['반']),
    }));
  if (cacheKey) safeCachePut_(cache, cacheKey, out, 300); // 5 min
  return { ok: true, year, rows: out };
}

// Invalidate attendance cache for a (teacher, year) pair after a write.
function invalidateAttendanceCache_(teacher, year) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('ATT_v1_' + teacher + '_' + year);
  } catch (e) { /* ignore */ }
}

function formatDate_(v) {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v);
}

function handleSetAttendance(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const { date, studentId, status, etcText } = body;
  if (!date || !studentId || status === undefined) {
    return { ok: false, code: 'bad_request' };
  }
  // 'NONE' clears the record (bulk-undo for rows that had no prior status).
  if (VALID_STATUSES.indexOf(status) < 0 && status !== 'NONE') {
    return { ok: false, code: 'bad_request', message: 'invalid status: ' + status };
  }
  // Minimal cached lookup — attendance write only needs 이름/반, not full PII row.
  const student = findStudentMinById_(studentId);
  if (!student) return { ok: false, code: 'not_found' };
  // Allow teacher for own class, or newcomer_staff/admin for 새가족 class, or admin for any
  const studentClass = String(student['반']).trim();
  const isOwnClass = studentClass === auth.teacher.trim();
  const isNewcomerClass = studentClass === '새가족' && hasPerm_(auth, 'write_newcomer');
  const isAdmin = hasPerm_(auth, 'read_all');
  if (!isOwnClass && !isNewcomerClass && !isAdmin) {
    logForbidden_(auth, 'setAttendance', body);
    return { ok: false, code: 'forbidden' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    upsertAttendance_({
      date, studentId,
      studentName: student['이름'],
      teacher: studentClass,
      status,
      etcText: (status === 'ETC' || status === 'ABSENT') ? (etcText || '') : '',
      recorder: auth.email,
    });
  } finally { lock.releaseLock(); }
  // Invalidate cache for the affected (class, year) so the next read reflects the write.
  const dateYear = Number(String(date).substring(0, 4));
  if (dateYear) invalidateAttendanceCache_(studentClass, dateYear);
  return { ok: true };
}

function handleSetAttendanceBatch(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const { date, items } = body;
  if (!date || !Array.isArray(items)) return { ok: false, code: 'bad_request' };
  // Pre-validate every item before writing anything. Atomic refusal on any cross-class id.
  const resolved = [];
  for (const it of items) {
    if (VALID_STATUSES.indexOf(it.status) < 0 && it.status !== 'NONE') {
      return { ok: false, code: 'bad_request', message: 'invalid status: ' + it.status };
    }
    const s = findStudentMinById_(it.studentId);
    if (!s) return { ok: false, code: 'not_found', studentId: it.studentId };
    const studentClass = String(s['반']).trim();
    const isOwnClass = studentClass === auth.teacher.trim();
    const isNewcomerClass = studentClass === '새가족' && hasPerm_(auth, 'write_newcomer');
    const isAdmin = hasPerm_(auth, 'read_all');
    if (!isOwnClass && !isNewcomerClass && !isAdmin) {
      logForbidden_(auth, 'setAttendanceBatch', { studentId: it.studentId });
      return { ok: false, code: 'forbidden', studentId: it.studentId };
    }
    resolved.push({ student: s, studentClass, status: it.status, etcText: it.etcText || '' });
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let written = 0;
  const touchedClasses = new Set();
  try {
    resolved.forEach((r) => {
      upsertAttendance_({
        date,
        studentId: r.student.id,
        studentName: r.student['이름'],
        teacher: r.studentClass,
        status: r.status,
        etcText: (r.status === 'ETC' || r.status === 'ABSENT') ? r.etcText : '',
        recorder: auth.email,
      });
      touchedClasses.add(r.studentClass);
      written++;
    });
  } finally { lock.releaseLock(); }
  // Invalidate cache for every (touched class, year)
  const dateYear = Number(String(date).substring(0, 4));
  if (dateYear) touchedClasses.forEach(function(c){ invalidateAttendanceCache_(c, dateYear); });
  return { ok: true, written };
}

function upsertAttendance_({ date, studentId, studentName, teacher, status, etcText, recorder }) {
  const sh = getSheet_(SHEET_NAMES.ATTENDANCE);
  const last = sh.getLastRow();
  const key = date + '|' + String(studentId);
  const cache = CacheService.getScriptCache();
  const idxKey = 'ATT_IDX_v1';
  let idx = JSON.parse(cache.get(idxKey) || 'null');
  if (!idx) {
    idx = {};
    if (last >= 2) {
      const all = sh.getRange(2, 1, last - 1, 2).getValues();
      all.forEach((row, i) => {
        const d = formatDate_(row[0]);
        const sid = String(row[1]);
        idx[d + '|' + sid] = i + 2;
      });
    }
    cache.put(idxKey, JSON.stringify(idx), 21600); // 6h
  }
  const now = new Date().toISOString();
  // 'NONE' keeps the row (ATT_IDX row numbers stay valid — no deletion) but
  // clears the status; reads filter out blank-status rows.
  if (status === 'NONE') { status = ''; etcText = ''; }
  // 8-column order: 날짜, 학생id, 학생이름, 반, 상태, 기타내용, 기록자email, 기록시각
  // sanitizeCell_ on free-text etcText to neutralize formula injection.
  const values = [date, String(studentId), studentName, teacher, status, sanitizeCell_(etcText || ''), recorder, now];
  if (idx[key]) {
    sh.getRange(idx[key], 1, 1, ATT_HEADERS.length).setValues([values]);
  } else {
    sh.appendRow(values);
    idx[key] = sh.getLastRow();
    cache.put(idxKey, JSON.stringify(idx), 21600);
  }
}

// Prayers ================================================

// v1.4: 응답/응답일 컬럼 추가 (기도제목 응답 여부 체크 #1).
const PRAYER_HEADERS = ['id','학생id','반','작성자email','작성시각','수정시각','내용','active','응답','응답일'];

function handleGetPrayers(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  // 새가족부 교사(write_newcomer)는 본인 반이 없으므로 '새가족' 기도제목을 본다 (#8).
  const canNewcomer = hasPerm_(auth, 'write_newcomer');
  const { rows } = readTable_(SHEET_NAMES.PRAYERS);
  const out = rows
    .filter((r) => {
      const cls = String(r['반']).trim();
      return cls === auth.teacher.trim() || (canNewcomer && cls === '새가족');
    })
    .filter((r) => isActive_(r.active))
    .map((r) => ({
      id: String(r.id),
      studentId: String(r['학생id']),
      text: String(r['내용']),
      createdAt: formatDate_(r['작성시각']),
      updatedAt: formatDate_(r['수정시각']),
      author: String(r['작성자email']),
      answered: truthy_(r['응답']),
      answeredOn: r['응답일'] ? formatDate_(r['응답일']) : '',
    }));
  return { ok: true, prayers: out };
}

// boolean 셀 해석 (TRUE/체크 등). isActive_와 달리 빈 값은 false.
function truthy_(v) {
  if (v === true) return true;
  if (v === false || v === undefined || v === null || v === '') return false;
  const s = String(v).trim().toUpperCase();
  return s === 'TRUE' || s === 'Y' || s === 'YES' || s === '1' || s === 'O' || s === '응답';
}

function handleSetPrayer(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const { id, studentId, text, active, answered } = body;
  if (!studentId) return { ok: false, code: 'bad_request' };
  const student = findStudentMinById_(studentId);
  if (!student) return { ok: false, code: 'not_found' };
  const studentClass = String(student['반']).trim();
  // 본인 반, 또는 새가족부 교사가 새가족 학생에 대해 (#8). 관리자도 허용.
  const canWrite = studentClass === auth.teacher.trim()
    || (studentClass === '새가족' && hasPerm_(auth, 'write_newcomer'))
    || hasPerm_(auth, 'read_all');
  if (!canWrite) {
    logForbidden_(auth, 'setPrayer(student)', body);
    return { ok: false, code: 'forbidden' };
  }
  const today = formatDate_(new Date());
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (id) {
      // update
      const { rows } = readTable_(SHEET_NAMES.PRAYERS);
      const target = rows.find((r) => String(r.id) === String(id));
      if (!target) return { ok: false, code: 'not_found' };
      const targetClass = String(target['반']).trim();
      const canEdit = targetClass === auth.teacher.trim()
        || (targetClass === '새가족' && hasPerm_(auth, 'write_newcomer'))
        || hasPerm_(auth, 'read_all');
      if (!canEdit) {
        logForbidden_(auth, 'setPrayer(target)', body);
        return { ok: false, code: 'forbidden' };
      }
      // 응답 토글 시 응답일 자동 기록 (응답 해제 시 비움). 기존값 보존.
      let answeredVal = (answered !== undefined) ? !!answered : truthy_(target['응답']);
      let answeredOn = answeredVal ? (truthy_(target['응답']) && target['응답일'] ? target['응답일'] : today) : '';
      const updated = Object.assign({}, target, {
        '내용': sanitizeCell_(text !== undefined ? text : target['내용']),
        'active': active !== undefined ? active : target.active,
        '수정시각': new Date().toISOString(),
        '응답': answeredVal,
        '응답일': answeredOn,
      });
      updateRowByIndex_(SHEET_NAMES.PRAYERS, target._rowIndex, rowFromObj_(PRAYER_HEADERS, updated));
      return { ok: true, id };
    } else {
      // create — 새가족 학생이면 반='새가족'으로 기록(그룹/조회 일관성).
      const newId = Utilities.getUuid();
      const now = new Date().toISOString();
      const prayerClass = (studentClass === '새가족') ? '새가족' : auth.teacher;
      const obj = {
        id: newId, '학생id': studentId, '반': prayerClass,
        '작성자email': auth.email, '작성시각': now, '수정시각': now,
        '내용': sanitizeCell_(text || ''), 'active': true,
        '응답': !!answered, '응답일': answered ? today : '',
      };
      appendRow_(SHEET_NAMES.PRAYERS, rowFromObj_(PRAYER_HEADERS, obj));
      return { ok: true, id: newId };
    }
  } finally { lock.releaseLock(); }
}

// ====================================================
// v1.1 new action handlers
// ====================================================

function handleGetNewcomers(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  if (!hasPerm_(auth, 'write_newcomer') && !hasPerm_(auth, 'read_all')) {
    return { ok: false, code: 'forbidden' };
  }
  const all = listNewcomers(); // 새가족부 활성 전체 (graduatedOn/To 포함)
  const progressRows = readNewcomerProgress_();
  // 4주 교육 진도 lookup (studentId → {week1..4, dates})
  const progressMap = {};
  progressRows.forEach((p) => {
    progressMap[String(p['학생id'])] = {
      week1: !!p['1주'], week2: !!p['2주'], week3: !!p['3주'], week4: !!p['4주'],
      week1Date: p['1주_날짜'] ? formatDate_(p['1주_날짜']) : '',
      week2Date: p['2주_날짜'] ? formatDate_(p['2주_날짜']) : '',
      week3Date: p['3주_날짜'] ? formatDate_(p['3주_날짜']) : '',
      week4Date: p['4주_날짜'] ? formatDate_(p['4주_날짜']) : '',
    };
  });

  // 출석 오늘 상태 + 이력 맵 — 새가족 카드의 오늘 출석 활성 표시 및 "언제 출석했는지" 표시용.
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const todayMap = {};
  const attByStudent = {};
  readTable_(SHEET_NAMES.ATTENDANCE).rows.forEach((r) => {
    const st = String(r['상태'] || '').trim();
    if (st === '') return;
    const sid = String(r['학생id']);
    const d = formatDate_(r['날짜']);
    if (d === today) todayMap[sid] = st;
    (attByStudent[sid] = attByStudent[sid] || []).push({ date: d, status: st, etcText: String(r['기타내용'] || '') });
  });
  Object.keys(attByStudent).forEach((k) => {
    attByStudent[k].sort((a, b) => (a.date < b.date ? 1 : (a.date > b.date ? -1 : 0))); // 최근 우선
    attByStudent[k] = attByStudent[k].slice(0, 12);
  });

  // 활성(미등반) vs 등반 완료자 분리. 등반자도 새가족부에 남아 배경색 구분(새가족#4).
  const students = all.filter((s) => !s.graduatedOn).map((s) => ({
    id: String(s.id),
    '이름': s['이름'],
    '학년': s['학년'],
    '성별': s['성별'],
    todayStatus: todayMap[String(s.id)] || null,
    attendance: attByStudent[String(s.id)] || [],
    progress: progressMap[String(s.id)] || null,
  }));
  const graduates = all.filter((s) => s.graduatedOn).map((s) => ({
    id: String(s.id),
    '이름': s['이름'],
    '학년': s['학년'],
    graduatedOn: s.graduatedOn,
    graduatedTo: s.graduatedTo,
  }));
  return { ok: true, students, graduates };
}

function handleAddNewcomer(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  if (!hasPerm_(auth, 'write_newcomer') && !hasPerm_(auth, 'read_all')) {
    logForbidden_(auth, 'addNewcomer', body);
    return { ok: false, code: 'forbidden' };
  }
  const { name, gender, phone, birthDate, grade, school, parentPhone, address, note } = body;
  if (!name) return { ok: false, code: 'bad_request', message: '이름 필수' };
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let newId;
  try {
    newId = getNextStudentId_();
    appendNewcomerRow_({
      '번호': newId,
      '이름': name || '',
      '성별': gender || '',
      '연락처': phone || '',
      '생년월일': birthDate || '',
      '학교': school || '',
      '학년': grade || '',
      '부모님연락처': parentPhone || '', // v1.4 fix: 이전엔 항상 공란이었음
      '주소': address || '',
      '비고': note || '',
    });
  } finally { lock.releaseLock(); }
  // Invalidate student cache (key fix: v1 → v3). 새가족부 탭은 캐시하지 않아 즉시 반영.
  invalidateCache_(['STUDENTS_MIN_v3', 'ATT_IDX_v1']);
  return { ok: true, studentId: String(newId) };
}

function handleSetNewcomerProgress(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  if (!hasPerm_(auth, 'write_newcomer') && !hasPerm_(auth, 'read_all')) {
    logForbidden_(auth, 'setNewcomerProgress', body);
    return { ok: false, code: 'forbidden' };
  }
  const { studentId, week, completed } = body;
  if (!studentId || week === undefined) {
    return { ok: false, code: 'bad_request' };
  }
  const weekNum = Number(week);
  if (![1, 2, 3, 4].includes(weekNum)) {
    return { ok: false, code: 'bad_request', message: 'week must be 1-4' };
  }
  // Verify the target studentId actually belongs to the 새가족 class.
  // Without this check, a newcomer_staff member could fabricate progress
  // records for any student in any class.
  const student = findStudentMinById_(studentId);
  if (!student) return { ok: false, code: 'not_found' };
  if (String(student['반']).trim() !== '새가족') {
    logForbidden_(auth, 'setNewcomerProgress(not newcomer class)', body);
    return { ok: false, code: 'forbidden' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    upsertNewcomerProgress_(studentId, weekNum, !!completed, auth.email);
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function handleGraduate(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  if (!hasPerm_(auth, 'graduate') && !hasPerm_(auth, 'read_all')) {
    logForbidden_(auth, 'graduate', body);
    return { ok: false, code: 'forbidden' };
  }
  const { studentId, targetTeacher } = body;
  if (!studentId || !targetTeacher) {
    return { ok: false, code: 'bad_request' };
  }
  // Validate: student must be in 새가족 class
  const student = findStudentMinById_(studentId);
  if (!student) return { ok: false, code: 'not_found', message: '학생을 찾을 수 없습니다' };
  if (String(student['반']).trim() !== '새가족') {
    return { ok: false, code: 'bad_request', message: '새가족 학생만 등반할 수 있습니다' };
  }
  // Validate: targetTeacher must exist in TEACHERS (check by name)
  const cache = CacheService.getScriptCache();
  let teacherRows = safeCacheGet_(cache, 'TEACHERS_v1');
  if (!teacherRows) {
    teacherRows = readTable_(SHEET_NAMES.TEACHERS).rows;
    safeCachePut_(cache, 'TEACHERS_v1', teacherRows, 300);
  }
  const targetExists = teacherRows.some(
    (r) => String(r['이름'] || '').trim() === targetTeacher.trim() && isActive_(r.active)
  );
  if (!targetExists) {
    return { ok: false, code: 'bad_request', message: '대상 교사를 찾을 수 없습니다: ' + targetTeacher };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    // v1.4: 새가족부 → 2026 반편성 복사(교사명 기재) + 새가족부에 등반 기록(배경색 구분용) + 진도시트 기록
    copyNewcomerToRawSheet_(studentId, targetTeacher);
    markNewcomerGraduated_(studentId, targetTeacher);
    recordGraduation_(studentId, targetTeacher, auth.email);
  } finally { lock.releaseLock(); }
  // Invalidate student cache so graduated student appears in the target class roster
  invalidateCache_(['STUDENTS_MIN_v3', 'ATT_IDX_v1']);
  return { ok: true };
}

function handleGetAllAttendance(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  if (!hasPerm_(auth, 'read_all')) {
    return { ok: false, code: 'forbidden' };
  }
  const year = Number(body.year) || new Date().getFullYear();
  const { rows } = readTable_(SHEET_NAMES.ATTENDANCE);
  const out = rows
    .filter((r) => {
      const ds = formatDate_(r['날짜']);
      const y = ds.length >= 4 ? Number(ds.substring(0, 4)) : 0;
      return y === year;
    })
    .filter((r) => String(r['상태'] || '').trim() !== '')
    .map((r) => ({
      date: formatDate_(r['날짜']),
      studentId: String(r['학생id']),
      studentName: String(r['학생이름'] || ''),
      teacher: String(r['반']),
      status: String(r['상태']),
      etcText: String(r['기타내용'] || ''),
      recorder: String(r['기록자email'] || ''),
    }));
  return { ok: true, year, rows: out };
}

function handleGetAllPrayers(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  if (!hasPerm_(auth, 'read_all')) {
    return { ok: false, code: 'forbidden' };
  }
  const { rows } = readTable_(SHEET_NAMES.PRAYERS);
  const out = rows
    .filter((r) => isActive_(r.active))
    .map((r) => ({
      id: String(r.id),
      studentId: String(r['학생id']),
      teacher: String(r['반']),
      text: String(r['내용']),
      createdAt: formatDate_(r['작성시각']),
      updatedAt: formatDate_(r['수정시각']),
      author: String(r['작성자email']),
      answered: truthy_(r['응답']),
      answeredOn: r['응답일'] ? formatDate_(r['응답일']) : '',
    }));
  return { ok: true, prayers: out };
}

function handleGetAllRosters(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  if (!hasPerm_(auth, 'read_all')) {
    return { ok: false, code: 'forbidden' };
  }
  const allStudents = listStudentsForTeacher(null, { includeAll: true });
  const byClass = {};
  allStudents.forEach((s) => {
    const cls = String(s['반'] || '').trim();
    // 새가족은 별도(관리자 새가족 세그먼트)에서 관리 — 반별 통계 오염 방지.
    if (!cls || cls === '새가족') return;
    if (!byClass[cls]) byClass[cls] = [];
    const out = {};
    ROSTER_FIELDS.forEach((f) => out[f] = s[f]);
    byClass[cls].push(out);
  });
  return { ok: true, byClass };
}

// v1.4: 학생 정보 수정 (#5 일반교사=본인 반 / 관리자#5=전체 / 새가족부교사=새가족).
function handleUpdateStudent(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const { studentId, fields } = body;
  if (!studentId || !fields || typeof fields !== 'object') return { ok: false, code: 'bad_request' };
  const student = findStudentMinById_(studentId);
  if (!student) return { ok: false, code: 'not_found' };
  const cls = String(student['반']).trim();
  const isOwn = cls === auth.teacher.trim();
  const isAdmin = hasPerm_(auth, 'read_all');
  const isNewcomerStaff = cls === '새가족' && hasPerm_(auth, 'write_newcomer');
  if (!isOwn && !isAdmin && !isNewcomerStaff) {
    logForbidden_(auth, 'updateStudent', body);
    return { ok: false, code: 'forbidden' };
  }
  // 편집 가능한 필드만 허용 (반/id는 변경 불가 — 등반/관리자만).
  const ALLOWED = ['이름','성별','연락처','생년월일','초등학교','학교','학년','신급','부/모','부모님연락처','주소','비고'];
  const clean = {};
  ALLOWED.forEach((k) => { if (fields[k] !== undefined) clean[k] = fields[k]; });
  if (Object.keys(clean).length === 0) return { ok: false, code: 'bad_request', message: '수정할 항목이 없습니다' };
  // 라우팅은 반 기준: 새가족(미등반)은 새가족부 탭, 그 외(일반/등반자)는 RAW_CLASS.
  // findStudentMinById_가 이미 새가족부를 단일 소스로 보므로 cls가 정확하다.
  const toNewcomerTab = (cls === '새가족');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let ok;
  try {
    ok = toNewcomerTab ? updateNewcomerRow_(studentId, clean) : updateStudentInRawSheet_(studentId, clean);
  } finally { lock.releaseLock(); }
  if (!ok) return { ok: false, code: 'not_found' };
  invalidateCache_(['STUDENTS_MIN_v3']);
  return { ok: true };
}
