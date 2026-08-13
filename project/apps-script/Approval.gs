// ════════════════════════════════════════════════════════════════
//  RRHH UPES — Google Apps Script  |  Approval.gs
//  Flujo de autorización de permisos por correo electrónico
// ════════════════════════════════════════════════════════════════

// ── URL del Web App ───────────────────────────────────────────

function getScriptUrl_() {
  try { return ScriptApp.getService().getUrl(); }
  catch (e) {
    return PropertiesService.getScriptProperties().getProperty('SCRIPT_URL') || '';
  }
}

// ── Helpers de columnas dinámicas ─────────────────────────────

/**
 * Devuelve el índice 1-based de la columna con ese nombre en la fila 1.
 * Si no existe, la crea con estilo de encabezado y la devuelve.
 */
function findOrCreateColumn_(sheet, name) {
  var lastCol  = Math.max(sheet.getLastColumn(), 1);
  var headers  = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var idx      = headers.indexOf(name);
  if (idx >= 0) return idx + 1;

  var newCol = lastCol + 1;
  sheet.getRange(1, newCol)
    .setValue(name)
    .setFontWeight('bold')
    .setBackground('#0D1B4B')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');
  return newCol;
}

function setColValue_(sheet, rowIdx, name, value) {
  sheet.getRange(rowIdx, findOrCreateColumn_(sheet, name)).setValue(value);
}

function getColValue_(sheet, rowIdx, name) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var col     = headers.indexOf(name);
  return col < 0 ? '' : String(sheet.getRange(rowIdx, col + 1).getValue() || '');
}

// ── Búsqueda por token ─────────────────────────────────────────

/**
 * Busca la fila de Solicitudes con ese token.
 * Retorna { sheet, rowIdx, rowData } o null si no existe.
 */
function findRowByToken_(token) {
  var ss    = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAMES.SOLICITUDES);
  if (!sheet) return null;

  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(String);
  var tokCol  = headers.indexOf('token');
  if (tokCol < 0) return null;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][tokCol]) === token) {
      var rowData = {};
      headers.forEach(function (h, j) {
        var v = data[i][j];
        rowData[h] = v instanceof Date ? v.toISOString() : String(v || '');
      });
      return { sheet: sheet, rowIdx: i + 1, rowData: rowData };
    }
  }
  return null;
}

// ── Email al jefe inmediato ────────────────────────────────────

function sendApprovalEmail_(scriptUrl, rowData, answers, token) {
  var correoJefe = (answers.correo_jefe || '').trim();
  if (!correoJefe || !scriptUrl) return;

  var link  = scriptUrl + '?action=approveForm&token=' + token;
  var num   = rowData.numero_doc      || '';
  var nom   = rowData.nombre_empleado || '';
  var cargo = rowData.cargo           || '';
  var unid  = rowData.unidad          || '';
  var tipo  = answers.tipo            || '';
  var desde = answers.tp_fecha || answers.sa_desde || answers.cl_fecha ||
              answers.em_fecha || answers.ch_inicio || answers.mi_desde || '';
  var motivo = answers.tp_motivo || answers.sa_motivo || answers.rt_motivo ||
               answers.ch_motivo || answers.mi_descripcion || '';

  var rows = [
    ['Número',      num],
    ['Colaborador', nom],
    ['Cargo',       cargo],
    ['Unidad',      unid],
    ['Tipo',        tipo],
    ['Fecha',       desde],
    ['Motivo',      motivo]
  ].filter(function (r) { return r[1]; })
   .map(function (r) {
     return '<tr><td style="color:#888;font-size:12px;padding:7px 14px;white-space:nowrap">' + r[0] +
            '</td><td style="color:#1C2D5E;font-size:14px;font-weight:600;padding:7px 14px">' + esc_(r[1]) + '</td></tr>';
   }).join('');

  var html =
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0"><tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px">' +
    '<tr><td style="background:#0D1B4B;padding:22px 32px">' +
    '<div style="color:#F5A800;font-weight:bold;font-size:19px">UPES — Recursos Humanos</div>' +
    '<div style="color:#aab8d4;font-size:12px;margin-top:3px">Sistema de Gestión de Permisos</div>' +
    '</td></tr><tr><td style="padding:32px">' +
    '<p style="font-size:15px;color:#333;margin:0 0 6px">Estimado/a jefe inmediato,</p>' +
    '<p style="font-size:14px;color:#666;margin:0 0 22px">Has recibido una solicitud de permiso que requiere tu autorización:</p>' +
    '<table style="background:#f8f9fc;border-radius:8px;width:100%;border-collapse:collapse">' + rows + '</table>' +
    '<div style="text-align:center;margin:28px 0">' +
    '<a href="' + link + '" style="background:#1A3A8F;color:#fff;text-decoration:none;padding:14px 34px;border-radius:8px;font-weight:bold;font-size:15px;display:inline-block">Ver solicitud y autorizar →</a>' +
    '</div>' +
    '<p style="font-size:12px;color:#bbb;text-align:center;margin:0">Generado automáticamente por el Sistema RRHH de UPES · <a href="mailto:rrhh@upes.edu.sv" style="color:#1A3A8F">rrhh@upes.edu.sv</a></p>' +
    '</td></tr></table></td></tr></table></body></html>';

  MailApp.sendEmail({
    to:       correoJefe,
    subject:  '[UPES-RRHH] Solicitud de Permiso ' + num + ' — ' + nom,
    htmlBody: html
  });
}

