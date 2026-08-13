// ════════════════════════════════════════════════════════════════
//  RRHH UPES — Google Apps Script  |  Api.gs
//  Handlers de todos los endpoints
// ════════════════════════════════════════════════════════════════


// ── submitForm ─────────────────────────────────────────────────
//
//  Guarda las respuestas de un chatbot en la hoja "Solicitudes".
//
//  payload: {
//    flow:             string   permiso|licencia|incapacidad|constancia|orden
//    numero_doc:       string   UPES-RH-PER-0001
//    nombre_empleado:  string
//    cargo?:           string
//    unidad?:          string
//    answers:          object   respuestas completas del chatbot
//    archivo_url?:     string   URL Drive del adjunto (si se subió)
//  }
//
function submitForm(payload) {
  if (!payload.flow)       throw new Error('Campo requerido: flow');
  if (!payload.numero_doc) throw new Error('Campo requerido: numero_doc');

  var ss    = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.SOLICITUDES);
  if (!sheet) throw new Error(
    'Hoja "' + SHEET_NAMES.SOLICITUDES + '" no encontrada. ' +
    'Ejecuta setupAll() desde el editor de Apps Script primero.'
  );

  var archivoCell = payload.archivo_url || '';
  if (payload.adjunto_url) {
    archivoCell = archivoCell
      ? archivoCell + ' | adjunto: ' + payload.adjunto_url
      : 'adjunto: ' + payload.adjunto_url;
  }

  sheet.appendRow([
    new Date().toISOString(),       // timestamp
    payload.flow,                   // flow
    payload.numero_doc,             // numero_doc
    payload.nombre_empleado || '',  // nombre_empleado
    payload.cargo           || '',  // cargo
    payload.unidad          || '',  // unidad
    JSON.stringify(payload.answers || {}), // respuestas_json
    archivoCell,                    // archivo_url (PDF generado | adjunto original)
    'pendiente',                    // estado
    ''                              // notas
  ]);

  // Flujo de aprobación por email (solo para permisos)
  if (payload.flow === 'permiso') {
    var answers      = payload.answers || {};
    var correoEmp    = String(answers.correo_empleado || '').trim();
    var correoJefe   = String(answers.correo_jefe     || '').trim();
    var token        = Utilities.getUuid();
    var newRowIdx    = sheet.getLastRow();

    setColValue_(sheet, newRowIdx, 'correo_empleado', correoEmp);
    setColValue_(sheet, newRowIdx, 'correo_jefe',     correoJefe);
    setColValue_(sheet, newRowIdx, 'token',           token);
    SpreadsheetApp.flush();

    if (correoJefe) {
      try {
        var scriptUrl = getScriptUrl_();
        if (!scriptUrl) throw new Error('URL del script vacía — ejecuta configurarEmails() en el editor');
        var rowData   = {
          numero_doc:      payload.numero_doc        || '',
          nombre_empleado: payload.nombre_empleado   || '',
          cargo:           payload.cargo             || '',
          unidad:          payload.unidad            || ''
        };
        sendApprovalEmail_(scriptUrl, rowData, answers, token);
        setColValue_(sheet, newRowIdx, 'notas', 'Email enviado al jefe: ' + correoJefe);
      } catch (mailErr) {
        Logger.log('⚠ Error al enviar email: ' + mailErr.message);
        // Registra el error en la hoja para que RRHH lo vea
        setColValue_(sheet, newRowIdx, 'notas', '⚠ Email no enviado: ' + mailErr.message);
      }
    } else {
      setColValue_(sheet, newRowIdx, 'notas', '⚠ Sin correo de jefe — email no enviado');
    }
  }

  return {
    ok:         true,
    message:    'Solicitud registrada correctamente',
    flow:       payload.flow,
    numero_doc: payload.numero_doc
  };
}


// ── incrementCounter ───────────────────────────────────────────
//
//  Lee el contador actual, lo incrementa y devuelve el número
//  formateado. La operación usa un lock para evitar duplicados
//  en accesos concurrentes.
//
//  payload: { code: 'UPES-RH-PER' }
//
//  Retorna: { ok:true, code, number:42, formatted:'UPES-RH-PER-0042' }
//
function incrementCounter(payload) {
  if (!payload.code) throw new Error('Campo requerido: code');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    var ss    = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEET_NAMES.CONTADORES);
    if (!sheet) throw new Error(
      'Hoja "' + SHEET_NAMES.CONTADORES + '" no encontrada. ' +
      'Ejecuta setupAll() primero.'
    );

    var data   = sheet.getDataRange().getValues();
    var rowIdx = -1;

    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === payload.code) {
        rowIdx = i + 1; // 1-indexed para getRange
        break;
      }
    }

    if (rowIdx < 0) {
      throw new Error(
        'Código desconocido: "' + payload.code + '". ' +
        'Válidos: ' + COUNTER_CODES.join(', ')
      );
    }

    var next = (Number(data[rowIdx - 1][1]) || 0) + 1;

    sheet.getRange(rowIdx, 2).setValue(next);
    sheet.getRange(rowIdx, 3).setValue(new Date().toISOString());
    SpreadsheetApp.flush(); // escritura inmediata antes de liberar lock

    return {
      ok:        true,
      code:      payload.code,
      number:    next,
      formatted: payload.code + '-' + String(next).padStart(4, '0')
    };

  } finally {
    lock.releaseLock();
  }
}


