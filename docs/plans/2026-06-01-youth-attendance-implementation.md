# 청소년부 출석부 v1.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 혜림교회 청소년부 출석부를 단일 HTML + Google Apps Script 백엔드 + Google Sheet 저장소로 구축하여, 14명의 교사가 각자의 Google 계정으로 로그인하고 본인 반 학생의 출석·기도제목을 시트에 누적 기록한다.

**Architecture:** GitHub Pages 호스팅 단일 HTML (React UMD + Babel Standalone, 빌드 도구 없음) → POST text/plain → GAS 웹앱 (배포 = "나로 실행") → ID Token 검증 후 Google Sheet 4개 탭(STUDENTS/TEACHERS/ATTENDANCE/PRAYERS) 직접 R/W. 클라이언트는 시트에 직접 접근하지 않음.

**Tech Stack:**
- Frontend: HTML + React 18 UMD + Babel Standalone + Pretendard
- Backend: Google Apps Script (V8 runtime)
- Storage: Google Sheets
- Auth: Google Identity Services (ID Token) + Apps Script `oauth2.googleapis.com/tokeninfo` 검증
- Hosting: GitHub Pages
- Dev tools: `clasp`(CLI for Apps Script), `git`

**Spec:** [`docs/specs/2026-06-01-youth-attendance-google-sheet-design.md`](../specs/2026-06-01-youth-attendance-google-sheet-design.md)

---

## Phase 0 — 프로젝트 골격과 준비

### Task 0.1: 디렉터리 구조 생성

**Files:**
- Create: `gas/.gitkeep`, `web/.gitkeep`, `docs/ops/.gitkeep`, `.gitignore`, `README.md`

- [ ] **Step 1: 디렉터리 만들고 placeholder 두기**

```powershell
New-Item -ItemType Directory -Force gas, web, docs/ops, .github/workflows | Out-Null
"" | Out-File -Encoding utf8 gas/.gitkeep
"" | Out-File -Encoding utf8 web/.gitkeep
"" | Out-File -Encoding utf8 docs/ops/.gitkeep
```

- [ ] **Step 2: `.gitignore` 작성**

```
# Apps Script clasp
.clasp.json
.clasprc.json
gas/.clasp.json

# Local
_sheet_dump.md
*.local
node_modules/

# OS
.DS_Store
Thumbs.db
```

- [ ] **Step 3: `README.md` 작성 (운영자용 1페이지 요약)**

```markdown
# 혜림교회 청소년부 출석부

14명의 교사가 본인 반 학생의 주일 출석을 구글 시트에 기록하는 웹앱.

- 사용자 페이지: https://<github-user>.github.io/<repo>/
- 데이터: Google Sheet (관리자만 학생 추가/삭제 가능)
- 인증: 구글 계정 (TEACHERS 시트에 등록된 이메일만 접근)

## 빠른 시작 (운영자)
1. [Google Cloud OAuth 셋업](docs/ops/01-setup-google-cloud.md)
2. [시트 4개 탭 만들기](docs/ops/02-setup-sheet-tabs.md)
3. [Apps Script 배포](docs/ops/03-deploy-gas.md)
4. [GitHub Pages 배포](docs/ops/04-deploy-github-pages.md)

## 사용자 (교사)
1. 출석부 URL 접속
2. "구글로 로그인" 클릭
3. 본인 반 학생 출석/기도제목 입력

## 설계 문서
[`docs/specs/2026-06-01-youth-attendance-google-sheet-design.md`](docs/specs/2026-06-01-youth-attendance-google-sheet-design.md)
```

- [ ] **Step 4: 커밋**

```powershell
git add gas/.gitkeep web/.gitkeep docs/ops/.gitkeep .gitignore README.md
git commit -m "chore: bootstrap project skeleton for v1.0"
```

---

### Task 0.2: Google Cloud OAuth Client ID 발급 가이드 작성

운영자(사용자)가 직접 콘솔 작업을 해야 하므로 클릭 시나리오 문서를 만든다.

**Files:**
- Create: `docs/ops/01-setup-google-cloud.md`

- [ ] **Step 1: 가이드 작성**

```markdown
# Google Cloud OAuth Client ID 발급

## 목적
앱이 "구글로 로그인" 버튼을 띄울 때 필요한 OAuth Client ID 를 발급한다.

## 절차

1. https://console.cloud.google.com/ 접속, 본인 구글 계정 로그인.
2. 상단 프로젝트 선택 → "새 프로젝트" → 이름: `hyerim-attendance`.
3. 좌측 메뉴 → "API 및 서비스" → "사용자 인증 정보".
4. 상단 "OAuth 동의 화면 구성" 클릭.
   - User Type: **외부**
   - 앱 이름: `혜림교회 청소년부 출석부`
   - 사용자 지원 이메일: 본인 이메일
   - 개발자 연락처: 본인 이메일
   - 저장 후 "테스트 사용자"에 교사 14명 이메일 추가 (또는 게시 → 검증 면제 신청)
5. 다시 "사용자 인증 정보" → "사용자 인증 정보 만들기" → "OAuth 클라이언트 ID".
   - 애플리케이션 유형: **웹 애플리케이션**
   - 이름: `hyerim-attendance-web`
   - **승인된 JavaScript 원본**:
     - `https://<github-user>.github.io` (Pages 도메인)
     - 커스텀 도메인이 있으면 함께 등록
   - 승인된 리디렉션 URI: 사용 안 함 (GIS 는 popup/FedCM)
6. 발급된 Client ID 를 메모. 형식: `1234567890-abc...apps.googleusercontent.com`

## 출력
- `OAUTH_CLIENT_ID = ...` 1개. 이후 GAS Script Properties 와 `web/index.html` 상수에 입력.
```

- [ ] **Step 2: 커밋**

```powershell
git add docs/ops/01-setup-google-cloud.md
git commit -m "docs: add Google Cloud OAuth setup guide"
```

---

### Task 0.3: 시트 4개 탭 셋업 가이드 작성

**Files:**
- Create: `docs/ops/02-setup-sheet-tabs.md`

- [ ] **Step 1: 가이드 작성**

```markdown
# 구글 시트에 4개 탭 만들기

## 대상 시트
사본: https://docs.google.com/spreadsheets/d/1Pkm6kAYbF6sv8pqVHgz4LmkUNWgus18ylldDebQp7xc/edit

## 새 탭 4개 추가

### STUDENTS
첫 행에 다음 헤더 (정확한 이름, 한 줄):

```
id | 반 | 이름 | 성별 | 연락처 | 생년월일 | 초등학교 | 학교 | 학년 | 신급 | 부/모 | 부모님연락처 | 비고 | 주소 | active
```

기존 `2026년 청소년부 명단` 탭에서 데이터를 복사해 매핑:
- `번호` → `id` (빈 칸은 그대로 두면 마이그레이션 스크립트가 UUID 채움)
- `반` → `반`
- `이름` → `이름`
- ... (생년월일, 학교, 학년, 신급, 부/모, 부모님연락처, 비고, 주소 그대로)
- `active` 컬럼은 모두 `TRUE`

### TEACHERS
```
email | 이름 | role | active
```
- 14명 교사의 행. 이메일은 추후 수집되는 대로 채움.
- 부장 1명은 `role = admin`, 나머지는 `role = teacher`.
- 이메일 미보유 교사는 행은 만들되 email 칸 비워둠 (위임 입력 대상).