// ── Página: formulario de autorización (jefe) ─────────────────

function approveFormPage(params) {
  var token = String(params.token || '').trim();
  if (!token) return htmlPage_('Error', '<p style="color:#c00">Enlace inválido. Contacta a RRHH.</p>');

  var found = findRowByToken_(token);
  if (!found) return htmlPage_('No encontrada',
    '<div style="text-align:center;padding:30px">' +
    '<div style="font-size:48px">🔍</div><h2 style="color:#0D1B4B">Solicitud no encontrada</h2>' +
    '<p style="color:#666">El enlace puede ser inválido o haber expirado.</p></div>');

  var rowData = found.rowData;

  if (rowData.respuesta_jefe) {
    var ic = rowData.respuesta_jefe === 'Autorizado' ? '✅' : '❌';
    return htmlPage_('Ya respondida',
      '<div style="text-align:center;padding:30px"><div style="font-size:48px">' + ic + '</div>' +
      '<h2 style="color:#0D1B4B">Solicitud ya respondida</h2>' +
      '<p style="color:#666">Fue marcada como <strong>' + esc_(rowData.respuesta_jefe) + '</strong>.<br>No se puede modificar.</p></div>');
  }

  var answers = {};
  try { answers = JSON.parse(rowData.respuestas_json || '{}'); } catch (e) {}

  var fields = [
    ['Número de solicitud', rowData.numero_doc],
    ['Colaborador',         rowData.nombre_empleado],
    ['Cargo',               rowData.cargo],
    ['Unidad',              rowData.unidad],
    ['Tipo de permiso',     answers.tipo],
    ['Fecha / Desde',       answers.tp_fecha || answers.sa_desde || answers.cl_fecha || answers.em_fecha || answers.ch_inicio || answers.mi_desde || ''],
    ['Horas solicitadas',   answers.tp_horas || answers.rt_horas || ''],
    ['Motivo',              answers.tp_motivo || answers.sa_motivo || answers.rt_motivo || answers.ch_motivo || answers.mi_descripcion || '']
  ].filter(function (f) { return f[1]; });

  var rows = fields.map(function (f) {
    return '<tr><td class="lbl">' + f[0] + '</td><td class="val">' + esc_(f[1]) + '</td></tr>';
  }).join('');

  var scriptUrl = getScriptUrl_();
  var html = CSS_() +
    '<div class="card">' +
    '<div class="hdr"><div class="brand">🎓 UPES — Recursos Humanos</div><div class="subbrand">Autorización de Solicitud de Permiso</div></div>' +
    '<div class="body">' +
    '<p style="color:#555;font-size:14px;margin:0 0 18px">Revisa los detalles de la solicitud y envía tu respuesta:</p>' +
    '<table class="info">' + rows + '</table>' +
    '<hr style="border:none;border-top:1px solid #eee;margin:24px 0">' +
    '<form action="' + scriptUrl + '" method="GET">' +
    '<input type="hidden" name="action" value="processApproval">' +
    '<input type="hidden" name="token" value="' + esc_(token) + '">' +
    '<div class="fg"><label>Decisión *</label>' +
    '<select name="respuesta" required class="sel">' +
    '<option value="">Selecciona tu decisión...</option>' +
    '<option value="Autorizado">✅  Autorizado</option>' +
    '<option value="Denegado">❌  Denegado</option>' +
    '</select></div>' +
    '<div class="fg"><label>Goce de sueldo</label>' +
    '<select name="goce" class="sel">' +
    '<option value="Con goce de sueldo">Con goce de sueldo</option>' +
    '<option value="Sin goce de sueldo">Sin goce de sueldo</option>' +
    '</select></div>' +
    '<div class="fg"><label>Observaciones (opcional)</label>' +
    '<textarea name="observaciones" class="ta" placeholder="Escribe cualquier observación..."></textarea></div>' +
    '<button type="submit" class="btn">Enviar respuesta</button>' +
    '</form>' +
    '<p style="font-size:12px;color:#bbb;text-align:center;margin-top:18px">Acceso exclusivo para el jefe inmediato · La respuesta no podrá modificarse.</p>' +
    '</div></div></body></html>';

  return HtmlService.createHtmlOutput(html).setTitle('Autorizar Permiso ' + (rowData.numero_doc || '') + ' — UPES');
}

