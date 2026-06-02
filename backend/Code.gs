/**
 * MR Tracker — Google Apps Script Backend
 *
 * DEPLOYMENT INSTRUCTIONS:
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Open your Google Sheet → click Extensions → Apps Script
 * 2. Delete the default Code.gs content and paste this entire file
 * 3. Replace SHEET_ID with your Google Sheet ID (from its URL)
 * 4. Replace DRIVE_FOLDER_ID with a Google Drive folder ID for clinic photos
 *    (create a folder in Drive, open it, copy the ID from the URL)
 * 5. Click Deploy → New Deployment
 * 6. Type: Web App
 * 7. Execute as: Me (your Google account)
 * 8. Who has access: Anyone
 * 9. Click Deploy → Authorize → copy the Web App URL
 * 10. Paste the URL into your .env file as VITE_APPS_SCRIPT_URL
 *
 * SHEET SETUP:
 * ─────────────────────────────────────────────────────────────────────────────
 * Create 3 tabs in your Google Sheet with these EXACT names:
 *   MR_Visits       — receives all visit/event data
 *   MR_Employees    — MR credentials and info
 *   Products        — product catalog
 *
 * MR_Visits headers (Row 1, columns A–S):
 *   visit_id | mr_id | mr_name | timestamp_iso | event_type |
 *   latitude | longitude | accuracy_m | doctor_name | doctor_degree |
 *   doctor_specialty | clinic_name | city | products_discussed |
 *   samples_given | order_value_inr | notes | day_session_id | photo_drive_link
 *
 * MR_Employees headers (Row 1):
 *   mr_id | mr_name | pin_hash | territory | reporting_manager | joined_date
 *
 * Products headers (Row 1):
 *   product_id | product_name | category | unit_price_inr
 *
 * NOTE: pin_hash is SHA-256 of the MR's 4-digit PIN (lowercase hex).
 *   You can generate it at: https://emn178.github.io/online-tools/sha256.html
 *   Example: PIN "1234" → SHA-256 → 03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Configuration ────────────────────────────────────────────────────────────

var SHEET_ID = '1ukPMda-YZw7RvzIpLq-XAehOmmfkqGfbdOu21cjda78';
var DRIVE_FOLDER_ID = '1Nymfju38BI7Y2LEhJ2nfTlErFU2T2A5P';

// Column order for MR_Visits sheet
var VISIT_COLUMNS = [
  'visit_id', 'mr_id', 'mr_name', 'timestamp_iso', 'event_type',
  'latitude', 'longitude', 'accuracy_m', 'doctor_name', 'doctor_degree',
  'doctor_specialty', 'clinic_name', 'city', 'products_discussed',
  'samples_given', 'order_value_inr', 'notes', 'day_session_id', 'photo_drive_link'
];

// ── Router ───────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    var action = e.parameter.action;
    if (action === 'validatePin')  return handleValidatePin(e);
    if (action === 'getProducts')  return handleGetProducts(e);
    if (action === 'getVisitsCSV') return handleGetVisitsCSV(e);
    if (action === 'registerMR')   return handleRegisterMR(e.parameter);
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    if (action === 'syncVisits')   return handleSyncVisits(body);
    if (action === 'uploadPhoto')  return handlePhotoUpload(body);
    if (action === 'registerMR')   return handleRegisterMR(body);
    return jsonResponse({ error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

function handleValidatePin(e) {
  var mr_id    = (e.parameter.mr_id    || '').toString().trim().toUpperCase();
  var pin_hash = (e.parameter.pin_hash || '').toString().trim().toLowerCase();

  if (!mr_id || !pin_hash) {
    return jsonResponse({ valid: false, error: 'Missing mr_id or pin_hash' });
  }

  var sheet = getSheet('MR_Employees');
  var data  = sheet.getDataRange().getValues();
  // Row 0 = headers: mr_id | mr_name | pin_hash | territory | reporting_manager | joined_date
  var headers = data[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  var idIdx   = headers.indexOf('mr_id');
  var nameIdx = headers.indexOf('mr_name');
  var hashIdx = headers.indexOf('pin_hash');
  var terrIdx = headers.indexOf('territory');
  var mgrIdx  = headers.indexOf('reporting_manager');

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowId   = (row[idIdx]   || '').toString().trim().toUpperCase();
    var rowHash = (row[hashIdx] || '').toString().trim().toLowerCase();
    if (rowId === mr_id && rowHash === pin_hash) {
      return jsonResponse({
        valid: true,
        mr_name:           (row[nameIdx] || '').toString(),
        territory:         (row[terrIdx] || '').toString(),
        reporting_manager: (row[mgrIdx]  || '').toString()
      });
    }
  }

  return jsonResponse({ valid: false });
}

function handleGetProducts(e) {
  var sheet   = getSheet('Products');
  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  var products = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue; // skip empty rows
    var product = {};
    headers.forEach(function(h, idx) { product[h] = row[idx]; });
    products.push(product);
  }
  return jsonResponse(products);
}

function handleSyncVisits(body) {
  var events = body.events;
  if (!Array.isArray(events) || events.length === 0) {
    return jsonResponse({ success: true, synced_ids: [], errors: [] });
  }

  var sheet      = getSheet('MR_Visits');
  var existingIds = getExistingVisitIds(sheet);
  var synced_ids  = [];
  var errors      = [];

  events.forEach(function(event) {
    try {
      var vid = (event.visit_id || '').toString().trim();
      if (!vid) { errors.push('Missing visit_id'); return; }

      // Idempotency: skip if already in sheet
      if (existingIds[vid]) {
        synced_ids.push(vid);
        return;
      }

      // Validate required fields
      if (!event.mr_id)       { errors.push(vid + ': missing mr_id');       return; }
      if (!event.timestamp_iso) { errors.push(vid + ': missing timestamp'); return; }
      if (!event.event_type)  { errors.push(vid + ': missing event_type');  return; }

      // Build row in column order
      var row = VISIT_COLUMNS.map(function(col) {
        var val = event[col];
        if (val === null || val === undefined) return '';
        return val;
      });

      sheet.appendRow(row);
      synced_ids.push(vid);
    } catch (err) {
      errors.push((event.visit_id || '?') + ': ' + err.message);
    }
  });

  return jsonResponse({ success: true, synced_ids: synced_ids, errors: errors });
}

function handlePhotoUpload(body) {
  var visit_id   = (body.visit_id   || '').toString().trim();
  var base64Data = (body.base64Data || '').toString();
  var mimeType   = (body.mimeType   || 'image/jpeg').toString();

  if (!visit_id || !base64Data) {
    return jsonResponse({ success: false, error: 'Missing visit_id or base64Data' });
  }

  try {
    var decoded  = Utilities.base64Decode(base64Data);
    var blob     = Utilities.newBlob(decoded, mimeType, visit_id + '.jpg');
    var folder   = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    var file     = folder.createFile(blob);

    // Share as "Anyone with link can view"
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var link = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    return jsonResponse({ success: true, drive_link: link });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function handleRegisterMR(body) {
  var mr_id   = (body.mr_id   || '').toString().trim().toUpperCase();
  var mr_name = (body.mr_name || '').toString().trim();
  var pin_hash = (body.pin_hash || '').toString().trim().toLowerCase();
  var territory = (body.territory || '').toString().trim();
  var reporting_manager = (body.reporting_manager || '').toString().trim();
  var joined_date = (body.joined_date || new Date().toISOString().slice(0, 10)).toString().trim();

  if (!mr_id || !mr_name || !pin_hash) {
    return jsonResponse({ success: false, error: 'Missing required fields: mr_id, mr_name, pin' });
  }

  var sheet = getSheet('MR_Employees');
  var data  = sheet.getDataRange().getValues();

  // Check for duplicate MR ID
  var headers = data[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  var idIdx   = headers.indexOf('mr_id');
  for (var i = 1; i < data.length; i++) {
    if ((data[i][idIdx] || '').toString().trim().toUpperCase() === mr_id) {
      return jsonResponse({ success: false, error: 'MR ID ' + mr_id + ' is already registered.' });
    }
  }

  sheet.appendRow([mr_id, mr_name, pin_hash, territory, reporting_manager, joined_date]);
  return jsonResponse({ success: true, mr_id: mr_id });
}

function handleGetVisitsCSV(e) {
  var sheet = getSheet('MR_Visits');
  var data  = sheet.getDataRange().getValues();
  var csv   = data.map(function(row) {
    return row.map(function(cell) {
      var s = String(cell);
      // Quote any cell that contains a comma, quote, or newline
      if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',');
  }).join('\n');
  return ContentService
    .createTextOutput(csv)
    .setMimeType(ContentService.MimeType.CSV);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function getSheet(name) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" not found. Check SHEET_ID and tab names.');
  return sheet;
}

function getExistingVisitIds(sheet) {
  var data     = sheet.getDataRange().getValues();
  var headers  = data[0].map(function(h) { return h.toString().toLowerCase().trim(); });
  var vidIdx   = headers.indexOf('visit_id');
  var ids      = {};
  if (vidIdx < 0) return ids;
  for (var i = 1; i < data.length; i++) {
    var id = (data[i][vidIdx] || '').toString().trim();
    if (id) ids[id] = true;
  }
  return ids;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