### ATTENDANCE
```
날짜 | 학생id | 학생이름 | 반 | 상태 | 기록자email | 기록시각
```
- 데이터 행은 비워둠 (앱이 채움).
- 헤더 행을 색칠하고 1행에 "이 탭은 앱이 자동 입력합니다. 직접 편집 금지" 메모 추가.

### PRAYERS
```
id | 학생id | 반 | 작성자email | 작성시각 | 수정시각 | 내용 | active
```

## 보호 설정

- STUDENTS 의 `id` 컬럼(A열) → 우클릭 → "범위 보호" → 본인만 편집 가능.
- ATTENDANCE 탭 전체 → 우클릭 → "시트 보호" → 본인 + GAS 만 편집 가능 (앱이 쓰므로 본인 권한이면 충분).

## 출력
- 시트 ID 메모. URL 의 `/d/<ID>/edit` 부분. 이후 GAS Script Properties 에 입력.
```

- [ ] **Step 2: 커밋**

```powershell
git add docs/ops/02-setup-sheet-tabs.md
git commit -m "docs: add sheet tabs setup guide"
```

---

## Phase 1 — GAS 백엔드

### Task 1.1: Apps Script manifest 와 라우터 골격

**Files:**
- Create: `gas/appsscript.json`, `gas/Code.gs`

- [ ] **Step 1: `gas/appsscript.json`**

```json
{
  "timeZone": "Asia/Seoul",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request"
  ]
}
```

- [ ] **Step 2: `gas/Code.gs` 라우터**

```javascript
// Code.gs — entry point and action router

const ACTIONS = {
  whoami: handleWhoami,
  getRoster: handleGetRoster,
  getAttendance: handleGetAttendance,
  setAttendance: handleSetAttendance,
  setAttendanceBatch: handleSetAttendanceBatch,
  getPrayers: handleGetPrayers,
  setPrayer: handleSetPrayer,
  getStudentDetail: handleGetStudentDetail,
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    if (!action || !ACTIONS[action]) {
      return jsonOut({ ok: false, code: 'unknown_action', action });
    }
    const handler = ACTIONS[action];
    const result = handler(body);
    return jsonOut(result);
  } catch (err) {
    console.error(err.stack || err);
    return jsonOut({ ok: false, code: 'server_error', message: String(err.message || err) });
  }
}

function doGet(e) {
  // Health check only. The HTML is hosted on GitHub Pages.
  return jsonOut({ ok: true, service: 'hyerim-attendance', version: 'v1.0' });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
```

- [ ] **Step 3: 커밋**

```powershell
git add gas/appsscript.json gas/Code.gs
git commit -m "feat(gas): scaffold doPost router with action dispatch"
```

---

### Task 1.2: ID Token 검증 (Auth.gs) — TDD

**Files:**
- Create: `gas/Auth.gs`, `gas/Tests.gs` (반복 사용)

- [ ] **Step 1: 실패 테스트 작성 (`gas/Tests.gs` 에 추가)**

```javascript
function test_verifyIdToken_rejects_empty_token() {
  const r = verifyIdToken('');
  if (r.ok !== false) throw new Error('expected ok:false for empty token');
  if (r.code !== 'no_token') throw new Error('expected code:no_token, got ' + r.code);
  Logger.log('PASS test_verifyIdToken_rejects_empty_token');
}

function test_verifyIdToken_rejects_garbage() {
  const r = verifyIdToken('not-a-real-jwt');
  if (r.ok !== false) throw new Error('expected ok:false for garbage');
  Logger.log('PASS test_verifyIdToken_rejects_garbage');
}

function runAuthTests() {
  test_verifyIdToken_rejects_empty_token();
  test_verifyIdToken_rejects_garbage();
}
```

- [ ] **Step 2: Apps Script IDE 에서 `runAuthTests` 실행 → ReferenceError 확인** (아직 구현 없음)

- [ ] **Step 3: `gas/Auth.gs` 구현 — tokeninfo 방식 (Section 5.2 A)**

```javascript
// Auth.gs — verifies Google ID Token via tokeninfo endpoint, then maps email to TEACHERS row.

function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    return { ok: false, code: 'no_token' };
  }
  const props = PropertiesService.getScriptProperties();
  const expectedAud = props.getProperty('OAUTH_CLIENT_ID');
  if (!expectedAud) {
    return { ok: false, code: 'server_misconfig', message: 'OAUTH_CLIENT_ID missing' };
  }

  let info;
  try {
    const res = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) {
      return { ok: false, code: 'invalid_token' };
    }
    info = JSON.parse(res.getContentText());
  } catch (e) {
    return { ok: false, code: 'tokeninfo_failed', message: String(e) };
  }

  if (info.aud !== expectedAud) return { ok: false, code: 'aud_mismatch' };
  if (info.iss !== 'accounts.google.com' && info.iss !== 'https://accounts.google.com') {
    return { ok: false, code: 'iss_mismatch' };
  }
  const now = Math.floor(Date.now() / 1000);
  if (Number(info.exp) <= now) return { ok: false, code: 'token_expired' };
  if (!info.email || info.email_verified !== 'true') {
    return { ok: false, code: 'email_unverified' };
  }

  return { ok: true, email: String(info.email).toLowerCase().trim(), name: info.name || '' };
}

// authenticate(body) → { ok, email, teacher, role } | { ok:false, code }
function authenticate(body) {
  const v = verifyIdToken(body && body.idToken);
  if (!v.ok) return v;
  const t = lookupTeacher(v.email);
  if (!t) return { ok: false, code: 'unauthorized', email: v.email };
  return { ok: true, email: v.email, teacher: t.name, role: t.role };
}
```

- [ ] **Step 4: 테스트 재실행** — `runAuthTests()` PASS 2건 (실제 token 검증은 통합 테스트에서)

- [ ] **Step 5: 커밋**

```powershell
git add gas/Auth.gs gas/Tests.gs
git commit -m "feat(gas): add ID Token verification via tokeninfo endpoint"
```

---

### Task 1.3: 시트 R/W 헬퍼 (Sheet.gs)

**Files:**
- Create: `gas/Sheet.gs`

- [ ] **Step 1: `gas/Sheet.gs` 작성**

```javascript
// Sheet.gs — typed sheet I/O helpers.

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
  const last = sh.getLastRow();
  if (last < 2) return { headers: sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0], rows: [] };
  const values = sh.getRange(1, 1, last, sh.getLastColumn()).getValues();
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

// Lookup helpers
function lookupTeacher(email) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('TEACHERS_v1');
  let rows;
  if (cached) {
    rows = JSON.parse(cached);
  } else {
    rows = readTable_(SHEET_NAMES.TEACHERS).rows;
    cache.put('TEACHERS_v1', JSON.stringify(rows), 300); // 5 min
  }
  const lower = String(email).toLowerCase().trim();
  const found = rows.find((r) => String(r.email || '').toLowerCase().trim() === lower && r.active !== false && r.active !== 'FALSE');
  if (!found) return null;
  return { email: lower, name: String(found['이름']), role: String(found.role || 'teacher') };
}

function listStudentsForTeacher(teacherName) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'STUDENTS_v1';
  let rows;
  const cached = cache.get(cacheKey);
  if (cached) {
    rows = JSON.parse(cached);
  } else {
    rows = readTable_(SHEET_NAMES.STUDENTS).rows;
    cache.put(cacheKey, JSON.stringify(rows), 300);
  }
  return rows.filter((r) => String(r['반']).trim() === teacherName.trim() && r.active !== false && r.active !== 'FALSE');
}