// ── Página: procesar autorización del jefe ────────────────────

function processApprovalPage(params) {
  var token     = String(params.token         || '').trim();
  var respuesta = String(params.respuesta     || '').trim();
  var goce      = String(params.goce          || 'Con goce de sueldo').trim();
  var obs       = String(params.observaciones || '').trim();

  if (!token || !respuesta) {
    return htmlPage_('Error', '<p style="color:#c00">Datos incompletos. Vuelve al formulario e intenta de nuevo.</p>');
  }

  var found = findRowByToken_(token);
  if (!found) return htmlPage_('No encontrada', '<p>Solicitud no encontrada. El enlace puede ser inválido.</p>');

  var sheet   = found.sheet;
  var rowIdx  = found.rowIdx;
  var rowData = found.rowData;

  if (rowData.respuesta_jefe) {
    var ic = rowData.respuesta_jefe === 'Autorizado' ? '✅' : '❌';
    return htmlPage_('Ya respondida',
      '<div style="text-align:center;padding:30px"><div style="font-size:48px">' + ic + '</div>' +
      '<h2 style="color:#0D1B4B">Ya respondida</h2>' +
      '<p style="color:#666">Esta solicitud ya fue marcada como <strong>' + esc_(rowData.respuesta_jefe) + '</strong>.</p></div>');
  }

  // Actualizar hoja
  setColValue_(sheet, rowIdx, 'respuesta_jefe',     respuesta);
  setColValue_(sheet, rowIdx, 'goce',               goce);
  setColValue_(sheet, rowIdx, 'observaciones_jefe', obs);
  setColValue_(sheet, rowIdx, 'fecha_resp_jefe',    new Date().toISOString());
  setColValue_(sheet, rowIdx, 'estado',             respuesta === 'Autorizado' ? 'autorizado_jefe' : 'denegado_jefe');
  SpreadsheetApp.flush();

  var correoEmp = rowData.correo_empleado || '';
  var num       = rowData.numero_doc      || '';
  var nom       = rowData.nombre_empleado || '';

  // 1. Notificar al empleado
  if (correoEmp) sendEmployeeDecisionEmail_(correoEmp, nom, num, respuesta, goce, obs);

  // 2. Notificar a RRHH
  var scriptUrl = getScriptUrl_();
  sendRrhhNotificationEmail_(scriptUrl, token, rowData, respuesta, goce, obs);

  var icon = respuesta === 'Autorizado' ? '✅' : '❌';
  return htmlPage_('Respuesta registrada',
    '<div style="text-align:center;padding:20px">' +
    '<div style="font-size:52px;margin-bottom:14px">' + icon + '</div>' +
    '<h2 style="color:#0D1B4B;margin:0 0 10px">Respuesta registrada</h2>' +
    '<p style="color:#555;font-size:15px">Marcaste la solicitud <strong>' + esc_(num) + '</strong> como<br><strong>' + esc_(respuesta) + '</strong> — ' + esc_(goce) + '.</p>' +
    (obs ? '<p style="color:#888;font-size:13px;margin-top:8px">Observación: ' + esc_(obs) + '</p>' : '') +
    '<p style="color:#bbb;font-size:12px;margin-top:20px">El colaborador y el equipo de RRHH fueron notificados.</p>' +
    '</div>'
  ).setTitle('Respuesta Registrada — UPES');
}

