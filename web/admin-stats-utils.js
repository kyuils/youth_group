(function(root) {
  'use strict';

  const PRESENT_CODES = ['P2', 'P3', 'P4'];
  const STATUS_LABELS = {
    P2: '2부',
    P3: '3부',
    P4: '4부',
    ETC: '기타',
    ABSENT: '결석',
  };

  function toArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function pct(part, total) {
    return total > 0 ? Math.min(100, Math.round((part / total) * 100)) : 0;
  }

  function dateLabel(date) {
    const s = String(date || '');
    if (s.length < 10) return s;
    return Number(s.slice(5, 7)) + '/' + Number(s.slice(8, 10));
  }

  function allDates(attRows) {
    return Array.from(new Set(toArray(attRows).map((r) => r.date).filter(Boolean))).sort();
  }

  function flattenStudents(byClass) {
    return Object.keys(byClass || {}).reduce((acc, cls) => acc.concat(toArray(byClass[cls])), []);
  }

  function rowByStudentForDate(attRows, selectedDate) {
    const map = {};
    toArray(attRows).forEach((r) => {
      if (String(r.date) !== String(selectedDate)) return;
      if (!r.studentId) return;
      map[String(r.studentId)] = r;
    });
    return map;
  }

  function countStudents(students, rowsByStudent) {
    const counts = {
      enrolled: students.length,
      present: 0,
      etc: 0,
      absent: 0,
      unmarked: 0,
      marked: 0,
      pct: 0,
    };

    students.forEach((s) => {
      const r = rowsByStudent[String(s.id)];
      const status = r ? String(r.status || '').trim() : '';
      if (!status) {
        counts.unmarked++;
      } else if (PRESENT_CODES.indexOf(status) >= 0) {
        counts.present++;
      } else if (status === 'ETC') {
        counts.etc++;
      } else if (status === 'ABSENT') {
        counts.absent++;
      } else {
        counts.unmarked++;
      }
    });

    counts.marked = counts.enrolled - counts.unmarked;
    counts.pct = pct(counts.present, counts.enrolled);
    return counts;
  }

  function buildAdminWeekSnapshot({ byClass, attRows, selectedDate, defaultDate }) {
    const dates = allDates(attRows);
    const date = selectedDate || defaultDate || dates[dates.length - 1] || '';
    const rowsByStudent = rowByStudentForDate(attRows, date);
    const allStudents = flattenStudents(byClass);

    const classes = Object.keys(byClass || {})
      .map((name) => {
        const students = toArray(byClass[name]);
        if (students.length === 0) return null;
        return Object.assign({ name }, countStudents(students, rowsByStudent));
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    return {
      date,
      dates,
      overall: countStudents(allStudents, rowsByStudent),
      classes,
    };
  }

  function buildClassTrendPoints({ className, byClass, attRows, count }) {
    const students = toArray((byClass || {})[className]);
    const ids = {};
    students.forEach((s) => { ids[String(s.id)] = true; });
    return allDates(attRows).slice(-(count || 12)).map((date) => ({
      label: dateLabel(date),
      date,
      value: toArray(attRows).filter((r) =>
        r.date === date &&
        ids[String(r.studentId)] &&
        PRESENT_CODES.indexOf(String(r.status || '').trim()) >= 0
      ).length,
    }));
  }

  function buildClassStudentStatuses({ className, byClass, attRows, selectedDate }) {
    const students = toArray((byClass || {})[className]);
    const rowsByStudent = rowByStudentForDate(attRows, selectedDate);
    return students.map((s) => {
      const r = rowsByStudent[String(s.id)];
      const status = r ? String(r.status || '').trim() : '';
      return {
        id: String(s.id),
        name: s['이름'] || '',
        grade: s['학년'] || '',
        gender: s['성별'] || '',
        status,
        label: status ? (STATUS_LABELS[status] || status) : '미체크',
        etcText: r ? String(r.etcText || '') : '',
      };
    });
  }

  function buildNewcomerKpis(newcomers, year) {
    const students = toArray(newcomers && newcomers.students);
    const graduates = toArray(newcomers && newcomers.graduates);
    const y = String(year || new Date().getFullYear());
    return {
      registeredTotal: students.length + graduates.length,
      current: students.length,
      graduatedTotal: graduates.length,
      graduatedThisYear: graduates.filter((g) => String(g.graduatedOn || '').slice(0, 4) === y).length,
    };
  }

  const api = {
    PRESENT_CODES,
    STATUS_LABELS,
    buildAdminWeekSnapshot,
    buildClassTrendPoints,
    buildClassStudentStatuses,
    buildNewcomerKpis,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AdminStatsUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