function findStudentById_(id) {
  const all = readTable_(SHEET_NAMES.STUDENTS).rows;
  return all.find((r) => String(r.id) === String(id));
}

function invalidateCache_(keys) {
  const c = CacheService.getScriptCache();
  (keys || ['STUDENTS_v1', 'TEACHERS_v1']).forEach((k) => c.remove(k));
}
```

- [ ] **Step 2: Sheet smoke test 추가 (`gas/Tests.gs`)**

```javascript
function test_lookupTeacher_returns_null_for_unknown() {
  const r = lookupTeacher('nobody@nowhere.com');
  if (r !== null) throw new Error('expected null for unknown email');
  Logger.log('PASS test_lookupTeacher_returns_null_for_unknown');
}

function runSheetTests() {
  test_lookupTeacher_returns_null_for_unknown();
}
```

Apps Script IDE 에서 `runSheetTests` 실행 (시트에 TEACHERS 탭만 있어도 통과).

- [ ] **Step 3: 커밋**

```powershell
git add gas/Sheet.gs gas/Tests.gs
git commit -m "feat(gas): add typed sheet I/O helpers with cache"
```

---

### Task 1.4: Actions — whoami / getRoster

**Files:**
- Create: `gas/Actions.gs`

- [ ] **Step 1: `gas/Actions.gs` 작성 (whoami, getRoster)**

```javascript
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
```

- [ ] **Step 2: 커밋**

```powershell
git add gas/Actions.gs
git commit -m "feat(gas): implement whoami, getRoster, getStudentDetail actions"
```

---

### Task 1.5: Actions — getAttendance / setAttendance / setAttendanceBatch

**Files:**
- Modify: `gas/Actions.gs` (append)

- [ ] **Step 1: 출석 액션 추가**

```javascript
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
      const d = String(r['날짜']);
      // Accept both 'YYYY-MM-DD' string and Date object
      const y = d.length >= 4 ? Number(d.substring(0, 4)) :
                (r['날짜'] instanceof Date ? r['날짜'].getFullYear() : 0);
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
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  let written = 0;
  try {
    items.forEach((it) => {
      const s = findStudentById_(it.studentId);
      if (!s) return;
      if (String(s['반']).trim() !== auth.teacher.trim()) return;
      upsertAttendance_({
        date, studentId: it.studentId,
        studentName: s['이름'], teacher: auth.teacher,
        status: it.status, recorder: auth.email,
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
  const values = [date, studentId, studentName, teacher, status, recorder, now];
  if (idx[key]) {
    sh.getRange(idx[key], 1, 1, ATT_HEADERS.length).setValues([values]);
  } else {
    sh.appendRow(values);
    idx[key] = sh.getLastRow();
    cache.put(idxKey, JSON.stringify(idx), 21600);
  }
}
```

- [ ] **Step 2: 커밋**

```powershell
git add gas/Actions.gs
git commit -m "feat(gas): implement attendance get/set/batch with row index cache + LockService"
```

---

### Task 1.6: Actions — getPrayers / setPrayer

**Files:**
- Modify: `gas/Actions.gs` (append)

- [ ] **Step 1: 기도제목 액션 추가**

```javascript
// Prayers ================================================

const PRAYER_HEADERS = ['id','학생id','반','작성자email','작성시각','수정시각','내용','active'];

function handleGetPrayers(body) {
  const auth = authenticate(body);
  if (!auth.ok) return auth;
  const { rows } = readTable_(SHEET_NAMES.PRAYERS);
  const out = rows
    .filter((r) => String(r['반']).trim() === auth.teacher.trim())
    .filter((r) => r.active !== false && r.active !== 'FALSE')
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
      const { headers, rows } = readTable_(SHEET_NAMES.PRAYERS);
      const target = rows.find((r) => String(r.id) === String(id));
      if (!target) return { ok: false, code: 'not_found' };
      const updated = Object.assign({}, target, {
        '내용': text !== undefined ? text : target['내용'],
        'active': active !== undefined ? active : target.active,
        '수정시각': new Date().toISOString(),
      });
      updateRowByIndex_(SHEET_NAMES.PRAYERS, target._rowIndex, rowFromObj_(headers, updated));
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
      const { headers } = readTable_(SHEET_NAMES.PRAYERS);
      appendRow_(SHEET_NAMES.PRAYERS, rowFromObj_(headers, obj));
      return { ok: true, id: newId };
    }
  } finally { lock.releaseLock(); }
}
```

- [ ] **Step 2: 커밋**

```powershell
git add gas/Actions.gs
git commit -m "feat(gas): implement prayer get/set with soft-delete via active flag"
```

---

### Task 1.7: 통합 테스트 — curl 시나리오

**Files:**
- Create: `docs/ops/03-deploy-gas.md`

- [ ] **Step 1: 배포 가이드 + 통합 테스트 가이드 작성**

```markdown
# Apps Script 배포 & 통합 테스트

## 사전 준비
- [Task 0.2 완료](01-setup-google-cloud.md) — OAUTH_CLIENT_ID 확보
- [Task 0.3 완료](02-setup-sheet-tabs.md) — 시트 ID 확보, 4개 탭 생성

## 1) clasp 설치 (1회)

```powershell
npm install -g @google/clasp
clasp login
```

## 2) Apps Script 프로젝트 만들기

구글 시트(사본) 열기 → 확장프로그램 → Apps Script.

`scriptId` 메모. (URL `script.google.com/d/<scriptId>/edit`)

로컬 `gas/` 폴더에서:

```powershell
clasp clone <scriptId>
```

(또는 IDE 에서 파일 6개를 손으로 붙여넣기. clasp 가 더 편함.)

## 3) Script Properties 등록

Apps Script IDE → 프로젝트 설정 → 스크립트 속성 추가:

| 속성 | 값 |
|---|---|
| `SHEET_ID` | 사본 시트의 ID |
| `OAUTH_CLIENT_ID` | Task 0.2 에서 발급한 ID |

## 4) 배포

IDE 우상단 "배포" → "새 배포" → 유형 "웹 앱":
- 설명: `v1.0.0`
- 실행: **나** (소유자)
- 액세스: **모든 사용자**

배포되면 웹앱 URL 메모. 형식: `https://script.google.com/macros/s/.../exec`.

## 5) 통합 테스트 — curl

### whoami (토큰 없음 → unauthorized)
```powershell
curl -X POST "<GAS_URL>" -H "Content-Type: text/plain" -d "{\"action\":\"whoami\"}"
```
기대: `{"ok":false,"code":"no_token"}`

### unknown action
```powershell
curl -X POST "<GAS_URL>" -H "Content-Type: text/plain" -d "{\"action\":\"banana\"}"
```
기대: `{"ok":false,"code":"unknown_action","action":"banana"}`

### 헬스체크
```powershell
curl "<GAS_URL>"
```
기대: `{"ok":true,"service":"hyerim-attendance","version":"v1.0"}`

토큰이 있는 시나리오는 클라이언트 배포 후 브라우저 콘솔에서 검증.
```

- [ ] **Step 2: 커밋**

```powershell
git add docs/ops/03-deploy-gas.md
git commit -m "docs: add GAS deploy + curl integration test guide"
```

---

## Phase 2 — 단일 HTML 클라이언트

### Task 2.1: HTML 스켈레톤 + React UMD + Babel + 디자인 토큰

**Files:**
- Create: `web/index.html`

- [ ] **Step 1: HTML 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#0066FF">
  <title>혜림교회 청소년부 출석부</title>
  <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js" crossorigin></script>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">
  <style>
    :root {
      --primary: #0066FF; --primary-strong:#005EEB;
      --bg:#fff; --bg-alt:#F7F7F8;
      --label-normal:#171719; --label-alt:rgba(55,56,60,0.61);
      --line-solid:#E1E2E4; --fill-normal:rgba(112,115,124,0.08);
      --status-positive:#00BF40; --status-cautionary:#FF9200; --status-negative:#FF4242;
      --font-base:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
    }
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    html,body{margin:0;padding:0;height:100%}
    body{font-family:var(--font-base);color:var(--label-normal);background:var(--bg-alt);font-size:16px;line-height:1.5;letter-spacing:-0.01em}
    button{font-family:inherit;cursor:pointer;border:none;background:none;padding:0;color:inherit}
    #root{min-height:100dvh;display:flex;justify-content:center;background:var(--bg-alt)}
    .app{width:100%;max-width:460px;min-height:100dvh;background:#fff;display:flex;flex-direction:column;position:relative;box-shadow:0 0 40px rgba(0,0,0,.06)}
    @media(max-width:460px){.app{box-shadow:none;max-width:100%}}
    /* AppBar */
    .appbar{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.92);backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line-solid);padding:env(safe-area-inset-top) 0 0}
    .appbar-inner{height:56px;display:flex;align-items:center;padding:0 16px;gap:8px}
    .appbar-title{flex:1;display:flex;flex-direction:column;line-height:1.15}
    .appbar-title .sub{font-size:11px;color:var(--label-alt);font-weight:500}
    .appbar-title .main{font-size:17px;font-weight:600}
    /* Buttons */
    .btn{display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 16px;border-radius:12px;font-weight:600;font-size:15px}
    .btn.primary{background:var(--primary);color:#fff}
    .btn.ghost{background:var(--fill-normal);color:var(--label-normal)}
    /* Login screen */
    .login{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;gap:16px;text-align:center}
    .login h1{font-size:22px;margin:0}
    .login p{color:var(--label-alt);margin:0}
    /* Student card */
    .student-card{padding:12px 16px;border:1px solid var(--line-solid);border-radius:14px;margin:8px 16px;display:flex;align-items:center;gap:12px}
    .student-name{font-weight:600}
    .student-meta{font-size:12px;color:var(--label-alt)}
    .student-actions{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .pill{padding:6px 10px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid var(--line-solid);background:#fff}
    .pill.active.s2{background:rgba(0,191,64,.12);border-color:var(--status-positive);color:#007a29}
    .pill.active.s3{background:rgba(0,102,255,.12);border-color:var(--primary);color:#003e99}
    .pill.active.s4{background:rgba(101,65,242,.12);border-color:#5B37ED;color:#3d22a8}
    .pill.active.absent{background:rgba(255,66,66,.12);border-color:var(--status-negative);color:#a30000}
    /* Toast */
    .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#171719;color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;box-shadow:0 4px 24px rgba(0,0,0,.2);z-index:100}
    /* Bottom nav */
    .bottomnav{position:sticky;bottom:0;display:flex;border-top:1px solid var(--line-solid);background:#fff}
    .bottomnav button{flex:1;padding:12px 0;font-size:12px;color:var(--label-alt)}
    .bottomnav button.active{color:var(--primary);font-weight:600}
    /* Loading */
    .loading{flex:1;display:flex;align-items:center;justify-content:center;color:var(--label-alt)}
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    window.APP_CONFIG = {
      GAS_URL: 'REPLACE_WITH_GAS_URL',
      OAUTH_CLIENT_ID: 'REPLACE_WITH_OAUTH_CLIENT_ID',
    };
  </script>
  <script type="text/babel" data-presets="env,react" data-type="module">
    // App code is appended in subsequent tasks.
    function App() {
      return <div className="loading">앱 준비 중…</div>;
    }
    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>
```

- [ ] **Step 2: 브라우저에서 `web/index.html` 열기 → "앱 준비 중…" 표시 확인**

- [ ] **Step 3: 커밋**

```powershell
git add web/index.html
git commit -m "feat(web): scaffold single-file HTML with React UMD + Babel"
```

---

### Task 2.2: API 클라이언트 + 로그인 게이트

**Files:**
- Modify: `web/index.html` (Babel 스크립트 블록 교체)

- [ ] **Step 1: API 함수와 로그인 화면 추가**

`<script type="text/babel" ...>` 블록 안의 `App` 부분을 다음으로 교체:

```jsx
const { useState, useEffect, useCallback, useMemo, useRef } = React;

// API client — text/plain + body (Section 6.1 CORS workaround)
async function callApi(action, payload) {
  const body = JSON.stringify({ action, ...payload });
  const res = await fetch(window.APP_CONFIG.GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  });
  if (!res.ok) throw new Error('네트워크 오류 ' + res.status);
  return res.json();
}

// Google Identity Services — load idToken
function useGoogleAuth() {
  const [idToken, setIdToken] = useState(() => sessionStorage.getItem('idToken') || null);
  const [ready, setReady] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const tryInit = () => {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        setTimeout(tryInit, 100);
        return;
      }
      google.accounts.id.initialize({
        client_id: window.APP_CONFIG.OAUTH_CLIENT_ID,
        callback: (resp) => {
          if (resp && resp.credential) {
            sessionStorage.setItem('idToken', resp.credential);
            setIdToken(resp.credential);
          }
        },
        auto_select: false,
      });
      setReady(true);
    };
    tryInit();
  }, []);

  const renderButton = useCallback(() => {
    if (!ready || !containerRef.current) return;
    google.accounts.id.renderButton(containerRef.current, { theme: 'outline', size: 'large', text: 'signin_with' });
  }, [ready]);

  useEffect(() => { if (ready && !idToken) renderButton(); }, [ready, idToken, renderButton]);

  const signOut = useCallback(() => {
    sessionStorage.removeItem('idToken');
    setIdToken(null);
    if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
  }, []);

  return { idToken, ready, containerRef, signOut };
}

function LoginScreen({ containerRef }) {
  return (
    <div className="login">
      <h1>혜림교회 청소년부 출석부</h1>
      <p>등록된 교사 계정으로 로그인하세요.</p>
      <div ref={containerRef} />
    </div>
  );
}

function UnauthorizedScreen({ email, onRetry, onSignOut }) {
  return (
    <div className="login">
      <h1>접근 권한이 없어요</h1>
      <p>{email} 계정은 교사 명단에 등록되지 않았습니다.</p>
      <p>부장에게 등록을 요청하세요.</p>
      <button className="btn ghost" onClick={onSignOut}>다른 계정으로 로그인</button>
    </div>
  );
}

function App() {
  const auth = useGoogleAuth();
  const [me, setMe] = useState(null); // { email, teacher, role }
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    if (!auth.idToken) { setMe(null); setAuthError(null); return; }
    callApi('whoami', { idToken: auth.idToken })
      .then((r) => {
        if (r.ok) { setMe({ email: r.email, teacher: r.teacher, role: r.role }); setAuthError(null); }
        else if (r.code === 'unauthorized') { setAuthError({ code: 'unauthorized', email: r.email }); setMe(null); }
        else { setAuthError({ code: r.code || 'unknown' }); setMe(null); }
      })
      .catch((e) => setAuthError({ code: 'network', message: e.message }));
  }, [auth.idToken]);

  if (!auth.idToken) return <div className="app"><LoginScreen containerRef={auth.containerRef} /></div>;
  if (authError && authError.code === 'unauthorized') {
    return <div className="app"><UnauthorizedScreen email={authError.email} onSignOut={auth.signOut} /></div>;
  }
  if (!me) return <div className="app"><div className="loading">로그인 확인 중…</div></div>;

  return <Shell me={me} idToken={auth.idToken} onSignOut={auth.signOut} />;
}

function Shell({ me, idToken, onSignOut }) {
  return (
    <div className="app">
      <div className="appbar">
        <div className="appbar-inner">
          <div className="appbar-title">
            <div className="sub">청소년부 · {me.email}</div>
            <div className="main">{me.teacher} 반</div>
          </div>
          <button className="btn ghost" onClick={onSignOut} style={{height:36}}>로그아웃</button>
        </div>
      </div>
      <div className="loading">다음 단계에서 명단을 불러옵니다.</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
```

- [ ] **Step 2: 커밋**

```powershell
git add web/index.html
git commit -m "feat(web): add API client + Google Identity login gate"
```

---

### Task 2.3: 출석 화면 (RosterView) + 낙관적 토글

**Files:**
- Modify: `web/index.html` (`Shell` 교체 + RosterView 추가)

- [ ] **Step 1: `Shell` 함수와 새 컴포넌트로 교체**

```jsx
function todayISO() {
  const d = new Date();
  const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

const STATUS_OPTIONS = [
  { code: 's2', label: '출석' },
  { code: 's3', label: '온라인' },
  { code: 's4', label: '늦음' },
  { code: 'absent', label: '결석' },
];

function Toast({ msg }) {
  if (!msg) return null;
  return <div className="toast">{msg}</div>;
}

function useToast() {
  const [msg, setMsg] = useState(null);
  const timerRef = useRef(null);
  const show = useCallback((m) => {
    setMsg(m);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setMsg(null), 2200);
  }, []);
  return { msg, show };
}

function RosterView({ idToken, me, date, onChangeDate, toast }) {
  const [students, setStudents] = useState(null);
  const [att, setAtt] = useState({}); // { 'YYYY-MM-DD|studentId': 'sX' }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    Promise.all([
      callApi('getRoster', { idToken }),
      callApi('getAttendance', { idToken, year: new Date().getFullYear() }),
    ]).then(([r, a]) => {
      if (aborted) return;
      if (!r.ok) { toast.show('명단 불러오기 실패'); setLoading(false); return; }
      if (!a.ok) { toast.show('출석 기록 불러오기 실패'); }
      setStudents(r.students);
      const map = {};
      (a.rows || []).forEach((row) => { map[row.date + '|' + row.studentId] = row.status; });
      setAtt(map);
      setLoading(false);
    }).catch((e) => { if (!aborted) { toast.show('네트워크 오류'); setLoading(false); } });
    return () => { aborted = true; };
  }, [idToken, toast]);

  const setStatus = (studentId, status) => {
    const key = date + '|' + studentId;
    const prev = att[key];
    setAtt((m) => ({ ...m, [key]: status })); // optimistic
    callApi('setAttendance', { idToken, date, studentId, status })
      .then((r) => {
        if (!r.ok) {
          setAtt((m) => { const next = { ...m }; if (prev) next[key] = prev; else delete next[key]; return next; });
          toast.show('저장 실패: ' + (r.code || ''));
        }
      })
      .catch(() => {
        setAtt((m) => { const next = { ...m }; if (prev) next[key] = prev; else delete next[key]; return next; });
        toast.show('네트워크 오류');
      });
  };

  if (loading) return <div className="loading">불러오는 중…</div>;
  if (!students || students.length === 0) return <div className="loading">학생이 없습니다.</div>;

  return (
    <>
      <div style={{padding:'12px 16px'}}>
        <label style={{fontSize:13,color:'var(--label-alt)'}}>예배 날짜</label>
        <input type="date" value={date} onChange={(e) => onChangeDate(e.target.value)}
          style={{display:'block',marginTop:4,padding:'8px 12px',border:'1px solid var(--line-solid)',borderRadius:8,font:'inherit'}} />
      </div>
      {students.map((s) => {
        const cur = att[date + '|' + s.id];
        return (
          <div className="student-card" key={s.id}>
            <div>
              <div className="student-name">{s['이름']}</div>
              <div className="student-meta">{s['학년']} · {s['성별']}</div>
            </div>
            <div className="student-actions">
              {STATUS_OPTIONS.map((opt) => (
                <button key={opt.code}
                  className={'pill ' + (cur === opt.code ? 'active ' + opt.code : '')}
                  onClick={() => setStatus(s.id, opt.code)}>{opt.label}</button>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Shell({ me, idToken, onSignOut }) {
  const [tab, setTab] = useState('roster');
  const [date, setDate] = useState(todayISO());
  const toast = useToast();
  return (
    <div className="app">
      <div className="appbar">
        <div className="appbar-inner">
          <div className="appbar-title">
            <div className="sub">청소년부 · {me.email}</div>
            <div className="main">{me.teacher} 반</div>
          </div>
          <button className="btn ghost" onClick={onSignOut} style={{height:36}}>로그아웃</button>
        </div>
      </div>
      {tab === 'roster' && <RosterView idToken={idToken} me={me} date={date} onChangeDate={setDate} toast={toast} />}
      {tab === 'prayer' && <div className="loading">기도제목 (다음 Task)</div>}
      {tab === 'records' && <div className="loading">출석 기록 (다음 Task)</div>}
      {tab === 'stats' && <div className="loading">통계 (다음 Task)</div>}
      <div className="bottomnav">
        {[['roster','출석'],['prayer','기도제목'],['records','기록'],['stats','통계']].map(([k,label]) => (
          <button key={k} className={tab===k?'active':''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      <Toast msg={toast.msg} />
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```powershell
git add web/index.html
git commit -m "feat(web): roster view with optimistic attendance toggle"
```

---

### Task 2.4: 기도제목 화면 (PrayerView)

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: PrayerView 추가 + tab 라우팅 교체**

```jsx
function PrayerView({ idToken, toast }) {
  const [prayers, setPrayers] = useState(null);
  const [students, setStudents] = useState([]);
  const [editing, setEditing] = useState(null); // { id?, studentId, text }
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([callApi('getRoster', { idToken }), callApi('getPrayers', { idToken })])
      .then(([r, p]) => {
        if (r.ok) setStudents(r.students);
        if (p.ok) setPrayers(p.prayers);
        setLoading(false);
      })
      .catch(() => { toast.show('불러오기 실패'); setLoading(false); });
  }, [idToken, toast]);

  useEffect(reload, [reload]);

  const save = () => {
    if (!editing) return;
    callApi('setPrayer', { idToken, id: editing.id, studentId: editing.studentId, text: editing.text, active: true })
      .then((r) => {
        if (r.ok) { setEditing(null); reload(); toast.show('저장됨'); }
        else toast.show('저장 실패: ' + (r.code || ''));
      })
      .catch(() => toast.show('네트워크 오류'));
  };

  const remove = (p) => {
    if (!confirm('이 기도제목을 삭제할까요?')) return;
    callApi('setPrayer', { idToken, id: p.id, studentId: p.studentId, text: p.text, active: false })
      .then((r) => { if (r.ok) reload(); else toast.show('삭제 실패'); });
  };

  if (loading) return <div className="loading">불러오는 중…</div>;

  const byStudent = {};
  prayers.forEach((p) => { (byStudent[p.studentId] = byStudent[p.studentId] || []).push(p); });

  return (
    <>
      {students.map((s) => (
        <div key={s.id} style={{padding:'12px 16px',borderBottom:'1px solid var(--line-solid)'}}>
          <div style={{display:'flex',alignItems:'center'}}>
            <div className="student-name">{s['이름']}</div>
            <button className="btn ghost" style={{marginLeft:'auto',height:32,padding:'0 12px'}}
              onClick={() => setEditing({ studentId: s.id, text: '' })}>＋</button>
          </div>
          {(byStudent[s.id] || []).map((p) => (
            <div key={p.id} style={{marginTop:8,padding:'10px 12px',background:'var(--fill-normal)',borderRadius:10,display:'flex',gap:8}}>
              <div style={{flex:1,whiteSpace:'pre-wrap'}}>{p.text}</div>
              <button onClick={() => setEditing({ id: p.id, studentId: p.studentId, text: p.text })} style={{color:'var(--label-alt)'}}>수정</button>
              <button onClick={() => remove(p)} style={{color:'var(--status-negative)'}}>삭제</button>
            </div>
          ))}
        </div>
      ))}
      {editing && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'flex-end',zIndex:50}} onClick={() => setEditing(null)}>
          <div style={{background:'#fff',width:'100%',maxWidth:460,margin:'0 auto',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16}} onClick={(e)=>e.stopPropagation()}>
            <h3 style={{margin:'0 0 12px'}}>기도제목</h3>
            <textarea value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              rows={4} style={{width:'100%',padding:10,border:'1px solid var(--line-solid)',borderRadius:10,font:'inherit'}} />
            <div style={{display:'flex',gap:8,marginTop:12}}>
              <button className="btn ghost" style={{flex:1}} onClick={() => setEditing(null)}>취소</button>
              <button className="btn primary" style={{flex:1}} onClick={save}>저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

`Shell` 의 prayer 분기 교체:

```jsx
{tab === 'prayer' && <PrayerView idToken={idToken} toast={toast} />}
```

- [ ] **Step 2: 커밋**

```powershell
git add web/index.html
git commit -m "feat(web): prayer view with create/edit/soft-delete"
```

---

### Task 2.5: 출석 기록 보기 (RecordsView) + 통계 (StatsView)

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: RecordsView, StatsView 추가**

```jsx
function RecordsView({ idToken, toast, me }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    Promise.all([callApi('getRoster',{idToken}), callApi('getAttendance',{idToken, year: new Date().getFullYear()})])
      .then(([r,a]) => { if (r.ok && a.ok) setData({ students: r.students, rows: a.rows }); else toast.show('불러오기 실패'); })
      .catch(() => toast.show('네트워크 오류'));
  }, [idToken, toast]);
  if (!data) return <div className="loading">불러오는 중…</div>;
  const byDate = {};
  data.rows.forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  const dates = Object.keys(byDate).sort().reverse();
  return (
    <>
      {dates.map((d) => (
        <div key={d} style={{padding:'12px 16px',borderBottom:'1px solid var(--line-solid)'}}>
          <div style={{fontWeight:600}}>{d}</div>
          <div style={{fontSize:13,color:'var(--label-alt)',marginTop:4}}>
            {STATUS_OPTIONS.map((opt) => {
              const n = byDate[d].filter((r) => r.status === opt.code).length;
              return n > 0 ? <span key={opt.code} style={{marginRight:12}}>{opt.label} {n}</span> : null;
            })}
          </div>
        </div>
      ))}
      {dates.length === 0 && <div className="loading">기록이 없습니다.</div>}
    </>
  );
}

function StatsView({ idToken, toast }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    Promise.all([callApi('getRoster',{idToken}), callApi('getAttendance',{idToken, year: new Date().getFullYear()})])
      .then(([r,a]) => { if (r.ok && a.ok) setData({ students: r.students, rows: a.rows }); })
      .catch(() => toast.show('네트워크 오류'));
  }, [idToken, toast]);
  if (!data) return <div className="loading">불러오는 중…</div>;
  const dates = Array.from(new Set(data.rows.map((r) => r.date)));
  return (
    <>
      <div style={{padding:'12px 16px',fontSize:13,color:'var(--label-alt)'}}>올해 예배 횟수: {dates.length}회</div>
      {data.students.map((s) => {
        const mine = data.rows.filter((r) => r.studentId === s.id);
        const present = mine.filter((r) => r.status === 's2').length;
        const total = dates.length;
        const pct = total > 0 ? Math.round((present / total) * 100) : 0;
        return (
          <div key={s.id} className="student-card">
            <div style={{flex:1}}>
              <div className="student-name">{s['이름']}</div>
              <div className="student-meta">출석 {present} / {total}회 ({pct}%)</div>
            </div>
          </div>
        );
      })}
    </>
  );
}
```

Shell 분기 교체:

```jsx
{tab === 'records' && <RecordsView idToken={idToken} toast={toast} me={me} />}
{tab === 'stats' && <StatsView idToken={idToken} toast={toast} />}
```

- [ ] **Step 2: 커밋**

```powershell
git add web/index.html
git commit -m "feat(web): records and stats views with year aggregate"
```

---

### Task 2.6: 학생 상세 모달 (PII 별도 호출)

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: 상세 모달 추가 + RosterView 에서 이름 클릭 시 열기**

```jsx
function StudentDetail({ idToken, studentId, onClose, toast }) {
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    callApi('getStudentDetail', { idToken, studentId })
      .then((r) => { if (r.ok) setDetail(r.student); else toast.show('불러오기 실패'); });
  }, [idToken, studentId]);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'flex-end',zIndex:50}} onClick={onClose}>
      <div style={{background:'#fff',width:'100%',maxWidth:460,margin:'0 auto',padding:16,borderTopLeftRadius:16,borderTopRightRadius:16,maxHeight:'85vh',overflow:'auto'}} onClick={(e)=>e.stopPropagation()}>
        {!detail ? <div className="loading">불러오는 중…</div> : (
          <>
            <h3 style={{margin:'0 0 12px'}}>{detail['이름']}</h3>
            {['학년','성별','생년월일','연락처','학교','초등학교','신급','부/모','부모님연락처','주소','비고']
              .filter((k) => detail[k])
              .map((k) => (
                <div key={k} style={{display:'flex',padding:'6px 0',borderBottom:'1px solid var(--fill-normal)'}}>
                  <div style={{width:90,color:'var(--label-alt)',fontSize:13}}>{k}</div>
                  <div style={{flex:1,fontSize:14}}>{detail[k]}</div>
                </div>
              ))}
            <button className="btn ghost" style={{width:'100%',marginTop:12}} onClick={onClose}>닫기</button>
          </>
        )}
      </div>
    </div>
  );
}
```

`RosterView` 의 student-card 클릭 가능하게 — `<div className="student-name">` 을 `<button>` 으로 바꾸고 클릭 시 부모에게 알림:

```jsx
function RosterView({ idToken, me, date, onChangeDate, toast, onOpenDetail }) {
  // ... existing code ...
  return (
    <>
      {/* ... date input ... */}
      {students.map((s) => {
        const cur = att[date + '|' + s.id];
        return (
          <div className="student-card" key={s.id}>
            <div>
              <button className="student-name" onClick={() => onOpenDetail(s.id)} style={{textAlign:'left'}}>{s['이름']}</button>
              <div className="student-meta">{s['학년']} · {s['성별']}</div>
            </div>
            <div className="student-actions">
              {/* ... pills ... */}
            </div>
          </div>
        );
      })}
    </>
  );
}
```

`Shell` 에 detail state 추가:

```jsx
function Shell({ me, idToken, onSignOut }) {
  const [tab, setTab] = useState('roster');
  const [date, setDate] = useState(todayISO());
  const [detailId, setDetailId] = useState(null);
  const toast = useToast();
  return (
    <div className="app">
      {/* appbar ... */}
      {tab === 'roster' && <RosterView idToken={idToken} me={me} date={date} onChangeDate={setDate} toast={toast} onOpenDetail={setDetailId} />}
      {/* ... */}
      {detailId && <StudentDetail idToken={idToken} studentId={detailId} onClose={() => setDetailId(null)} toast={toast} />}
      <Toast msg={toast.msg} />
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```powershell
git add web/index.html
git commit -m "feat(web): student detail modal with separate PII fetch"
```

---

## Phase 3 — 배포

### Task 3.1: GitHub Pages 배포 가이드

**Files:**
- Create: `docs/ops/04-deploy-github-pages.md`

- [ ] **Step 1: 가이드 작성**

```markdown
# GitHub Pages 배포

## 1) GitHub 저장소 생성

- 이름: `hyerim-attendance` (또는 원하는 이름)
- public 또는 private (GitHub Free 도 private Pages 가능 정책 확인)

## 2) 로컬에서 푸시

```powershell
git remote add origin https://github.com/<user>/hyerim-attendance.git
git branch -M main
git push -u origin main
```

## 3) Pages 활성화

저장소 → Settings → Pages:
- Source: `Deploy from a branch`
- Branch: `main` / `/web` 폴더 (또는 root)

저장 후 1~2분 뒤 URL 활성화:
- 예: `https://<user>.github.io/hyerim-attendance/web/index.html`

(폴더가 `/web` 이라 경로에 `/web/` 가 붙음. 사용자에게 깔끔하게 보이고 싶으면 root 로 두거나 GitHub Actions 로 `/web` 만 배포.)

## 4) HTML 의 설정값 채우기

`web/index.html` 상단의 `APP_CONFIG`:

```js
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycb.../exec',
  OAUTH_CLIENT_ID: '1234567890-abc...apps.googleusercontent.com',
};
```

수정 후 커밋·푸시 → 자동 재배포.

## 5) Google Cloud Console 에 도메인 등록

[Task 0.2 가이드](01-setup-google-cloud.md) 의 "승인된 JavaScript 원본" 에:
- `https://<user>.github.io`

가 들어 있는지 확인. 누락 시 추가하고 저장.

## 6) 첫 검증

- 발급된 URL 접속 → "구글로 로그인" 표시 확인
- TEACHERS 시트에 등록된 이메일로 로그인 → 본인 반 학생 표시 확인
- 출석 토글 → 시트 ATTENDANCE 탭에 행 추가 확인
- 미등록 이메일로 로그인 → "접근 권한이 없어요" 화면 확인
```

- [ ] **Step 2: 커밋**

```powershell
git add docs/ops/04-deploy-github-pages.md
git commit -m "docs: add GitHub Pages deploy guide"
```

---

### Task 3.2: 시트 마이그레이션 스크립트 (Apps Script 1회용)

**Files:**
- Create: `gas/Migration.gs`

- [ ] **Step 1: 마이그레이션 함수 작성**

```javascript
// Migration.gs — one-shot helpers to migrate from existing sheet structure.
// Run from Apps Script IDE manually after backing up.

function migration_assignMissingStudentIds() {
  const sh = getSheet_(SHEET_NAMES.STUDENTS);
  const last = sh.getLastRow();
  if (last < 2) return;
  const idCol = 1; // 'id' is column A
  const values = sh.getRange(2, idCol, last - 1, 1).getValues();
  let changed = 0;
  values.forEach((row, i) => {
    if (!row[0]) {
      sh.getRange(i + 2, idCol).setValue(Utilities.getUuid());
      changed++;
    }
  });
  Logger.log('Assigned %s new UUIDs', changed);
}

function migration_markAllActive() {
  const sh = getSheet_(SHEET_NAMES.STUDENTS);
  const { headers } = readTable_(SHEET_NAMES.STUDENTS);
  const col = headers.indexOf('active') + 1;
  if (col === 0) throw new Error('active column not found');
  const last = sh.getLastRow();
  if (last < 2) return;
  const range = sh.getRange(2, col, last - 1, 1);
  const values = range.getValues();
  values.forEach((r, i) => { if (r[0] === '') values[i][0] = true; });
  range.setValues(values);
}
```

- [ ] **Step 2: 커밋**

```powershell
git add gas/Migration.gs
git commit -m "feat(gas): one-shot migration helpers for IDs and active flag"
```

---

### Task 3.3: 사본 → 원본 전환 가이드

**Files:**
- Create: `docs/ops/05-migrate-original-sheet.md`

- [ ] **Step 1: 가이드 작성**

```markdown
# 사본 → 원본 시트 전환

## 전제
사본에서 1~2주 운영, 출석 데이터가 안정적으로 누적됨을 확인했음.

## 절차

1. 원본 시트 열기.
2. 사본의 STUDENTS / TEACHERS / ATTENDANCE / PRAYERS 탭을 우클릭 → "다른 스프레드시트로 복사" → 원본 선택.
3. 원본의 ATTENDANCE 탭이 새로 시작이라면 (4)~(5) 생략 가능.
4. (선택) 사본의 ATTENDANCE 데이터를 원본 ATTENDANCE 에 붙여넣기.
5. (선택) 사본의 PRAYERS 데이터도 동일하게 이관.
6. Apps Script IDE → 프로젝트 설정 → 스크립트 속성:
   - `SHEET_ID` 값을 원본 시트 ID 로 교체.
7. **재배포 불필요** — Script Properties 만 바뀌면 즉시 반영.
8. 캐시 무효화: Apps Script IDE 에서 `invalidateCache_()` 함수 1회 실행.
9. 앱에서 새로고침 → 원본 데이터가 보이는지 확인.

## 롤백
문제가 생기면 `SHEET_ID` 를 사본 ID 로 되돌리면 됨. 데이터 손실 없음.
```

- [ ] **Step 2: 커밋**

```powershell
git add docs/ops/05-migrate-original-sheet.md
git commit -m "docs: add copy-to-original sheet switch guide"
```

---

## Phase 4 — E2E 검증

### Task 4.1: 사양 테스트 시나리오 실행 (T1~T8)

**Files:**
- Create: `docs/ops/06-test-checklist.md`

- [ ] **Step 1: 체크리스트 작성**

```markdown
# E2E 테스트 체크리스트 (Spec Section 11)

배포 직후 다음 8가지를 차례로 확인. 한 항목이라도 실패하면 plan 의 해당 Task 로 돌아가 수정.

- [ ] **T1** TEACHERS 에 등록 안 된 이메일로 로그인 → "접근 권한이 없어요" 화면 표시
- [ ] **T2** 교사 A 로그인 → 본인 반 학생만 명단에 표시 (다른 반 학생 안 보임)
- [ ] **T3** 브라우저 콘솔에서 `fetch(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain'}, body: JSON.stringify({action:'setAttendance', idToken: sessionStorage.idToken, date:'2026-06-01', studentId:'<다른반 학생ID>', status:'s2'})}).then(r=>r.json()).then(console.log)` → `{ok:false, code:'forbidden'}`
- [ ] **T4** 같은 (날짜, 학생) 에 출석 → 결석 → 출석 토글. ATTENDANCE 시트에서 행 1개만 보이고 상태가 마지막 값
- [ ] **T5** 네트워크 끊고 출석 토글 → "네트워크 오류" 토스트 + 화면 상태 롤백
- [ ] **T6** 1시간 후 다시 로그인 시도 → silent refresh 또는 재로그인 모달, 작업 이어서 가능
- [ ] **T7** 시트에서 STUDENTS 에 새 학생 추가 → 앱 새로고침 시 5분 이내 반영 (캐시 만료)
- [ ] **T8** 시트에서 학생 `active=FALSE` → 명단에서 사라짐, 과거 ATTENDANCE 행은 유지
```

- [ ] **Step 2: 커밋**

```powershell
git add docs/ops/06-test-checklist.md
git commit -m "docs: add E2E test checklist mapped to spec scenarios"
```

---

### Task 4.2: 운영자 인수인계 문서

**Files:**
- Create: `docs/ops/07-handover.md`

- [ ] **Step 1: 1페이지 운영 인수인계 작성**

```markdown
# 운영자(부장) 인수인계

## 일상 운영

| 상황 | 작업 |
|---|---|
| 학생 추가 | STUDENTS 시트에 행 추가. `id` 비워두면 다음 마이그레이션에서 자동 부여 (또는 UUID 직접 입력). `active=TRUE` |
| 학생 제외 (이력 보존) | 해당 행의 `active` 컬럼을 `FALSE` 로 |
| 학생 반 변경 | 해당 행의 `반` 컬럼 수정. 과거 ATTENDANCE 는 기록 시점 반 유지 |
| 교사 추가 | TEACHERS 시트에 행 추가 |
| 교사 이메일 변경 | TEACHERS 의 email 컬럼 수정 |
| 출석 잘못 입력됨 | 1) 앱에서 다시 토글하거나 2) 시트의 ATTENDANCE 탭 해당 행 직접 수정 (단, 시트 캐시 5~6분 후 반영) |

