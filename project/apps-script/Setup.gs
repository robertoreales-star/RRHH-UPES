// ════════════════════════════════════════════════════════════════
//  RRHH UPES — Google Apps Script  |  Setup.gs
//  Configuración inicial (ejecutar UNA SOLA VEZ)
// ════════════════════════════════════════════════════════════════

/**
 * Punto de entrada de la configuración inicial.
 * Ir a: Ejecutar > Ejecutar función > setupAll
 */
function setupAll() {
  Logger.log('══════════════════════════════════════════');
  Logger.log('  RRHH UPES — Configuración inicial');
  Logger.log('══════════════════════════════════════════');

  createSheets_();
  initCounters_();
  createDriveFolders_();
  printSummary_();

  Logger.log('');
  Logger.log('✓ Configuración completada.');
  Logger.log('Siguiente paso: Implementar > Implementar como aplicación web');
}

// ── Hojas de cálculo ───────────────────────────────────────────

function createSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ── Solicitudes ──
  var solSheet = getOrCreateSheet_(ss, SHEET_NAMES.SOLICITUDES);
  if (solSheet.getLastRow() === 0) {
    var solCols = [
      'timestamp', 'flow', 'numero_doc', 'nombre_empleado',
      'cargo', 'unidad', 'respuestas_json', 'archivo_url', 'estado', 'notas'
    ];
    solSheet.appendRow(solCols);
    styleHeader_(solSheet, solCols.length);
    solSheet.setFrozenRows(1);
    solSheet.setColumnWidth(7, 420);  // respuestas_json
    solSheet.setColumnWidth(8, 280);  // archivo_url
    Logger.log('✓ Hoja "Solicitudes" creada');
  } else {
    Logger.log('· Hoja "Solicitudes" ya existía');
  }

  // ── Expedientes ──
  var expSheet = getOrCreateSheet_(ss, SHEET_NAMES.EXPEDIENTES);
  if (expSheet.getLastRow() === 0) {
    var expCols = [
      'id', 'dui', 'nombre', 'datos_json',
      'ultima_actualizacion', 'archivo_pdf_url', 'foto_url'
    ];
    expSheet.appendRow(expCols);
    styleHeader_(expSheet, expCols.length);
    expSheet.setFrozenRows(1);
    expSheet.setColumnWidth(4, 420);  // datos_json
    Logger.log('✓ Hoja "Expedientes" creada');
  } else {
    Logger.log('· Hoja "Expedientes" ya existía');
  }

  // ── Contadores ──
  var cntSheet = getOrCreateSheet_(ss, SHEET_NAMES.CONTADORES);
  if (cntSheet.getLastRow() === 0) {
    cntSheet.appendRow(['codigo', 'ultimo_numero', 'ultima_actualizacion']);
    styleHeader_(cntSheet, 3);
    cntSheet.setFrozenRows(1);
    Logger.log('✓ Hoja "Contadores" creada');
  } else {
    Logger.log('· Hoja "Contadores" ya existía');
  }
}

function initCounters_() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var sheet   = ss.getSheetByName(SHEET_NAMES.CONTADORES);
  var data    = sheet.getDataRange().getValues();
  var existing = {};

  for (var i = 1; i < data.length; i++) {
    if (data[i][0]) existing[String(data[i][0])] = true;
  }

  COUNTER_CODES.forEach(function (code) {
    if (!existing[code]) {
      sheet.appendRow([code, 0, new Date().toISOString()]);
      Logger.log('✓ Contador inicializado: ' + code + ' = 0');
    } else {
      Logger.log('· Contador ya existe: ' + code);
    }
  });
}

// ── Carpetas de Drive ──────────────────────────────────────────

function createDriveFolders_() {
  var props = PropertiesService.getScriptProperties();

  // Carpeta raíz
  var rootId = props.getProperty('FOLDER_ROOT');
  var root   = null;

  if (rootId) {
    try   { root = DriveApp.getFolderById(rootId); }
    catch (e) { root = null; }
  }

  if (!root) {
    root = DriveApp.createFolder(DRIVE_FOLDERS.ROOT);
    props.setProperty('FOLDER_ROOT', root.getId());
    Logger.log('✓ Carpeta raíz creada: "' + DRIVE_FOLDERS.ROOT + '"  id=' + root.getId());
  } else {
    Logger.log('· Carpeta raíz ya existe: "' + DRIVE_FOLDERS.ROOT + '"');
  }

  // Subcarpetas
  var subNames = [
    DRIVE_FOLDERS.PERMISOS,
    DRIVE_FOLDERS.LICENCIAS,
    DRIVE_FOLDERS.INCAPACIDADES,
    DRIVE_FOLDERS.CONSTANCIAS,
    DRIVE_FOLDERS.EXPEDIENTES,
    DRIVE_FOLDERS.FOTOS
  ];

  subNames.forEach(function (name) {
    var key       = 'FOLDER_' + name.toUpperCase();
    var existId   = props.getProperty(key);
    var exists    = false;

    if (existId) {
      try { DriveApp.getFolderById(existId); exists = true; }
      catch (e) { /* fue eliminada, se recrea */ }
    }

    if (!exists) {
      var folder = root.createFolder(name);
      props.setProperty(key, folder.getId());
      Logger.log('✓ Subcarpeta creada: "' + name + '"  id=' + folder.getId());
    } else {
      Logger.log('· Subcarpeta ya existe: "' + name + '"');
    }
  });
}

// ── Resumen final ──────────────────────────────────────────────

function printSummary_() {
  var props = PropertiesService.getScriptProperties();
  var all   = props.getProperties();

  Logger.log('');
  Logger.log('── IDs de carpetas Drive (guárdalos como referencia) ──');
  Object.keys(all).sort().forEach(function (key) {
    if (key.startsWith('FOLDER_')) {
      Logger.log(
        '  ' + key.padEnd(24) + ' → ' +
        'https://drive.google.com/drive/folders/' + all[key]
      );
    }
  });
}

// ── Helpers privados ───────────────────────────────────────────

function getOrCreateSheet_(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function styleHeader_(sheet, numCols) {
  sheet.getRange(1, 1, 1, numCols)
    .setFontWeight('bold')
    .setBackground('#0D1B4B')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
}