// ── Email al empleado (decisión del jefe) ─────────────────────

function sendEmployeeDecisionEmail_(correo, nombre, numero_doc, respuesta, goce, obs) {
  var ok     = respuesta === 'Autorizado';
  var color  = ok ? '#16a34a' : '#dc2626';
  var icon   = ok ? '✅' : '❌';
  var titulo = ok ? '¡Permiso autorizado!' : 'Permiso denegado';
  var msg    = ok
    ? 'Tu jefe inmediato ha <strong>autorizado</strong> tu solicitud de permiso<br><strong>' + goce + '</strong>.'
    : 'Tu jefe inmediato ha <strong>denegado</strong> tu solicitud de permiso.';

  var html =
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0"><tr><td align="center">' +
    '<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:520px">' +
    '<tr><td style="background:#0D1B4B;padding:22px 28px"><div style="color:#F5A800;font-weight:bold;font-size:18px">UPES — Recursos Humanos</div></td></tr>' +
    '<tr><td style="padding:32px;text-align:center">' +
    '<div style="font-size:50px;margin-bottom:12px">' + icon + '</div>' +
    '<h2 style="color:' + color + ';margin:0 0 8px">' + titulo + '</h2>' +
    '<p style="color:#555;font-size:14px;margin:0 0 22px">' + msg + '</p>' +
    '<div style="background:#f8f9fc;border-radius:8px;padding:14px 20px;text-align:left;margin-bottom:18px">' +
    '<div style="font-size:12px;color:#888">Número de solicitud</div>' +
    '<div style="font-size:16px;font-weight:bold;color:#1C2D5E">' + esc_(numero_doc) + '</div>' +
    '</div>' +
    (obs ? '<div style="background:#fff8e1;border-left:4px solid #F5A800;padding:12px 16px;text-align:left;border-radius:4px;margin-bottom:18px">' +
      '<div style="font-size:12px;color:#888;margin-bottom:3px">Observación del jefe</div>' +
      '<div style="font-size:14px;color:#555">' + esc_(obs) + '</div></div>' : '') +
    '<p style="font-size:12px;color:#bbb">Consultas: <a href="mailto:rrhh@upes.edu.sv" style="color:#1A3A8F">rrhh@upes.edu.sv</a></p>' +
    '</td></tr></table></td></tr></table></body></html>';

  MailApp.sendEmail({
    to:       correo,
    subject:  ok
      ? '[UPES-RRHH] ✅ Tu permiso ' + numero_doc + ' fue autorizado'
      : '[UPES-RRHH] ❌ Tu permiso ' + numero_doc + ' fue denegado',
    htmlBody: html
  });
}

