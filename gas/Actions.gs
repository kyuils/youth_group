// Actions.gs — action handlers invoked by Code.gs router.

function handleWhoami(body) {
  return authenticate(body); // already returns shape { ok, email, teacher, role }
}

// Minimal roster fields (PII reduced — Section 6.3).
const ROSTER_FIELDS = ['id', '이름', '학년', '성별'];

function handleGetRoster(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
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
  if (String(s['반']).trim() !== auth.teacher.trim()) {
    return { ok: false, code: 'forbidden' };
  }
  const detail = {};
  ['id','이름','성별','연락처','생년월일','초등학교','학교','학년','신급','부/모','부모님연락처','비고','주소']
    .forEach((f) => detail[f] = s[f]);
  return { ok: true, student: detail };
}

// Attendance =============================================

const ATT_HEADERS = ['날짜', '학생id', '학생이름', '반', '상태', '기록자email', '기록시각'];

function handleGetAttendance(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const year = Number(body.year) || new Date().getFullYear();
  const { rows } = readTable_(SHEET_NAMES.ATTENDANCE);
  const out = rows
    .filter((r) => String(r['반']).trim() === auth.teacher.trim())
    .filter((r) => {
      const ds = formatDate_(r['날짜']);
      const y = ds.length >= 4 ? Number(ds.substring(0, 4)) : 0;
      return y === year;
    })
    .map((r) => ({
      date: formatDate_(r['날짜']),
      studentId: String(r['학생id']),
      status: String(r['상태']),
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
  const { date, studentId, status } = body;
  if (!date || !studentId || status === undefined) {
    return { ok: false, code: 'bad_request' };
  }
  const student = findStudentById_(studentId);
  if (!student) return { ok: false, code: 'not_found' };
  if (String(student['반']).trim() !== auth.teacher.trim()) {
    return { ok: false, code: 'forbidden' };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    upsertAttendance_({
      date, studentId,
      studentName: student['이름'],
      teacher: auth.teacher,
      status, recorder: auth.email,
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
    const s = findStudentById_(it.studentId);
    if (!s) return { ok: false, code: 'not_found', studentId: it.studentId };
    if (String(s['반']).trim() !== auth.teacher.trim()) {
      return { ok: false, code: 'forbidden', studentId: it.studentId };
    }
    resolved.push({ student: s, status: it.status });
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
        teacher: auth.teacher,
        status: r.status,
        recorder: auth.email,
      });
      written++;
    });
  } finally { lock.releaseLock(); }
  return { ok: true, written };
}

function upsertAttendance_({ date, studentId, studentName, teacher, status, recorder }) {
  const sh = getSheet_(SHEET_NAMES.ATTENDANCE);
  const last = sh.getLastRow();
  const key = date + '|' + studentId;
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
  const values = [date, String(studentId), studentName, teacher, status, recorder, now];
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
        return { ok: false, code: 'forbidden' };
      }
      const updated = Object.assign({}, target, {
        '내용': text !== undefined ? text : target['내용'],
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
        '내용': text || '', 'active': true,
      };
      appendRow_(SHEET_NAMES.PRAYERS, rowFromObj_(PRAYER_HEADERS, obj));
      return { ok: true, id: newId };
    }
  } finally { lock.releaseLock(); }
}
