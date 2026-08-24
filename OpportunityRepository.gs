/**
 * OpportunityRepository.gs
 * Responsabilidad única: persistencia de oportunidades en Google Sheets.
 *
 * Es el único archivo que conoce SpreadsheetApp, PropertiesService (para el
 * contador de numeración OP) y LockService. No conoce extracción IA, no
 * conoce PDF, no conoce HTML.
 *
 * El JSON de presentación (español) que llega aquí es la única fuente de
 * verdad: se guarda íntegro en la columna JSON. Las columnas UUID, OP,
 * Cliente, Teléfono, Fecha y Modificado son metadatos de la hoja para poder
 * localizar y buscar sin tener que deserializar el JSON de cada fila; no
 * sustituyen al JSON, lo acompañan.
 *
 * Reglas de integridad (Sprint 005, validadas por el Product Owner):
 * - El UUID es la única clave de persistencia. El OP nunca se usa para
 *   localizar una fila.
 * - Si no se recibe UUID, se trata como oportunidad nueva: se genera un
 *   UUID y un OP nuevos, y se ignora cualquier "Presupuesto" que trajera
 *   el JSON recibido.
 * - Si se recibe UUID, la fila se localiza siempre por ese UUID, y el OP
 *   se recupera de la fila original, descartando cualquier edición que el
 *   usuario haya podido hacer sobre ese campo en el formulario.
 */

const SHEET_COLUMNS_ = ['UUID', 'OP', 'Cliente', 'Teléfono', 'Fecha', 'Modificado', 'JSON'];
const COL_UUID_ = 1;
const COL_OP_ = 2;
const COL_CLIENTE_ = 3;
const COL_TELEFONO_ = 4;
const COL_FECHA_ = 5;
const COL_MODIFICADO_ = 6;
const COL_JSON_ = 7;

/**
 * Guarda una oportunidad: crea una fila nueva si no se recibe uuid, o
 * actualiza la fila existente si se recibe. El backend es siempre la
 * autoridad sobre UUID y OP (ver reglas de integridad en la cabecera).
 *
 * @param {Object} budget JSON de presentación (español) editado por el usuario
 * @param {string|null} uuid uuid existente, o null/undefined si es nueva
 * @return {{uuid: string, budget: Object}} datos ya persistidos, con
 *         "Presupuesto" y "Version" resueltos por el backend
 */
