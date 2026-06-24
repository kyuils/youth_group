import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const {
  buildAdminWeekSnapshot,
  buildClassTrendPoints,
  buildClassStudentStatuses,
  buildNewcomerKpis,
} = require('../web/admin-stats-utils.js');

const byClass = {
  '김교사': [
    { id: 's1', '이름': '민준', '학년': '중1', '성별': '남' },
    { id: 's2', '이름': '서연', '학년': '중2', '성별': '여' },
  ],
  '이교사': [
    { id: 's3', '이름': '지우', '학년': '고1', '성별': '여' },
  ],
};

const attRows = [
  { date: '2026-06-07', studentId: 's1', studentName: '민준', status: 'P2', etcText: '' },
  { date: '2026-06-07', studentId: 's2', studentName: '서연', status: 'ABSENT', etcText: '가족 일정' },
  { date: '2026-06-07', studentId: 's3', studentName: '지우', status: 'P3', etcText: '' },
  { date: '2026-06-14', studentId: 's1', studentName: '민준', status: 'P4', etcText: '' },
  { date: '2026-06-14', studentId: 's3', studentName: '지우', status: 'ETC', etcText: '수련회' },
];

const snapshot = buildAdminWeekSnapshot({
  byClass,
  attRows,
  selectedDate: '2026-06-14',
});

assert.equal(snapshot.date, '2026-06-14');
assert.deepEqual(snapshot.overall, {
  enrolled: 3,
  present: 1,
  etc: 1,
  absent: 0,
  unmarked: 1,
  marked: 2,
  pct: 33,
});
assert.deepEqual(snapshot.classes.map((c) => ({
  name: c.name,
  enrolled: c.enrolled,
  present: c.present,
  etc: c.etc,
  absent: c.absent,
  unmarked: c.unmarked,
  pct: c.pct,
})), [
  { name: '김교사', enrolled: 2, present: 1, etc: 0, absent: 0, unmarked: 1, pct: 50 },
  { name: '이교사', enrolled: 1, present: 0, etc: 1, absent: 0, unmarked: 0, pct: 0 },
]);

const currentWeekSnapshot = buildAdminWeekSnapshot({
  byClass,
  attRows,
  defaultDate: '2026-06-21',
});

assert.equal(currentWeekSnapshot.date, '2026-06-21');
assert.equal(currentWeekSnapshot.overall.present, 0);
assert.equal(currentWeekSnapshot.overall.unmarked, 3);

assert.deepEqual(buildClassTrendPoints({
  className: '김교사',
  byClass,
  attRows,
  count: 12,
}), [
  { label: '6/7', date: '2026-06-07', value: 1 },
  { label: '6/14', date: '2026-06-14', value: 1 },
]);

assert.deepEqual(buildClassStudentStatuses({
  className: '김교사',
  byClass,
  attRows,
  selectedDate: '2026-06-14',
}).map((s) => ({
  id: s.id,
  status: s.status,
  label: s.label,
  etcText: s.etcText,
})), [
  { id: 's1', status: 'P4', label: '4부', etcText: '' },
  { id: 's2', status: '', label: '미체크', etcText: '' },
]);

assert.deepEqual(buildNewcomerKpis({
  students: [{ id: 'n1' }, { id: 'n2' }],
  graduates: [
    { id: 'g1', graduatedOn: '2026-01-01' },
    { id: 'g2', graduatedOn: '2026-06-01' },
    { id: 'g3', graduatedOn: '2025-12-31' },
  ],
}, '2026'), {
  registeredTotal: 5,
  current: 2,
  graduatedTotal: 3,
  graduatedThisYear: 2,
});

const html = readFileSync('web/index.html', 'utf8');
assert.match(html, /admin-stats-utils\.js/);
assert.match(html, /선택 주일 전체 현황/);
assert.match(html, /새가족 누적 등록/);
assert.match(html, /반 클릭/);
assert.match(html, /작성일/);
assert.match(html, /ABSENT' && r\.date === weekSnapshot\.date/);

console.log('OK: admin stats utility behavior');