// ── uploadFile ─────────────────────────────────────────────────
//
//  Recibe un archivo en base64, lo sube a la subcarpeta Drive
//  correspondiente y retorna la URL de descarga y visualización.
//
//  payload: {
//    name:     string   nombre del archivo  "UPES-RH-PER-0001.pdf"
//    mimeType: string   "application/pdf" | "image/jpeg" | "image/png"
//    data:     string   contenido en base64 (sin prefijo data:...)
//    folder:   string   permisos|licencias|incapacidades|constancias|expedientes|fotos
//  }
//
function uploadFile(payload) {
  if (!payload.name)   throw new Error('Campo requerido: name');
  if (!payload.data)   throw new Error('Campo requerido: data (base64)');
  if (!payload.folder) throw new Error('Campo requerido: folder');

  var props = PropertiesService.getScriptProperties();
  var key   = 'FOLDER_' + payload.folder.toUpperCase();
  var fId   = props.getProperty(key);

  if (!fId) {
    var available = Object.keys(props.getProperties())
      .filter(function (k) { return k.startsWith('FOLDER_') && k !== 'FOLDER_ROOT'; })
      .map(function (k) { return k.replace('FOLDER_', '').toLowerCase(); });
    throw new Error(
      'Carpeta "' + payload.folder + '" no encontrada. ' +
      'Carpetas disponibles: ' + (available.join(', ') || 'ninguna — ejecuta setupAll()')
    );
  }

  var folder   = DriveApp.getFolderById(fId);
  var mimeType = payload.mimeType || 'application/pdf';
  var bytes    = Utilities.base64Decode(payload.data);
  var blob     = Utilities.newBlob(bytes, mimeType, payload.name);
  var file     = folder.createFile(blob);

  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return {
    ok:      true,
    fileId:  file.getId(),
    url:     file.getDownloadUrl(),
    viewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/view',
    folder:  payload.folder,
    name:    payload.name
  };
}


// ── getSheet ───────────────────────────────────────────────────
//
//  Devuelve las filas de una hoja como array de objetos JSON.
//  La primera fila se usa como nombres de columna.
//
//  params: {
//    sheet:  string   nombre de la hoja
//    limit?: number   máximo de filas (default 500, max 1000)
//  }
//
//  Retorna: { ok:true, sheet, rows:[{col:val,...}], total:n }
//
function getSheet(params) {
  if (!params.sheet) throw new Error('Parámetro requerido: sheet');

  var ss    = getSpreadsheet_();
  var sheet = ss.getSheetByName(params.sheet);
  if (!sheet) throw new Error('Hoja "' + params.sheet + '" no encontrada');

  var data  = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { ok: true, sheet: params.sheet, rows: [], total: 0 };
  }

  var headers = data[0].map(String);
  var limit   = Math.min(parseInt(params.limit || '500', 10), 1000);
  var rows    = [];

  for (var i = 1; i < data.length && rows.length < limit; i++) {
    var row = {};
    headers.forEach(function (h, j) {
      var val = data[i][j];
      row[h] = val instanceof Date ? val.toISOString() : val;
    });
    rows.push(row);
  }

  return { ok: true, sheet: params.sheet, rows: rows, total: rows.length };
}


// ── getFormByNum ───────────────────────────────────────────────
//
//  Devuelve la fila de Solicitudes que coincida con numero_doc.
//
//  payload: { numero_doc: 'UPES-RH-PER-0001', dui?: string }
//  Retorna: { ok, found, row }  (row incluye answers parseadas)
//
function getFormByNum(payload) {
  if (!payload.numero_doc) throw new Error('Campo requerido: numero_doc');

  var ss    = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.SOLICITUDES);
  if (!sheet) throw new Error('Hoja "' + SHEET_NAMES.SOLICITUDES + '" no encontrada');

  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(String);

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(payload.numero_doc)) {
      var row = {};
      headers.forEach(function (h, j) {
        var val = data[i][j];
        row[h] = val instanceof Date ? val.toISOString() : val;
      });
      try { row.answers = JSON.parse(row.respuestas_json || '{}'); } catch (e) { row.answers = {}; }
      return { ok: true, found: true, row: row };
    }
  }

  return { ok: true, found: false, row: null };
}


