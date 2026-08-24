/**
 * BitacoraIntegration.gs
 * Responsabilidad unica: comunicacion con el Web App de Bitacora.
 *
 * Dos direcciones:
 * 1) Salida: cada vez que se guarda una oportunidad aqui, se envia una
 *    copia a Bitacora (volcado automatico). Es "best effort": si Bitacora
 *    no responde o no esta configurada, no se lanza excepcion y la
 *    generacion de PDF sigue funcionando con normalidad.
 * 2) Entrada: Bitacora pide el PDF de una oportunidad concreta (por uuid)
 *    cuando alguien pulsa "Ver presupuesto" en su modal. Esa peticion
 *    llega por doPost (ver mas abajo) y se resuelve reutilizando
 *    obtenerOportunidadPorUuid + generarPdfPresupuesto, sin volver a
 *    guardar nada.
 */

// ID de la hoja de calculo de Bitacora (pestaña 'Datos'). Como este script
// y el de Bitacora se ejecutan ambos "como Yo" (el mismo propietario), se
// escribe directamente en la hoja en vez de llamar al Web App por HTTP,
// evitando los problemas de autenticacion entre proyectos distintos.
const BITACORA_SPREADSHEET_ID_ = '1FEgYinCoy4SsRsF3G5J_Cbo5qvPvr7h5C8HQwMhKQ_k';
const BITACORA_SHEET_NAME_ = 'Datos';

/**
 * Envia una copia de la oportunidad guardada a Bitacora, escribiendo
 * directamente en su hoja de calculo. Se llama despues de
 * guardarOportunidadEnHoja, nunca antes: Bitacora necesita el OP y el
 * uuid ya resueltos por el backend.
 *
 * Idempotente por uuid (columna 'oppUuid' en Bitacora): si ya existe una
 * fila con ese uuid, la actualiza en vez de duplicar.
 *
 * @param {Object} budget JSON de presentacion (espanol), ya persistido
 * @param {string} uuid uuid de la oportunidad
 */
function enviarABitacora_(budget, uuid) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    debugLog_('No se pudo obtener lock para enviar a Bitacora', { uuid: uuid, error: String(e) });
    return;
  }
  try {
    const ss = SpreadsheetApp.openById(BITACORA_SPREADSHEET_ID_);
    const sheet = ss.getSheetByName(BITACORA_SHEET_NAME_);
    if (!sheet) {
      debugLog_('Hoja Datos no encontrada en Bitacora', { uuid: uuid });
      return;
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const values = sheet.getDataRange().getValues();
    const oppCol = headers.indexOf('oppUuid');
    const idCol = headers.indexOf('id');
    const creadoCol = headers.indexOf('creado');

    let targetRow = -1;
    if (oppCol !== -1) {
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][oppCol]) === String(uuid)) { targetRow = i + 1; break; }
      }
    }

    const generadoPorEmail = Session.getActiveUser().getEmail();
    const asesor = buscarUsuarioBitacoraPorEmail_(ss, generadoPorEmail);

    const nowIso = new Date().toISOString();
    const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    const rowObj = {
      id: targetRow !== -1 ? values[targetRow - 1][idCol] : Date.now(),
      num: budget['Presupuesto'] || '',
      nombre: budget['Cliente'] || '',
      telefono: budget['Telefono'] || budget['Teléfono'] || '',
      importe: Number(budget['Total']) || 0,
      tipo: '',
      medio: '',
      notas: JSON.stringify([]),
      seguimientos: JSON.stringify({}),
      fechaPres: budget['Fecha'] || hoy,
      fechaSig: '',
      horaSig: '',
      status: 'nuevopixis',
      creado: targetRow !== -1 ? values[targetRow - 1][creadoCol] : hoy,
      medicionHecha: false,
      fechaMedicion: '',
      instaladorMedicion: '',
      woMedicion: '',
      instalacionHecha: false,
      fechaInstalacion: '',
      instalador: '',
      woInstalacion: '',
      mediciones: JSON.stringify([]),
      instalaciones: JSON.stringify([]),
      asesorEmail: asesor ? asesor.email : '',
      asesorNombre: asesor ? asesor.nombre : '',
      color: '',
      lastModified: nowIso,
      origen: 'opportunity',
      oppUuid: uuid
    };

    const rowValues = headers.map(function(h) {
      const val = rowObj[h];
      return (val === undefined || val === null) ? '' : val;
    });

    if (targetRow === -1) {
      sheet.appendRow(rowValues);
    } else {
      sheet.getRange(targetRow, 1, 1, rowValues.length).setValues([rowValues]);
    }
    debugLog_('Oportunidad volcada en Bitacora', { uuid: uuid, fila: targetRow === -1 ? 'nueva' : targetRow });
  } catch (e) {
    // Best effort: un fallo al escribir en Bitacora nunca debe impedir que
    // el usuario obtenga su PDF.
    debugLog_('Error volcando oportunidad en Bitacora', { uuid: uuid, error: String(e) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Busca un usuario activo por email en la hoja 'Usuarios' de Bitacora.
 * Devuelve {email, nombre} o null si no se encuentra (o esta inactivo).
 */
function buscarUsuarioBitacoraPorEmail_(ss, email) {
  if (!email) return null;
  const sh = ss.getSheetByName('Usuarios');
  if (!sh) return null;
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return null;
  const headers = rows[0];
  const emailIdx = headers.indexOf('email');
  const nombreIdx = headers.indexOf('nombre');
  const activoIdx = headers.indexOf('activo');
  const target = String(email).toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][emailIdx] || '').toLowerCase() === target) {
      const activo = String(rows[i][activoIdx]).toLowerCase() !== 'false';
      if (!activo) return null;
      return { email: rows[i][emailIdx], nombre: rows[i][nombreIdx] || '' };
    }
  }
  return null;
}

/**
 * Punto de entrada para Bitacora cuando la llama como libreria de Apps
 * Script (en vez de por HTTP): evita toda la capa de autenticacion entre
 * proyectos, ya que la libreria se ejecuta con los mismos permisos que el
 * script que la invoca.
 *
 * @param {string} uuid uuid de la oportunidad
 * @return {Object|null} { base64, filename } o null si no existe
 */
function obtenerPdfPorUuidParaBitacora(uuid) {
  const budget = obtenerOportunidadPorUuid(uuid);
  if (!budget) return null;
  return generarPdfPresupuesto(budget);
}

/**
 * Atiende peticiones HTTP entrantes desde Bitacora. Unica accion soportada
 * de momento: 'obtenerPdf'. Se mantiene por si en el futuro os interesa
 * volver a la via HTTP (p.ej. si cambian las politicas de Workspace), pero
 * la integracion actual usa obtenerPdfPorUuidParaBitacora() como libreria.
 * Espera un POST con JSON: { secret, action: 'obtenerPdf', uuid }.
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'JSON invalido' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (!body || body.secret !== getIntegrationSecret_()) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'No autorizado' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (body.action === 'obtenerPdf') {
    return handleObtenerPdf_(body.uuid);
  }

  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Accion no reconocida' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleObtenerPdf_(uuid) {
  try {
    const budget = obtenerOportunidadPorUuid(uuid);
    if (!budget) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Oportunidad no encontrada' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const pdf = generarPdfPresupuesto(budget);
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      base64: pdf.base64,
      filename: pdf.filename
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(e && e.message || e) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
