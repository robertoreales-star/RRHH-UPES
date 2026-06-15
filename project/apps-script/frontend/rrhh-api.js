/**
 * RRHH UPES — Cliente del backend Google Apps Script
 *
 * Cómo incluirlo en index.html (después de config.js, antes de support.js):
 *
 *   <script src="./config.js"></script>
 *   <script src="./apps-script/frontend/rrhh-api.js"></script>
 *   <script src="./support.js"></script>
 *
 * Uso desde cualquier componente del portal:
 *
 *   // Obtener número de documento
 *   const ctr = await window.RrhhAPI.incrementCounter('UPES-RH-PER');
 *   // ctr.formatted → 'UPES-RH-PER-0001'
 *
 *   // Guardar respuestas del chatbot
 *   await window.RrhhAPI.submitForm({
 *     flow: 'permiso',
 *     numero_doc: ctr.formatted,
 *     nombre_empleado: 'Juan Pérez',
 *     answers: { ... }
 *   });
 *
 *   // Subir PDF a Drive
 *   const base64 = window.RrhhAPI.pdfToBase64(jsPdfDoc);
 *   const file = await window.RrhhAPI.uploadFile(
 *     ctr.formatted + '.pdf', 'application/pdf', base64, 'permisos'
 *   );
 *   // file.viewUrl → URL de visualización en Drive
 */

(function () {
  'use strict';

  var cfg     = window.RRHH_CONFIG || {};
  var BASE    = cfg.APPS_SCRIPT_URL || '';
  var DEBUG   = cfg.DEBUG !== false;

  function log() {
    if (DEBUG) {
      var args = Array.prototype.slice.call(arguments);
      console.log.apply(console, ['[RRHH API]'].concat(args));
    }
  }

  // ── Transporte ───────────────────────────────────────────────

  function doGet(action, extra) {
    var params = Object.assign({ action: action }, extra || {});
    var qs     = new URLSearchParams(params).toString();
    log('GET', action, extra || {});
    return fetch(BASE + '?' + qs)
      .then(function (r) { return r.json(); })
      .then(function (d) { log('←', d); return d; });
  }

  function doPost(action, payload) {
    log('POST', action, payload);
    var form = new URLSearchParams();
    form.append('action',  action);
    form.append('payload', JSON.stringify(payload));
    return fetch(BASE, { method: 'POST', body: form })
      .then(function (r) { return r.json(); })
      .then(function (d) { log('←', d); return d; });
  }

  // ── API pública ──────────────────────────────────────────────

  window.RrhhAPI = {

    /**
     * Verifica que el backend esté activo y accesible.
     * Útil para diagnosticar la configuración antes de usar el portal.
     * @returns {Promise<{ok:boolean, message:string, ts:string}>}
     */
    ping: function () {
      return doGet('ping');
    },

    /**
     * Retorna todas las filas de una hoja como array de objetos.
     * @param {string} sheetName  Nombre de la hoja (Solicitudes | Expedientes | Contadores)
     * @param {number} [limit]    Máximo de filas (default 500)
     * @returns {Promise<{ok:boolean, sheet:string, rows:object[], total:number}>}
     */
    getSheet: function (sheetName, limit) {
      return doGet('getSheet', { sheet: sheetName, limit: limit || 500 });
    },

    /**
     * Guarda las respuestas de un chatbot en la hoja Solicitudes.
     * Llamar DESPUÉS de incrementCounter para tener el numero_doc.
     *
     * @param {object}  data
     * @param {string}  data.flow              permiso|licencia|incapacidad|constancia|orden
     * @param {string}  data.numero_doc         UPES-RH-PER-0001
     * @param {string}  data.nombre_empleado
     * @param {string}  [data.cargo]
     * @param {string}  [data.unidad]
     * @param {object}  data.answers            respuestas completas del chatbot
     * @param {string}  [data.archivo_url]      URL Drive del adjunto (si se subió)
     * @returns {Promise<{ok:boolean, message:string, flow:string, numero_doc:string}>}
     */
    submitForm: function (data) {
      return doPost('submitForm', data);
    },

    /**
     * Incrementa el contador y devuelve el número formateado.
     * Llamar ANTES de generar el PDF para obtener el número de documento.
     *
     * @param {string} code  UPES-RH-PER | UPES-RH-LIC | UPES-RH-INC | UPES-RH-CON | UPES-RH-ORD
     * @returns {Promise<{ok:boolean, code:string, number:number, formatted:string}>}
     */
    incrementCounter: function (code) {
      return doPost('incrementCounter', { code: code });
    },

    /**
     * Sube un archivo a la carpeta Drive correspondiente.
     *
     * @param {string} name      Nombre del archivo (e.g. "UPES-RH-PER-0001.pdf")
     * @param {string} mimeType  "application/pdf" | "image/jpeg" | "image/png"
     * @param {string} base64    Datos del archivo en base64 (sin prefijo "data:...")
     * @param {string} folder    permisos | licencias | incapacidades | constancias | expedientes | fotos
     * @returns {Promise<{ok:boolean, fileId:string, url:string, viewUrl:string, folder:string, name:string}>}
     */
    uploadFile: function (name, mimeType, base64, folder) {
      return doPost('uploadFile', {
        name:     name,
        mimeType: mimeType,
        data:     base64,
        folder:   folder
      });
    },

    /**
     * Crea o actualiza la ficha de un empleado (Formato 06).
     * Si ya existe un registro con el mismo DUI, lo sobreescribe.
     *
     * @param {object}  data
     * @param {string}  data.dui               Número de DUI (identificador único)
     * @param {string}  data.nombre
     * @param {object}  data.datos             Datos completos del Formato 06
     * @param {string}  [data.archivo_pdf_url] URL Drive del PDF
     * @param {string}  [data.foto_url]        URL Drive de la foto
     * @returns {Promise<{ok:boolean, action:'created'|'updated', dui:string}>}
     */
    upsertExpediente: function (data) {
      return doPost('upsertExpediente', data);
    },

    /**
     * Extrae el base64 de un documento jsPDF para subir a Drive.
     * Usar junto con uploadFile().
     *
     * @param  {jsPDF} jsPdfDoc  Instancia de jsPDF después de generar el documento
     * @returns {string}          base64 sin prefijo
     */
    pdfToBase64: function (jsPdfDoc) {
      var dataUri = jsPdfDoc.output('datauristring');
      return dataUri.split(',')[1];
    }
  };

  if (!BASE) {
    console.warn(
      '[RRHH API] APPS_SCRIPT_URL no está configurada.\n' +
      'Edita config.js y agrega la URL de tu Web App desplegada.'
    );
  } else {
    log('Cliente listo. URL:', BASE);
  }

})();