// ── updateForm ─────────────────────────────────────────────────
//
//  Añade una nota de modificación y actualiza el estado de una
//  solicitud existente, identificada por numero_doc.
//
//  payload: {
//    numero_doc:  string
//    dui?:        string   (informativo, no valida acceso aquí)
//    nota?:       string   descripción de los cambios solicitados
//    estado?:     string   nuevo estado (default: 'solicitud de modificación')
//    answers?:    object   respuestas actualizadas (opcional)
//    adjunto_url?: string  URL del adjunto si se subió uno nuevo
//  }
//
function updateForm(payload) {
  if (!payload.numero_doc) throw new Error('Campo requerido: numero_doc');

  var ss    = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.SOLICITUDES);
  if (!sheet) throw new Error('Hoja "' + SHEET_NAMES.SOLICITUDES + '" no encontrada');

  var data   = sheet.getDataRange().getValues();
  var rowIdx = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]) === String(payload.numero_doc)) {
      rowIdx = i + 1; // 1-indexed
      break;
    }
  }

  if (rowIdx < 0) {
    return { ok: false, error: 'No se encontró la solicitud: ' + payload.numero_doc };
  }

  var tz = Session.getScriptTimeZone();
  var ts = Utilities.formatDate(new Date(), tz, 'dd/MM/yyyy HH:mm');

  // Actualizar estado (columna 9)
  sheet.getRange(rowIdx, 9).setValue(payload.estado || 'solicitud de modificación');

  // Añadir nota (columna 10) — acumula historial
  if (payload.nota) {
    var prev = String(sheet.getRange(rowIdx, 10).getValue() || '');
    var entry = ts + ': ' + payload.nota + (payload.dui ? ' [DUI: ' + payload.dui + ']' : '');
    sheet.getRange(rowIdx, 10).setValue(prev ? prev + '\n' + entry : entry);
  }

  // Actualizar respuestas si se envían (columna 7)
  if (payload.answers) {
    sheet.getRange(rowIdx, 7).setValue(JSON.stringify(payload.answers));
  }

  // Actualizar URL de adjunto si se subió uno nuevo (columna 8)
  if (payload.adjunto_url) {
    var prevUrl = String(sheet.getRange(rowIdx, 8).getValue() || '');
    sheet.getRange(rowIdx, 8).setValue(prevUrl ? prevUrl + ' | ' + payload.adjunto_url : payload.adjunto_url);
  }

  return { ok: true, message: 'Solicitud actualizada', numero_doc: payload.numero_doc };
}


// ── submitSso ──────────────────────────────────────────────────
//
//  Registra un reporte de acción o condición insegura en la hoja
//  "Reportes SSO".
//
//  payload: {
//    tipo:         string   'condicion' | 'accion'
//    nombre:       string
//    area:         string
//    lugar:        string
//    descripcion:  string
//    riesgo:       string   Bajo|Medio|Alto|Crítico
//    answers:      object   respuestas completas del chatbot
//  }
//
function submitSso(payload) {
  if (!payload.tipo)   throw new Error('Campo requerido: tipo');

  var ss    = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.REPORTES_SSO);
  if (!sheet) throw new Error(
    'Hoja "' + SHEET_NAMES.REPORTES_SSO + '" no encontrada. ' +
    'Ejecuta setupAll() desde el editor de Apps Script primero.'
  );

  sheet.appendRow([
    new Date().toISOString(),                   // timestamp
    payload.tipo,                               // tipo
    payload.nombre      || '',                  // nombre
    payload.area        || '',                  // area
    payload.lugar       || '',                  // lugar
    payload.descripcion || '',                  // descripcion
    payload.riesgo      || '',                  // riesgo
    JSON.stringify(payload.answers || {}),      // detalles_json
    'pendiente',                                // estado
    ''                                          // notas
  ]);

  return {
    ok:      true,
    message: 'Reporte SSO registrado correctamente',
    tipo:    payload.tipo
  };
}


// ── upsertExpediente ───────────────────────────────────────────
//
//  Crea o actualiza el Formato 06 de un empleado.
//  Busca por DUI; si existe, actualiza; si no, crea fila nueva.
//
//  payload: {
//    dui:              string   identificador único del empleado
//    nombre:           string
//    datos:            object   datos completos del Formato 06
//    archivo_pdf_url?: string   URL Drive del PDF generado
//    foto_url?:        string   URL Drive de la foto
//  }
//
function upsertExpediente(payload) {
  if (!payload.dui)    throw new Error('Campo requerido: dui');
  if (!payload.nombre) throw new Error('Campo requerido: nombre');

  var ss    = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.EXPEDIENTES);
  if (!sheet) throw new Error(
    'Hoja "' + SHEET_NAMES.EXPEDIENTES + '" no encontrada. ' +
    'Ejecuta setupAll() primero.'
  );

  var data   = sheet.getDataRange().getValues();
  var rowIdx = -1;

  // Buscar fila existente por DUI (columna B, índice 1)
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(payload.dui)) {
      rowIdx = i + 1;
      break;
    }
  }

  var now     = new Date().toISOString();
  var rowData = [
    payload.dui,                            // id
    payload.dui,                            // dui
    payload.nombre,                         // nombre
    JSON.stringify(payload.datos || {}),    // datos_json
    now,                                    // ultima_actualizacion
    payload.archivo_pdf_url || '',          // archivo_pdf_url
    payload.foto_url        || ''           // foto_url
  ];

  if (rowIdx > 0) {
    sheet.getRange(rowIdx, 1, 1, 7).setValues([rowData]);
    return { ok: true, action: 'updated', dui: payload.dui };
  } else {
    sheet.appendRow(rowData);
    return { ok: true, action: 'created', dui: payload.dui };
  }
}
