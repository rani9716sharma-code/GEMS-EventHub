/**
 * GEMS EventHub -> Google Sheets receiver
 *
 * 1. Open your Google Sheet, then Extensions > Apps Script.
 * 2. Delete everything in the editor and paste this whole file.
 * 3. Change SECRET below to a long random text (12+ characters). Remember it.
 * 4. Deploy > New deployment > type "Web app":
 *      Execute as: Me
 *      Who has access: Anyone
 *    Click Deploy, authorise when asked, and copy the Web app URL (ends with /exec).
 * 5. In EventHub open Admin > Google Sheets, paste the URL and the same SECRET, then click Save.
 *
 * The script only writes rows sent by your EventHub server (it checks the SECRET).
 * Tabs it manages: Users, Students, Events, All Registrations and one tab per event.
 */
var SECRET = 'CHANGE-THIS-TO-A-LONG-RANDOM-TEXT';

function doGet() {
  return reply_({ ok: true, service: 'GEMS EventHub Google Sheets receiver' });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var req = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET === 'CHANGE-THIS-TO-A-LONG-RANDOM-TEXT') {
      return reply_({ ok: false, error: 'Open the script and change SECRET first, then deploy again.' });
    }
    if (req.secret !== SECRET) return reply_({ ok: false, error: 'The secret does not match the one in the Google script.' });
    if (req.action === 'ping') {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      return reply_({ ok: true, spreadsheet: ss.getName(), url: ss.getUrl() });
    }
    if (req.action === 'upsert') return reply_(upsert_(req));
    if (req.action === 'delete') return reply_(remove_(req));
    return reply_({ ok: false, error: 'Unknown action: ' + req.action });
  } catch (err) {
    return reply_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function tabName_(title) {
  var name = String(title).replace(/[\[\]\*\?\:\/\\]/g, '-').replace(/\s+/g, ' ').trim();
  return name.substring(0, 100) || 'Sheet';
}

// A tab belongs to an entry when its name is the key, or starts with "<key> ".
function findSheet_(ss, key, title, create) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name === key || name.indexOf(key + ' ') === 0) return sheets[i];
  }
  return create ? ss.insertSheet(tabName_(title || key)) : null;
}

function pad_(row, cols) {
  var out = row.slice(0, cols);
  while (out.length < cols) out.push('');
  return out;
}

function ensureHeader_(sh, headers, textColumns) {
  var cols = headers.length;
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  var current = sh.getRange(1, 1, 1, cols).getValues()[0];
  var same = true;
  for (var i = 0; i < cols; i++) if (String(current[i]) !== String(headers[i])) { same = false; break; }
  if (same) return;
  sh.getRange(1, 1, 1, cols).setValues([headers]).setFontWeight('bold').setBackground('#12306b').setFontColor('#ffffff');
  sh.setFrozenRows(1);
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  for (var c = 0; c < (textColumns || []).length; c++) sh.getRange(2, textColumns[c] + 1, rows, 1).setNumberFormat('@');
  sh.autoResizeColumns(1, cols);
}

function upsert_(req) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = findSheet_(ss, req.sheet.key, req.sheet.title, true);
  var headers = req.headers, cols = headers.length;
  ensureHeader_(sh, headers, req.textColumns);

  var last = Math.max(sh.getLastRow(), 1);
  var existing = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
  var index = {};
  for (var i = 0; i < existing.length; i++) {
    var k = String(existing[i][0]);
    if (k !== '' && !(k in index)) index[k] = i;
  }

  var updates = [], appends = [], seen = {};
  for (var r = 0; r < req.rows.length; r++) {
    var row = pad_(req.rows[r], cols), key = String(row[0]);
    if (key in seen) continue; // ignore duplicates inside one batch
    seen[key] = true;
    if (key in index) updates.push([index[key], row]); else appends.push(row);
  }

  if (updates.length) {
    var block = sh.getRange(2, 1, existing.length, cols);
    var values = block.getValues();
    for (var u = 0; u < updates.length; u++) values[updates[u][0]] = updates[u][1];
    block.setValues(values);
  }
  if (appends.length) {
    if (sh.getMaxRows() < last + appends.length) sh.insertRowsAfter(sh.getMaxRows(), last + appends.length - sh.getMaxRows());
    sh.getRange(last + 1, 1, appends.length, cols).setValues(appends);
  }
  return { ok: true, updated: updates.length, added: appends.length };
}

function remove_(req) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = findSheet_(ss, req.sheet.key, req.sheet.title, false);
  if (!sh) return { ok: true, removed: 0 };
  var last = sh.getLastRow();
  if (last < 2) return { ok: true, removed: 0 };
  var values = sh.getRange(2, 1, last - 1, 1).getValues();
  var wanted = {};
  for (var k = 0; k < req.keys.length; k++) wanted[String(req.keys[k])] = true;
  var rows = [];
  for (var i = 0; i < values.length; i++) if (wanted[String(values[i][0])]) rows.push(i + 2);
  for (var j = rows.length - 1; j >= 0; j--) sh.deleteRow(rows[j]); // bottom-up keeps row numbers valid
  return { ok: true, removed: rows.length };
}