// ── Email a RRHH (resumen + link para denegar) ────────────────

function sendRrhhNotificationEmail_(scriptUrl, token, rowData, respuesta, goce, obs) {
  var rrhhLink  = scriptUrl + '?action=rrhhAction&token=' + token;
  var num       = rowData.numero_doc      || '';
  var nom       = rowData.nombre_empleado || '';
  var cargo     = rowData.cargo           || '';
  var ok        = respuesta === 'Autorizado';
  var colorResp = ok ? '#16a34a' : '#dc2626';

  var rows = [
    ['Número',       num],
    ['Colaborador',  nom],
    ['Cargo',        cargo],
    ['Decisión jefe', '<span style="color:' + colorResp + ';font-weight:bold">' + esc_(respuesta) + '</span>'],
    ['Tipo de goce', goce],
    ['Observación',  obs]
  ].filter(function (r) { return r[1]; })
   .map(function (r) {
     return '<tr><td style="color:#888;font-size:12px;padding:7px 14px;white-space:nowrap">' + r[0] +
            '</td><td style="color:#1C2D5E;font-size:14px;padding:7px 14px">' + r[1] + '</td></tr>';
   }).join('');

  var html =
    '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0"><tr><td align="center">' +
    '<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:560px">' +
    '<tr><td style="background:#0D1B4B;padding:22px 32px">' +
    '<div style="color:#F5A800;font-weight:bold;font-size:18px">UPES — RRHH · Revisión de Permiso</div>' +
    '</td></tr><tr><td style="padding:28px">' +
    '<p style="font-size:15px;color:#1C2D5E;margin:0 0 4px"><strong>El jefe inmediato respondió la solicitud:</strong></p>' +
    '<table style="background:#f8f9fc;border-radius:8px;width:100%;border-collapse:collapse;margin:16px 0">' + rows + '</table>' +
    '<p style="font-size:14px;color:#555;margin:0 0 18px">Si necesitas <strong>denegar o marcar como improcedente</strong> este permiso:</p>' +
    '<div style="text-align:center;margin:16px 0">' +
    '<a href="' + rrhhLink + '" style="background:#dc2626;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;font-size:14px;display:inline-block">Denegar / Improcedente →</a>' +
    '</div>' +
    '<p style="font-size:12px;color:#bbb;text-align:center">Si el permiso está correcto, no se requiere ninguna acción.</p>' +
    '</td></tr></table></td></tr></table></body></html>';

  MailApp.sendEmail({
    to:       'rrhh@upes.edu.sv',
    subject:  '[UPES-RRHH] Jefe respondió permiso ' + num + ' (' + respuesta + ') — ' + nom,
    htmlBody: html
  });
}

// ── Página: revisión RRHH ─────────────────────────────────────

