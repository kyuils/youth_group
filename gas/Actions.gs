// Actions.gs — action handlers invoked by Code.gs router.

function handleWhoami(body) {
  // authenticate now includes title and permissions
  return authenticate(body);
}

// Minimal roster fields (PII reduced — Section 6.3).
const ROSTER_FIELDS = ['id', '이름', '학년', '성별'];

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
  const { rows } = readTable_(SHEET_NAMES.ATTENDANCE);

  // admin with classFilter='all' can see all classes
  const classFilter = body.classFilter;
  const isAllAdmin = hasPerm_(auth, 'read_all') && classFilter === 'all';

  const out = rows
    .filter((r) => isAllAdmin || String(r['반']).trim() === auth.teacher.trim())
    .filter((r) => {
      const ds = formatDate_(r['날짜']);
      const y = ds.length >= 4 ? Number(ds.substring(0, 4)) : 0;
      return y === year;
    })
    .map((r) => ({
      date: formatDate_(r['날짜']),
      studentId: String(r['학생id']),
      status: String(r['상태']),
      etcText: String(r['기타내용'] || ''),
      teacher: String(r['반']),
    }));
  return { ok: true, year, rows: out };
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
  if (VALID_STATUSES.indexOf(status) < 0) {
    return { ok: false, code: 'bad_request', message: 'invalid status: ' + status };
  }
  const student = findStudentById_(studentId);
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
      etcText: status === 'ETC' ? (etcText || '') : '',
      recorder: auth.email,
    });
  } finally { lock.releaseLock(); }
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
    if (VALID_STATUSES.indexOf(it.status) < 0) {
      return { ok: false, code: 'bad_request', message: 'invalid status: ' + it.status };
    }
    const s = findStudentById_(it.studentId);
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
  try {
    resolved.forEach((r) => {
      upsertAttendance_({
        date,
        studentId: r.student.id,
        studentName: r.student['이름'],
        teacher: r.studentClass,
        status: r.status,
        etcText: r.status === 'ETC' ? r.etcText : '',
        recorder: auth.email,
      });
      written++;
    });
  } finally { lock.releaseLock(); }
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
  // 8-column order: 날짜, 학생id, 학생이름, 반, 상태, 기타내용, 기록자email, 기록시각
  const values = [date, String(studentId), studentName, teacher, status, etcText || '', recorder, now];
  if (idx[key]) {
    sh.getRange(idx[key], 1, 1, ATT_HEADERS.length).setValues([values]);
  } else {
    sh.appendRow(values);
    idx[key] = sh.getLastRow();
    cache.put(idxKey, JSON.stringify(idx), 21600);
  }
}

// Prayers ================================================

const PRAYER_HEADERS = ['id','학생id','반','작성자email','작성시각','수정시각','내용','active'];

function handleGetPrayers(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const { rows } = readTable_(SHEET_NAMES.PRAYERS);
  const out = rows
    .filter((r) => String(r['반']).trim() === auth.teacher.trim())
    .filter((r) => isActive_(r.active))
    .map((r) => ({
      id: String(r.id),
      studentId: String(r['학생id']),
      text: String(r['내용']),
      createdAt: formatDate_(r['작성시각']),
      updatedAt: formatDate_(r['수정시각']),
      author: String(r['작성자email']),
    }));
  return { ok: true, prayers: out };
}

function handleSetPrayer(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const { id, studentId, text, active } = body;
  if (!studentId) return { ok: false, code: 'bad_request' };
  const student = findStudentById_(studentId);
  if (!student) return { ok: false, code: 'not_found' };
  if (String(student['반']).trim() !== auth.teacher.trim()) {
    logForbidden_(auth, 'setPrayer(student)', body);
    return { ok: false, code: 'forbidden' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (id) {
      // update
      const { rows } = readTable_(SHEET_NAMES.PRAYERS);
      const target = rows.find((r) => String(r.id) === String(id));
      if (!target) return { ok: false, code: 'not_found' };
      if (String(target['반']).trim() !== auth.teacher.trim()) {
        logForbidden_(auth, 'setPrayer(target)', body);
        return { ok: false, code: 'forbidden' };
      }
      const updated = Object.assign({}, target, {
        '내용': sanitizeCell_(text !== undefined ? text : target['내용']),
        'active': active !== undefined ? active : target.active,
        '수정시각': new Date().toISOString(),
      });
      updateRowByIndex_(SHEET_NAMES.PRAYERS, target._rowIndex, rowFromObj_(PRAYER_HEADERS, updated));
      return { ok: true, id };
    } else {
      // create
      const newId = Utilities.getUuid();
      const now = new Date().toISOString();
      const obj = {
        id: newId, '학생id': studentId, '반': auth.teacher,
        '작성자email': auth.email, '작성시각': now, '수정시각': now,
        '내용': sanitizeCell_(text || ''), 'active': true,
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
  const students = listNewcomers();
  const progressRows = readNewcomerProgress_();
  // Build progress lookup by studentId
  const progressMap = {};
  progressRows.forEach((p) => {
    progressMap[String(p['학생id'])] = {
      week1: !!p['1주'],
      week2: !!p['2주'],
      week3: !!p['3주'],
      week4: !!p['4주'],
      week1Date: p['1주_날짜'] ? formatDate_(p['1주_날짜']) : '',
      week2Date: p['2주_날짜'] ? formatDate_(p['2주_날짜']) : '',
      week3Date: p['3주_날짜'] ? formatDate_(p['3주_날짜']) : '',
      week4Date: p['4주_날짜'] ? formatDate_(p['4주_날짜']) : '',
      graduatedOn: p['등반일'] ? formatDate_(p['등반일']) : '',
      graduatedTo: String(p['등반반'] || ''),
    };
  });
  const result = students.map((s) => ({
    id: String(s.id),
    '이름': s['이름'],
    '학년': s['학년'],
    '성별': s['성별'],
    progress: progressMap[String(s.id)] || null,
  }));
  return { ok: true, students: result };
}

function handleAddNewcomer(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  if (!hasPerm_(auth, 'write_newcomer') && !hasPerm_(auth, 'read_all')) {
    logForbidden_(auth, 'addNewcomer', body);
    return { ok: false, code: 'forbidden' };
  }
  const { name, gender, phone, birthDate, grade, school, address, note } = body;
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
      '부모님연락처': '',
      '주소': address || '',
      '비고': note || '',
    });
  } finally { lock.releaseLock(); }
  // Invalidate student cache so new student appears
  invalidateCache_(['STUDENTS_MIN_v1', 'ATT_IDX_v1']);
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
  const student = findStudentById_(studentId);
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
  const student = findStudentById_(studentId);
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
    updateClassInRawSheet_(studentId, targetTeacher);
    recordGraduation_(studentId, targetTeacher, auth.email);
  } finally { lock.releaseLock(); }
  // Invalidate student cache so graduated student moves to new class
  invalidateCache_(['STUDENTS_MIN_v1', 'ATT_IDX_v1']);
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
    if (!byClass[cls]) byClass[cls] = [];
    const out = {};
    ROSTER_FIELDS.forEach((f) => out[f] = s[f]);
    byClass[cls].push(out);
  });
  return { ok: true, byClass };
}
