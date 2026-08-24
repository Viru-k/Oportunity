/**
 * Code.gs
 * Puente entre frontend y backend.
 * No implementa reglas de negocio: únicamente recibe llamadas y las delega.
 */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Oportunity')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Llamada expuesta al frontend mediante google.script.run.
 * Delega la extracción en OpenRouterService y la traducción de presentación
 * (claves en español, orden acordado, sin campos técnicos) en
 * PresentationMapper. El frontend nunca ve el JSON interno en inglés.
 *
 * @param {Array<{data: string, mimeType: string}>} images
 * @return {Object} JSON de presentación del presupuesto, en español
 */
function procesarOportunidad(images) {
  const internalBudget = extractBudgetFromImages(images);
  return mapBudgetToSpanish(internalBudget);
}

/**
 * Llamada expuesta al frontend mediante google.script.run.
 *
 * A partir de este sprint, generar el PDF implica siempre persistir antes
 * la oportunidad (nueva o existente): así el nº de presupuesto (OP) queda
 * asignado por el backend y aparece impreso en el documento, y cada PDF
 * generado corresponde siempre a una fila guardada en la hoja de
 * Oportunidades. Delega la persistencia en OpportunityRepository.gs y la
 * generación del PDF en PdfService.gs; no implementa reglas de negocio
 * propias.
 *
 * @param {Object} budget JSON de presentación (español) revisado por el usuario
 * @param {string|null} uuid uuid existente, o null/undefined si es nueva
 * @return {{base64: string, filename: string, uuid: string, budget: Object}}
 */
function generarPdf(budget, uuid) {
  const saved = guardarOportunidadEnHoja(budget, uuid);
  const pdf = generarPdfPresupuesto(saved.budget);
  enviarABitacora_(saved.budget, saved.uuid);
  return {
    base64: pdf.base64,
    filename: pdf.filename,
    uuid: saved.uuid,
    budget: saved.budget
  };
}

/**
 * Llamadas expuestas al frontend mediante google.script.run.
 * Delegan la persistencia en OpportunityRepository.gs. No implementan
 * reglas de negocio ni de integridad (numeración OP, localización por
 * UUID, etc.): esas viven exclusivamente en el repositorio.
 *
 * @param {Object} budget JSON de presentación (español) editado por el usuario
 * @param {string|null} uuid uuid existente, o null/undefined si es nueva
 * @return {{uuid: string, budget: Object}}
 */
function guardarOportunidad(budget, uuid) {
  const saved = guardarOportunidadEnHoja(budget, uuid);
  enviarABitacora_(saved.budget, saved.uuid);
  return saved;
}

/**
 * @param {string} uuid
 * @return {Object|null} JSON de presentación guardado, o null si no existe
 */
function obtenerOportunidad(uuid) {
  return obtenerOportunidadPorUuid(uuid);
}

/**
 * @param {string} query
 * @return {Array<{uuid:string, op:string, cliente:string, telefono:string, fecha:*}>}
 */
function buscarOportunidades(query) {
  return buscarOportunidadesPorTexto(query);
}

// Marcador temporal de depuracion: si esto NO aparece en pantalla al
// entrar en "Consultar base de datos", el despliegue activo no tiene este
// codigo (sigue sirviendo una version anterior).
function _versionMarker() {
  return 'MARCA-DEBUG-BITACORA-24JUL-B';
}

function _diagnosticoDesdeWebApp() {
  try {
    const ssId = getSpreadsheetId_();
    const sheet = getSheet_();
    const resultadoBusqueda = buscarOportunidadesPorTexto('');
    return {
      ok: true,
      ssId: ssId,
      ssNombre: sheet.getParent().getName(),
      hoja: sheet.getName(),
      ultimaFila: sheet.getLastRow(),
      usuarioEfectivo: Session.getEffectiveUser().getEmail(),
      usuarioActivo: (function () { try { return Session.getActiveUser().getEmail(); } catch (e) { return '(sin permiso para verlo)'; } })(),
      resultadosBusquedaDirecta: resultadoBusqueda.length
    };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