function guardarOportunidadEnHoja(budget, uuid) {
  if (!budget || typeof budget !== 'object') {
    throw new Error('No hay datos de oportunidad para guardar.');
  }

  const sheet = getSheet_();
  let targetUuid = uuid;
  let op;
  let existingRow = null;

  if (targetUuid) {
    existingRow = buscarFilaPorUuid_(targetUuid);
    if (!existingRow) {
      throw new Error('No se ha encontrado la oportunidad a actualizar.');
    }
    // La fila se localiza siempre por UUID. El OP se recupera de la fila
    // original: cualquier edición del usuario sobre ese campo se descarta.
    op = sheet.getRange(existingRow.rowIndex, COL_OP_).getValue();
  } else {
    // Oportunidad nueva: se ignora cualquier "Presupuesto" que trajera el
    // JSON recibido. El backend genera UUID y OP.
    targetUuid = Utilities.getUuid();
    op = generarSiguienteOp_();
  }

  // "Version" es metadato interno de formato (para migraciones futuras),
  // nunca visible ni impreso; se fija a 1 si todavía no existe.
  if (!budget['Version']) {
    budget['Version'] = 1;
  }

  budget['Presupuesto'] = op;

  const rowValues = [
    targetUuid,
    op,
    budget['Cliente'] || '',
    budget['Teléfono'] || '',
    budget['Fecha'] || '',
    new Date(),
    JSON.stringify(budget)
  ];

  if (existingRow) {
    sheet.getRange(existingRow.rowIndex, 1, 1, SHEET_COLUMNS_.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  debugLog_('Oportunidad guardada', { uuid: targetUuid, op: op, nueva: !existingRow });

  return { uuid: targetUuid, budget: budget };
}

/**
 * Recupera el JSON completo de una oportunidad a partir de su uuid, para
 * reutilizar el editor existente.
 *
 * @param {string} uuid
 * @return {Object|null} el JSON de presentación guardado, o null si no existe
 */
function obtenerOportunidadPorUuid(uuid) {
  if (!uuid) {
    throw new Error('Falta el identificador de la oportunidad.');
  }

  const found = buscarFilaPorUuid_(uuid);
  if (!found) return null;

  const sheet = getSheet_();
  const jsonText = sheet.getRange(found.rowIndex, COL_JSON_).getValue();

  try {
    return JSON.parse(jsonText);
  } catch (e) {
    debugLog_('Error al parsear JSON almacenado', { uuid: uuid, error: String(e) });
    throw new Error('No se ha podido leer la oportunidad almacenada.');
  }
}

/**
 * Quita acentos y pasa a minúsculas, para que la búsqueda no dependa de
 * cómo se haya escrito el texto (con o sin tildes, mayúsculas, etc.).
 */
function normalizarTexto_(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Búsqueda / listado de oportunidades: sirve tanto de "base de datos"
 * (query vacía devuelve las últimas, ordenadas por fecha de modificación
 * descendente) como de buscador inteligente (con texto, filtra por
 * palabras: cada palabra del texto tiene que aparecer en algún sitio -OP,
 * cliente o teléfono-, sin importar tildes, mayúsculas ni el orden de las
 * palabras). Devuelve resultados ligeros (sin el JSON completo, salvo el
 * total) para listar; el JSON se recupera aparte con
 * obtenerOportunidadPorUuid al abrir uno concreto.
 *
 * @param {string} query
 * @return {Array<{uuid:string, op:string, cliente:string, telefono:string, fecha:*, modificado:*, total:number}>}
 */
function buscarOportunidadesPorTexto(query) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, SHEET_COLUMNS_.length).getValues();
  const words = normalizarTexto_(query).split(/\s+/).filter(Boolean);

  const results = [];
  data.forEach(function (row) {
    const op = String(row[COL_OP_ - 1] || '');
    const cliente = String(row[COL_CLIENTE_ - 1] || '');
    const telefono = String(row[COL_TELEFONO_ - 1] || '');
    const haystack = normalizarTexto_(op + ' ' + cliente + ' ' + telefono);

    const matches = words.length === 0 || words.every(function (w) { return haystack.indexOf(w) !== -1; });
    if (!matches) return;

    let total = 0;
    try {
      total = Number(JSON.parse(row[COL_JSON_ - 1])['Total']) || 0;
    } catch (e) { /* fila corrupta: se lista igualmente, con total 0 */ }

    results.push({
      uuid: row[COL_UUID_ - 1],
      op: op,
      cliente: cliente,
      telefono: telefono,
      fecha: row[COL_FECHA_ - 1],
      modificado: row[COL_MODIFICADO_ - 1],
      total: total
    });
  });

  results.sort(function (a, b) { return new Date(b.modificado) - new Date(a.modificado); });
  return words.length === 0 ? results.slice(0, 200) : results;
}

/**
 * Genera el siguiente número OP mediante un contador en Script Properties
 * protegido con LockService. No depende del contenido de la hoja: sigue
 * siendo correcto con 10 filas o con 50.000, incluso si se borran filas
 * manualmente en Sheets.
 */
function generarSiguienteOp_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
  try {
    const props = PropertiesService.getScriptProperties();
    const last = Number(props.getProperty(LAST_OP_PROPERTY_KEY) || 0);
    const next = last + 1;
    props.setProperty(LAST_OP_PROPERTY_KEY, String(next));
    return CONFIG.OP_PREFIX + String(next).padStart(CONFIG.OP_PAD_LENGTH, '0');
  } finally {
    lock.releaseLock();
  }
}

/**
 * Abre (o crea, con su fila de cabecera) la hoja "Oportunidades" dentro
 * del spreadsheet configurado en Config.gs.
 *
 * La busqueda del nombre es tolerante a proposito. getSheetByName()
 * distingue mayusculas y espacios, asi que una pestaña llamada
 * "oportunidades" o "Oportunidades " no la encontraba: se creaba una
 * SEGUNDA pestaña vacia con el nombre exacto y la aplicacion leia de esa,
 * mientras los datos seguian en la original. El resultado era un listado
 * vacio sobre una hoja que si tenia oportunidades guardadas.
 *
 * Ahora, si no hay coincidencia exacta, se busca ignorando mayusculas y
 * espacios sobrantes y se reutiliza esa pestaña tal cual. No se renombra
 * (es la hoja del usuario) y solo se crea una nueva cuando de verdad no
 * existe ninguna.
 */
function getSheet_() {
  const ss = SpreadsheetApp.openById(getSpreadsheetId_());

  const exacta = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (exacta) return exacta;

  const buscado = String(CONFIG.SHEET_NAME).trim().toLowerCase();
  const equivalente = ss.getSheets().filter(function (s) {
    return String(s.getName()).trim().toLowerCase() === buscado;
  })[0];

  if (equivalente) {
    debugLog_('Pestaña localizada por nombre equivalente', {
      buscado: CONFIG.SHEET_NAME,
      encontrado: equivalente.getName()
    });
    return equivalente;
  }

  const nueva = ss.insertSheet(CONFIG.SHEET_NAME);
  nueva.appendRow(SHEET_COLUMNS_);
  debugLog_('Pestaña de oportunidades creada', { nombre: CONFIG.SHEET_NAME });
  return nueva;
}

/**
 * Localiza la fila de una oportunidad por su UUID (única clave de
 * persistencia; el OP nunca se usa para esto). Devuelve el índice de fila
 * (1-based, tal como lo espera Range) o null si no existe.
 */
function buscarFilaPorUuid_(uuid) {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const uuidValues = sheet.getRange(2, COL_UUID_, lastRow - 1, 1).getValues();
  for (let i = 0; i < uuidValues.length; i++) {
    if (uuidValues[i][0] === uuid) {
      return { rowIndex: i + 2 }; // +2: fila 1 es cabecera
    }
  }
  return null;
}
