/**
 * RRHH UPES — Configuración del backend Google Apps Script
 *
 * Instrucciones:
 *   1. Copia este archivo como  config.js  (en la misma carpeta que index.html).
 *   2. Reemplaza el valor de APPS_SCRIPT_URL con la URL de tu Web App desplegada.
 *      Formato: https://script.google.com/macros/s/AKfycb.../exec
 *   3. Incluye config.js en index.html ANTES de rrhh-api.js y ANTES de support.js:
 *
 *        <script src="./config.js"></script>
 *        <script src="./apps-script/frontend/rrhh-api.js"></script>
 *        <script src="./support.js"></script>
 *
 *   4. Cambia DEBUG a false cuando estés en producción.
 */

window.RRHH_CONFIG = {

  // URL del Apps Script desplegado como Web App
  APPS_SCRIPT_URL: 'REEMPLAZA_CON_TU_URL_AQUI',

  // true  → muestra logs en la consola del navegador
  // false → silencioso (usar en producción)
  DEBUG: true

};