## 문제 해결

| 증상 | 점검 |
|---|---|
| "접근 권한이 없어요" 가 등록된 교사에게 뜸 | TEACHERS 시트의 email 컬럼이 정확한지(공백·대소문자) + `active=TRUE` |
| 출석이 시트에 안 들어감 | Apps Script IDE → "실행" 로그에서 에러 확인 |
| 명단에 새 학생이 안 보임 | 5분 캐시 만료 대기 또는 IDE 에서 `invalidateCache_()` 실행 |
| 전체 동작 점검 | [E2E 체크리스트](06-test-checklist.md) 다시 실행 |

## 백업
- 시트 자체가 백업이며 구글이 자동 버전 보관 (파일 → 버전 기록).
- 매월 1회 `파일 → 다운로드 → xlsx` 권장.
```

- [ ] **Step 2: 커밋**

```powershell
git add docs/ops/07-handover.md
git commit -m "docs: add operator handover one-pager"
```

---

## Self-Review

### Spec 커버리지

| Spec 요구사항 | 구현 Task |
|---|---|
| §1.1 명단 SSOT | Task 2.3 (UI에서 학생 CRUD 없음), Task 0.3 (시트가 단일 출처) |
| §1.2 출석 시트 누적 | Task 1.5 (ATTENDANCE Long format UPSERT) |
| §1.3 본인 반 뷰 | Task 1.4 (`listStudentsForTeacher`), Task 2.2 (server-decided teacher) |
| §1.4 인가 제어 | Task 1.2 (verifyIdToken), Task 1.4 (TEACHERS lookup) |
| §1.5 사본→원본 전환 | Task 3.3 |
| §2 D1 ID Token + 화이트리스트 | Task 1.2 |
| §2 D2 본인 반만 | Task 1.4 |
| §2 D3 Long format | Task 1.5 |
| §2 D4 UI 재사용 (실은 신규 작성) | Task 2.1~2.6 |
| §2 D5 PRAYERS 동기화 | Task 1.6, Task 2.4 |
| §4.1 STUDENTS 컬럼 | Task 0.3 |
| §4.2 TEACHERS 컬럼 | Task 0.3 |
| §4.3 ATTENDANCE Long | Task 1.5 |
| §4.4 PRAYERS | Task 1.6 |
| §5 ID Token 검증 (A) tokeninfo | Task 1.2 |
| §6.1 text/plain + body | Task 2.2 (`callApi`) |
| §6.2 액션 7개 + StudentDetail | Task 1.4~1.6 |
| §6.3 LockService, 캐시, PII 분리 | Task 1.5, 1.4, 2.6 |
| §6.4 지연 목표 (배치) | Task 1.5 (`setAttendanceBatch`) |
| §7.0 (다) 신규 단일파일 | Task 2.1 |
| §7.1 학생 추가/삭제 UI 없음 | Task 2.3 (없음으로 구현) |
| §8.0 GitHub Pages | Task 3.1 |
| §8.1 1회성 셋업 | Task 0.2, 0.3, 1.7 |
| §8.2 사본→원본 | Task 3.3 |
| §9 마이그레이션 | Task 3.2 |
| §10 보안·PII·id 보호 | Task 0.3 (시트 보호), Task 2.6 (PII), Task 1.4 (필드 축소) |
| §10.1 14명 채택 리스크 | Task 4.2 (운영 가이드) |
| §11 T1~T8 테스트 | Task 4.1 |

스펙의 모든 정상 항목이 Task 에 매핑됨. §12 향후 확장은 v1.0 비목표 (의도된 누락). §13 결정 보류 항목은 운영 단계에서 처리되도록 가이드에 명시됨.

### 일관성 확인

- 액션 이름 (whoami/getRoster/getAttendance/setAttendance/setAttendanceBatch/getPrayers/setPrayer/getStudentDetail) — Code.gs 의 ACTIONS 매핑과 모든 handle\* 함수 일치
- 헤더 이름 (한글) — Task 0.3 시트 셋업 ↔ Sheet.gs/Actions.gs 의 키 접근 (`s['이름']`, `r['반']` 등) 일치
- 상태 코드 (`s2`/`s3`/`s4`/`absent`) — Spec §4.3, Task 2.3 STATUS_OPTIONS, 핀 색 CSS 일치
- 캐시 키 (`STUDENTS_v1`, `TEACHERS_v1`, `ATT_IDX_v1`) — Sheet.gs/Actions.gs 에서 일관
- `_rowIndex` 는 `readTable_` 에서 헤더 다음부터 2-based로 설정 ↔ `updateRowByIndex_` 에서 그대로 사용

### Placeholder 스캔
모든 Task 에 실제 코드/명령/문서 내용이 들어있음. TBD/TODO 없음.
