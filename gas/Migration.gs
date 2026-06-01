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
