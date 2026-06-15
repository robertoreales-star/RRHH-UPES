# Guía de implementación — RRHH UPES Backend

## Requisitos previos
- Cuenta Google personal (gmail.com) o institucional
- Acceso a [Google Drive](https://drive.google.com) y [Google Sheets](https://sheets.google.com)
- No se necesita servidor, dominio ni pago

---

## Paso 1 — Crear el Google Sheet

1. Ve a [https://sheets.google.com](https://sheets.google.com)
2. Clic en **"+"** para crear una hoja nueva
3. Renómbrala a: `RRHH UPES - Base de Datos`
   - Doble clic en "Sin título" arriba a la izquierda → escribe el nombre → Enter

---

## Paso 2 — Abrir el editor de Apps Script

1. En la hoja recién creada, ve al menú: **Extensiones > Apps Script**
2. Se abrirá el editor en una nueva pestaña
3. Renombra el proyecto: clic en "Proyecto sin título" arriba a la izquierda → `RRHH UPES API` → clic en **Cambiar nombre**

---

## Paso 3 — Crear los archivos del script

En el editor de Apps Script verás un archivo `Código.gs` por defecto.

### 3a. Reemplazar `Código.gs`

1. Clic en el archivo `Código.gs` en el panel izquierdo
2. Selecciona todo el contenido (Ctrl+A) y bórralo
3. Copia y pega el contenido completo del archivo `Code.gs` de esta carpeta
4. Guarda con Ctrl+S (o el ícono de disco)

### 3b. Crear `Setup.gs`

1. Clic en **"+"** junto a "Archivos" en el panel izquierdo → selecciona **Script**
2. Escribe `Setup` como nombre (sin extensión)
3. Borra el contenido del nuevo archivo
4. Copia y pega el contenido completo del archivo `Setup.gs` de esta carpeta
5. Guarda con Ctrl+S

### 3c. Crear `Api.gs`

1. Repite el mismo proceso: **"+"** → **Script** → nombre `Api`
2. Copia y pega el contenido completo del archivo `Api.gs`
3. Guarda con Ctrl+S

### 3d. Editar `appsscript.json` (manifiesto)

1. En el menú superior del editor: **Ver > Mostrar archivo de manifiesto**
2. Clic en `appsscript.json` en el panel izquierdo
3. Reemplaza **todo** el contenido con el del archivo `appsscript.json` de esta carpeta
4. Guarda con Ctrl+S

**Al terminar, el panel izquierdo debe mostrar:**
```
Archivos
  appsscript.json
  Api.gs
  Código.gs   (es Code.gs)
  Setup.gs
```

---

## Paso 4 — Ejecutar la configuración inicial

1. En el editor, abre `Setup.gs`
2. En el menú superior desplegable de funciones (donde dice "seleccionar función"), elige **`setupAll`**
3. Clic en el botón **Ejecutar** (triángulo ▶)
4. Primera vez que ejecutas: Google pedirá permisos
   - Clic en **"Revisar permisos"**
   - Selecciona tu cuenta Google
   - Si aparece "Google no ha verificado esta aplicación", clic en **"Configuración avanzada"** → **"Ir a RRHH UPES API (no seguro)"**
   - Clic en **Permitir**
5. Espera que termine la ejecución (~10-20 segundos)
6. Clic en **Ver > Registros de ejecución** para ver el resultado

**El log debe mostrar algo como:**
```
══════════════════════════════════════════
  RRHH UPES — Configuración inicial
══════════════════════════════════════════
✓ Hoja "Solicitudes" creada
✓ Hoja "Expedientes" creada
✓ Hoja "Contadores" creada
✓ Contador inicializado: UPES-RH-PER = 0
✓ Contador inicializado: UPES-RH-LIC = 0
✓ Contador inicializado: UPES-RH-INC = 0
✓ Contador inicializado: UPES-RH-CON = 0
✓ Contador inicializado: UPES-RH-ORD = 0
✓ Carpeta raíz creada: "RRHH-UPES"
✓ Subcarpeta creada: "Permisos"
✓ Subcarpeta creada: "Licencias"
✓ Subcarpeta creada: "Incapacidades"
✓ Subcarpeta creada: "Constancias"
✓ Subcarpeta creada: "Expedientes"
✓ Subcarpeta creada: "Fotos"

── IDs de carpetas Drive ──
  FOLDER_CONSTANCIAS  → https://drive.google.com/drive/folders/...
  FOLDER_EXPEDIENTES  → https://drive.google.com/drive/folders/...
  ...

✓ Configuración completada.
```

> **Guarda los links de las carpetas Drive** que aparecen en el log. Los necesitarás para verificar que los archivos se están subiendo correctamente.

---

## Paso 5 — Desplegar como Web App

1. En el editor de Apps Script, clic en **Implementar** (botón azul arriba a la derecha)
2. Selecciona **"Nueva implementación"**
3. Clic en el ícono de engranaje ⚙ junto a "Seleccionar tipo" → elige **"Aplicación web"**
4. Configura:
   - **Descripción:** `RRHH UPES API v1`
   - **Ejecutar como:** `Yo (tu correo@gmail.com)`
   - **Quién tiene acceso:** `Cualquier usuario`
5. Clic en **Implementar**
6. Si pide autorización, repite el proceso de permisos del Paso 4
7. **Copia la URL de la aplicación web** que aparece en el modal

La URL tendrá este formato:
```
https://script.google.com/macros/s/AKfycb.../exec
```

> **Guarda esta URL.** La necesitarás para configurar el portal.

---

## Paso 6 — Verificar que el backend funciona

Abre una nueva pestaña en el navegador y pega esta URL (reemplaza con tu URL):

```
https://script.google.com/macros/s/TU_URL_AQUI/exec?action=ping
```

Debes ver esta respuesta JSON:
```json
{
  "ok": true,
  "message": "RRHH UPES API activa",
  "ts": "2026-06-15T20:00:00.000Z"
}
```

Si ves eso, el backend está funcionando correctamente.

---

## Paso 7 — Configurar el portal (preparación para Fase 3)

1. En la carpeta del portal, copia el archivo `apps-script/frontend/config.template.js`
   como `config.js` en la misma carpeta que `index.html`

2. Edita `config.js` y reemplaza la URL:
   ```javascript
   window.RRHH_CONFIG = {
     APPS_SCRIPT_URL: 'https://script.google.com/macros/s/TU_URL_REAL/exec',
     DEBUG: true
   };
   ```

3. Los scripts ya están listos en `apps-script/frontend/rrhh-api.js`.
   En la Fase 3, se agregarán estas líneas a `index.html` antes de `support.js`:
   ```html
   <script src="./config.js"></script>
   <script src="./apps-script/frontend/rrhh-api.js"></script>
   ```

---

## Referencia rápida de endpoints

| Método | Acción | Qué hace |
|--------|--------|----------|
| GET | `?action=ping` | Verifica que la API está activa |
| GET | `?action=getSheet&sheet=Solicitudes` | Retorna todas las solicitudes |
| GET | `?action=getSheet&sheet=Contadores` | Retorna el estado de los contadores |
| POST | `action=submitForm` | Guarda respuestas del chatbot |
| POST | `action=incrementCounter` | Obtiene el siguiente número de documento |
| POST | `action=uploadFile` | Sube un PDF o imagen a Drive |
| POST | `action=upsertExpediente` | Crea/actualiza Formato 06 |

---

## Solución de problemas

### "Hoja X no encontrada"
Volver al editor de Apps Script y ejecutar `setupAll()` nuevamente.

### "La URL no responde" o error 403
Verificar que en la configuración del despliegue, "Quién tiene acceso" sea **"Cualquier usuario"** (no "Solo usuarios de mi organización").

### "Error al subir archivo" (uploadFile)
Verificar que `setupAll()` haya creado las carpetas Drive. Revisar los logs del Paso 4.

### Cambios en el código no se reflejan
Cada vez que modifiques el código del Apps Script, debes hacer una **nueva implementación**:
- Implementar → Administrar implementaciones → clic en el lápiz ✏ → "Nueva versión" → Implementar

### Contador no incrementa
Es probable que el script no tenga permiso de escritura en la hoja. Ejecutar `setupAll()` de nuevo y asegurarse de que los permisos fueron aceptados.