function rrhhActionPage(params) {
  var token = String(params.token || '').trim();
  if (!token) return htmlPage_('Error', '<p style="color:#c00">Enlace inválido.</p>');

  var found = findRowByToken_(token);
  if (!found) return htmlPage_('No encontrada', '<p>Solicitud no encontrada.</p>');

  var rowData = found.rowData;

  if (rowData.respuesta_rrhh) {
    return htmlPage_('Ya procesada',
      '<div style="text-align:center;padding:30px"><div style="font-size:48px">✔️</div>' +
      '<h2 style="color:#0D1B4B">Ya procesada por RRHH</h2>' +
      '<p style="color:#666">Estado: <strong>' + esc_(rowData.respuesta_rrhh) + '</strong></p></div>');
  }

  var num   = rowData.numero_doc      || '';
  var nom   = rowData.nombre_empleado || '';
  var respJ = rowData.respuesta_jefe  || '';
  var goceJ = rowData.goce            || '';
  var obsJ  = rowData.observaciones_jefe || '';

  var rows = [
    ['N° solicitud',  num],
    ['Colaborador',   nom],
    ['Decisión jefe', respJ],
    ['Tipo de goce',  goceJ],
    ['Obs. jefe',     obsJ]
  ].filter(function (r) { return r[1]; })
   .map(function (r) {
     return '<tr><td class="lbl">' + r[0] + '</td><td class="val">' + esc_(r[1]) + '</td></tr>';
   }).join('');

  var scriptUrl = getScriptUrl_();
  var html = CSS_() +
    '<div class="card">' +
    '<div class="hdr"><div class="brand">🎓 UPES — Recursos Humanos</div><div class="subbrand">Revisión de Permiso · Solo RRHH</div></div>' +
    '<div class="body">' +
    '<p style="color:#555;font-size:14px;margin:0 0 18px">Estás a punto de denegar o marcar como improcedente esta solicitud:</p>' +
    '<table class="info">' + rows + '</table>' +
    '<hr style="border:none;border-top:1px solid #eee;margin:24px 0">' +
    '<form action="' + scriptUrl + '" method="GET">' +
    '<input type="hidden" name="action" value="processRrhh">' +
    '<input type="hidden" name="token" value="' + esc_(token) + '">' +
    '<div class="fg"><label>Decisión RRHH *</label>' +
    '<select name="decision" required class="sel">' +
    '<option value="">Selecciona...</option>' +
    '<option value="Denegado">❌ Denegado</option>' +
    '<option value="Improcedente">⚠️ Improcedente</option>' +
    '</select></div>' +
    '<div class="fg"><label>Motivo / Observaciones *</label>' +
    '<textarea name="motivo" class="ta" required placeholder="Explica el motivo de la denegatoria o improcedencia..."></textarea></div>' +
    '<button type="submit" class="btn" style="background:#dc2626">Confirmar denegatoria</button>' +
    '</form>' +
    '<p style="font-size:12px;color:#bbb;text-align:center;margin-top:18px">Esta acción notificará al colaborador con la decisión final.</p>' +
    '</div></div></body></html>';

  return HtmlService.createHtmlOutput(html).setTitle('Revisión RRHH — ' + num);
}

// ── Página: procesar decisión RRHH ────────────────────────────

function processRrhhPage(params) {
  var token    = String(params.token    || '').trim();
  var decision = String(params.decision || '').trim();
  var motivo   = String(params.motivo   || '').trim();

  if (!token || !decision || !motivo) {
    return htmlPage_('Error', '<p style="color:#c00">Datos incompletos. Vuelve al formulario.</p>');
  }

  var found = findRowByToken_(token);
  if (!found) return htmlPage_('No encontrada', '<p>Solicitud no encontrada.</p>');

  var sheet   = found.sheet;
  var rowIdx  = found.rowIdx;
  var rowData = found.rowData;

  if (rowData.respuesta_rrhh) {
    return htmlPage_('Ya procesada',
      '<p>Esta solicitud ya fue procesada por RRHH: <strong>' + esc_(rowData.respuesta_rrhh) + '</strong></p>');
  }

  setColValue_(sheet, rowIdx, 'respuesta_rrhh',     decision);
  setColValue_(sheet, rowIdx, 'observaciones_rrhh', motivo);
  setColValue_(sheet, rowIdx, 'fecha_resp_rrhh',    new Date().toISOString());
  setColValue_(sheet, rowIdx, 'estado',             'denegado_rrhh');
  SpreadsheetApp.flush();

  var correoEmp = rowData.correo_empleado || '';
  var num       = rowData.numero_doc      || '';

  if (correoEmp) {
    var html =
      '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,sans-serif">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="padding:30px 0"><tr><td align="center">' +
      '<table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:520px">' +
      '<tr><td style="background:#0D1B4B;padding:22px 28px"><div style="color:#F5A800;font-weight:bold;font-size:18px">UPES — Recursos Humanos</div></td></tr>' +
      '<tr><td style="padding:32px;text-align:center">' +
      '<div style="font-size:50px;margin-bottom:12px">❌</div>' +
      '<h2 style="color:#dc2626;margin:0 0 8px">Permiso ' + esc_(decision) + '</h2>' +
      '<p style="color:#555;font-size:14px;margin:0 0 20px">El equipo de RRHH ha marcado tu solicitud <strong>' + esc_(num) + '</strong> como <strong>' + esc_(decision) + '</strong>.</p>' +
      '<div style="background:#fff8e1;border-left:4px solid #F5A800;padding:12px 16px;text-align:left;border-radius:4px;margin-bottom:20px">' +
      '<div style="font-size:12px;color:#888;margin-bottom:3px">Motivo</div>' +
      '<div style="font-size:14px;color:#555">' + esc_(motivo) + '</div></div>' +
      '<p style="font-size:12px;color:#bbb">Para mayor información: <a href="mailto:rrhh@upes.edu.sv" style="color:#1A3A8F">rrhh@upes.edu.sv</a></p>' +
      '</td></tr></table></td></tr></table></body></html>';
    MailApp.sendEmail({
      to:       correoEmp,
      subject:  '[UPES-RRHH] ❌ Tu permiso ' + num + ' — ' + decision + ' por RRHH',
      htmlBody: html
    });
  }

  return htmlPage_('Decisión registrada',
    '<div style="text-align:center;padding:20px">' +
    '<div style="font-size:50px;margin-bottom:12px">✔️</div>' +
    '<h2 style="color:#0D1B4B;margin:0 0 10px">Decisión registrada</h2>' +
    '<p style="color:#555">La solicitud <strong>' + esc_(num) + '</strong> fue marcada como <strong>' + esc_(decision) + '</strong>.</p>' +
    '<p style="color:#888;font-size:13px">El colaborador fue notificado por correo.</p></div>'
  ).setTitle('RRHH — Decisión registrada');
}

