// ════════════════════════════════════════════════════════════════
//  RRHH UPES — Google Apps Script  |  Code.gs
//  Router principal + constantes globales
// ════════════════════════════════════════════════════════════════

// ── Constantes ─────────────────────────────────────────────────

var SHEET_NAMES = {
  SOLICITUDES: 'Solicitudes',
  EXPEDIENTES: 'Expedientes',
  CONTADORES:  'Contadores'
};

var DRIVE_FOLDERS = {
  ROOT:          'RRHH-UPES',
  PERMISOS:      'Permisos',
  LICENCIAS:     'Licencias',
  INCAPACIDADES: 'Incapacidades',
  CONSTANCIAS:   'Constancias',
  EXPEDIENTES:   'Expedientes',
  FOTOS:         'Fotos'
};

// Claves válidas para incrementCounter
var COUNTER_CODES = [
  'UPES-RH-PER',  // Permisos
  'UPES-RH-LIC',  // Licencias
  'UPES-RH-INC',  // Incapacidades
  'UPES-RH-CON',  // Constancias
  'UPES-RH-ORD'   // Órdenes de descuento
];

// ── Router GET ─────────────────────────────────────────────────

function doGet(e) {
  var params = e.parameter || {};
  var action = params.action || '';
  var result;

  try {
    switch (action) {
      case 'getSheet':
        result = getSheet(params);
        break;
      case 'ping':
        result = {
          ok:      true,
          message: 'RRHH UPES API activa',
          ts:      new Date().toISOString()
        };
        break;
      default:
        result = { ok: false, error: 'Acción GET desconocida: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  return jsonResponse_(result);
}

// ── Router POST ────────────────────────────────────────────────

function doPost(e) {
  var params  = e.parameter || {};
  var action  = params.action || '';
  var payload = {};

  try {
    payload = JSON.parse(params.payload || '{}');
  } catch (err) {
    return jsonResponse_({ ok: false, error: 'Payload inválido: ' + err.message });
  }

  var result;
  try {
    switch (action) {
      case 'submitForm':
        result = submitForm(payload);
        break;
      case 'uploadFile':
        result = uploadFile(payload);
        break;
      case 'incrementCounter':
        result = incrementCounter(payload);
        break;
      case 'upsertExpediente':
        result = upsertExpediente(payload);
        break;
      default:
        result = { ok: false, error: 'Acción POST desconocida: ' + action };
    }
  } catch (err) {
    result = { ok: false, error: err.message };
  }

  return jsonResponse_(result);
}

// ── Helper ─────────────────────────────────────────────────────

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
