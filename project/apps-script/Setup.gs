// ════════════════════════════════════════════════════════════════
//  RRHH UPES — Google Apps Script  |  Setup.gs
//  Configuración inicial (ejecutar UNA SOLA VEZ)
// ════════════════════════════════════════════════════════════════

/**
 * Punto de entrada. Ejecutar desde: Ejecutar > setupAll
 * Crea la carpeta RRHH-UPES en Drive, el Spreadsheet dentro de ella
 * y las hojas Solicitudes / Expedientes / Contadores.
 */
function setupAll() {
  Logger.log('══════════════════════════════════════════');
  Logger.log('  RRHH UPES — Configuración inicial');
  Logger.log('══════════════════════════════════════════');

  createDriveFolders_();   // 1. Carpeta raíz + subcarpetas
  createSpreadsheet_();    // 2. Spreadsheet dentro de la carpeta raíz
  createSheets_();         // 3. Hojas dentro del Spreadsheet
  initCounters_();         // 4. Filas de contadores
  printSummary_();

  Logger.log('');
  Logger.log('✓ Configuración completada.');
  Logger.log('Siguiente paso: Implementar > Administrar implementaciones > Nueva versión');
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
    DRIVE_FOLDERS.FOTOS,
    DRIVE_FOLDERS.CODIGOS,
    DRIVE_FOLDERS.POLITICAS,
    DRIVE_FOLDERS.REGLAMENTOS,
    DRIVE_FOLDERS.MANUALES,
    DRIVE_FOLDERS.INSTRUCTIVOS
  ];

  subNames.forEach(function (name) {
    var key     = 'FOLDER_' + name.toUpperCase();
    var existId = props.getProperty(key);
    var exists  = false;

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

// ── Spreadsheet ────────────────────────────────────────────────

function createSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');

  if (ssId) {
    try {
      SpreadsheetApp.openById(ssId);
      Logger.log('· Spreadsheet ya existe (id=' + ssId + ')');
      return;
    } catch (e) { /* no existe, se crea */ }
  }

  var ss = SpreadsheetApp.create('RRHH UPES — Datos');
  ssId   = ss.getId();
  props.setProperty('SPREADSHEET_ID', ssId);

  // Mover a la carpeta raíz de Drive
  var rootId = props.getProperty('FOLDER_ROOT');
  if (rootId) {
    var ssFile = DriveApp.getFileById(ssId);
    var root   = DriveApp.getFolderById(rootId);
    root.addFile(ssFile);
    DriveApp.getRootFolder().removeFile(ssFile); // quitar de "Mi unidad"
  }

  Logger.log('✓ Spreadsheet creado: "RRHH UPES — Datos"');
  Logger.log('  URL: https://docs.google.com/spreadsheets/d/' + ssId);
}

// ── Hojas de cálculo ───────────────────────────────────────────

function createSheets_() {
  var ss = getSpreadsheet_();

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
    solSheet.setColumnWidth(7, 420);
    solSheet.setColumnWidth(8, 280);
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
    expSheet.setColumnWidth(4, 420);
    Logger.log('✓ Hoja "Expedientes" creada');
  } else {
    Logger.log('· Hoja "Expedientes" ya existía');
  }

  // ── Reportes SSO ──
  var ssoSheet = getOrCreateSheet_(ss, SHEET_NAMES.REPORTES_SSO);
  if (ssoSheet.getLastRow() === 0) {
    var ssoCols = [
      'timestamp', 'tipo', 'nombre', 'area',
      'lugar', 'descripcion', 'riesgo', 'detalles_json', 'estado', 'notas'
    ];
    ssoSheet.appendRow(ssoCols);
    styleHeader_(ssoSheet, ssoCols.length);
    ssoSheet.setFrozenRows(1);
    ssoSheet.setColumnWidth(8, 380);
    Logger.log('✓ Hoja "Reportes SSO" creada');
  } else {
    Logger.log('· Hoja "Reportes SSO" ya existía');
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

  // Eliminar "Sheet1" por defecto si quedó vacía
  var defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('Hoja 1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getNumSheets() > 1) {
    ss.deleteSheet(defaultSheet);
    Logger.log('· Hoja por defecto eliminada');
  }
}

function initCounters_() {
  var ss      = getSpreadsheet_();
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

// ── Resumen final ──────────────────────────────────────────────

function printSummary_() {
  var props = PropertiesService.getScriptProperties();
  var all   = props.getProperties();
  var ssId  = props.getProperty('SPREADSHEET_ID');

  Logger.log('');
  Logger.log('── Spreadsheet (abre este link) ──');
  Logger.log('  https://docs.google.com/spreadsheets/d/' + ssId);
  Logger.log('');
  Logger.log('── Carpetas Drive ──');
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