// ── Utilidades HTML compartidas ───────────────────────────────

function CSS_() {
  return '<!DOCTYPE html><html lang="es"><head>' +
    '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>' +
    'body{margin:0;padding:20px 16px;background:#f5f7fa;font-family:Arial,sans-serif;min-height:100vh}' +
    '.card{background:#fff;border-radius:14px;max-width:560px;margin:0 auto;box-shadow:0 4px 24px rgba(0,0,0,.1);overflow:hidden}' +
    '.hdr{background:#0D1B4B;padding:22px 28px}' +
    '.brand{color:#F5A800;font-weight:bold;font-size:18px}' +
    '.subbrand{color:#aab8d4;font-size:12px;margin-top:3px}' +
    '.body{padding:26px}' +
    '.info{width:100%;border-collapse:collapse;background:#f8f9fc;border-radius:8px;overflow:hidden;margin-bottom:6px}' +
    '.lbl{color:#888;font-size:12px;padding:8px 14px;width:130px;vertical-align:top}' +
    '.val{color:#1C2D5E;font-size:14px;font-weight:600;padding:8px 14px}' +
    '.fg{margin-bottom:15px}' +
    '.fg label{display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:5px}' +
    '.sel,.ta{width:100%;padding:10px 12px;border:1.5px solid #dde1f0;border-radius:8px;font-size:14px;box-sizing:border-box;font-family:Arial,sans-serif}' +
    '.ta{height:88px;resize:vertical}' +
    '.sel:focus,.ta:focus{outline:none;border-color:#1A3A8F}' +
    '.btn{width:100%;padding:14px;background:#1A3A8F;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:bold;cursor:pointer;margin-top:6px}' +
    '.btn:hover{opacity:.9}' +
    '@media(max-width:480px){.body{padding:18px}}' +
    '</style></head><body>';
}

function htmlPage_(title, bodyHtml) {
  return HtmlService.createHtmlOutput(
    CSS_() +
    '<div class="card">' +
    '<div class="hdr"><div class="brand">🎓 UPES — Recursos Humanos</div></div>' +
    '<div class="body">' + bodyHtml + '</div>' +
    '</div></body></html>'
  ).setTitle(title + ' — UPES');
}

function esc_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
