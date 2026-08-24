/**
 * Config.gs
 * Responsabilidad única: centralizar toda la configuración de Oportunity.
 * Ninguna clave ni parámetro debe escribirse fuera de este archivo.
 *
 * El prompt del sistema vive en Prompt.gs (PROMPT.SYSTEM_PROMPT), no aquí:
 * este archivo es solo configuración técnica.
 */

const CONFIG = {
  OPENROUTER_API_URL: 'https://openrouter.ai/api/v1/chat/completions',
  MODEL: 'google/gemma-4-31b-it:free',
  TEMPERATURE: 0.1,

  // --- Sprint 005: persistencia de oportunidades ---
  // Pestaña de datos. Se estrena una nueva para partir de cero, dejando
  // intacta la anterior ('Oportunidades') con su historico: alli hay
  // presupuestos con importes a cero por extracciones incompletas, y
  // mezclarlos con los nuevos solo enturbiaria el listado.
  SHEET_NAME: 'Oportunidades v2',

  // Tipo de IVA aplicado al calcular los importes (BudgetNormalizer.gs).
  IVA_RATE: 0.21,

  // Maximo de presupuestos que devuelve el listado de una vez. La pantalla
  // se los trae todos al entrar y filtra en local, asi que este numero es
  // el techo de lo que se puede buscar sin volver al servidor.
  MAX_LISTADO: 1000,
  OP_PREFIX: 'OP-',
  OP_PAD_LENGTH: 6,
  LOCK_TIMEOUT_MS: 30000
};

/**
 * ⚠️ MODO DEBUG TEMPORAL ⚠️
 * Activa el registro técnico detallado en Logger.log() dentro de
 * OpenRouterService.gs (código HTTP, cuerpo de respuesta, modelo, tamaño
 * de imagen, URL de destino). No cambia ningún comportamiento ni mensaje
 * mostrado al usuario: solo añade trazabilidad para depuración.
 *
 * Poner a false (o eliminar este bloque) en cuanto termine la depuración.
 */
const DEBUG = true;

/**
 * Versión interna de la aplicación. Uso exclusivo de desarrollo/soporte
 * (se imprime muy pequeña en el pie del PDF para identificar con qué
 * versión se generó un documento concreto); no es un dato de cara al
 * cliente ni forma parte del presupuesto.
 */
const APP_VERSION = '0.3.0';

/**
 * Clave de Script Properties donde OpportunityRepository.gs guarda el
 * contador interno de numeración OP. Vive aquí, y no hardcodeada en
 * OpportunityRepository.gs, porque este archivo centraliza toda clave o
 * parámetro de configuración (ver cabecera de este fichero).
 */
const LAST_OP_PROPERTY_KEY = 'LAST_OP_NUMBER';

/**
 * Datos fijos de la propia empresa que genera el documento (no son datos
 * extraídos de la captura ni del cliente). Se imprimen siempre igual en
 * el bloque izquierdo del PDF (ver PdfService.gs -> tiendaLines).
 *
 * ⚠️ Sustituye estos valores de ejemplo por los reales de la empresa antes
 * de generar PDFs definitivos.
 */
const COMPANY = {
  NAME: 'Leroy Merlin LA CORUNA',
  ADDRESS_LINE_1: 'c.c Marineda City',
  ADDRESS_LINE_2: '15008 LA CORUNA',
  PHONE: '881 900 900'
};

/**
 * Devuelve la API key de OpenRouter desde Script Properties.
 * Nunca debe hardcodearse la clave en el código.
 */
function getOpenRouterApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('OPENROUTER_API_KEY');
  if (!key) {
    throw new Error('Falta configurar OPENROUTER_API_KEY en Script Properties.');
  }
  return key;
}

/**
 * Devuelve el ID de la hoja de cálculo de Google Sheets donde se
 * persisten las oportunidades (OpportunityRepository.gs). Mismo patrón
 * que getOpenRouterApiKey_(): nunca se hardcodea, siempre en Script
 * Properties.
 *
 * Respaldo: si SPREADSHEET_ID no está configurada y el script está
 * vinculado a una hoja de cálculo (que es como se usa: Oportunity se
 * lanza desde una hoja en Drive), se usa esa misma hoja. Así la pestaña
 * de Oportunidades se crea sola dentro del fichero desde el que abres la
 * aplicación, sin tener que configurar nada a mano.
 *
 * La propiedad sigue mandando cuando existe: configúrala si algún día
 * quieres persistir en una hoja distinta de la que abre la aplicación.
 * El respaldo solo entra cuando no hay propiedad, así que no cambia el
 * destino de ninguna instalación que ya la tenga puesta.
 */
function getSpreadsheetId_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return id;

  // getActiveSpreadsheet() devuelve null en un script independiente, y
  // lanza excepción en algunos contextos de ejecución; ninguno de los dos
  // casos debe enmascarar el mensaje de configuración de más abajo.
  let bound = null;
  try {
    bound = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    bound = null;
  }

  if (bound) {
    return bound.getId();
  }

  throw new Error(
    'Falta configurar SPREADSHEET_ID en Script Properties ' +
    '(y este script no está vinculado a ninguna hoja de cálculo).'
  );
}

/**
 * Integracion con Bitacora: URL del Web App de Bitacora y secreto
 * compartido. Deben coincidir con los valores guardados en las Script
 * Properties del proyecto Bitacora ('opportunity_webapp_url' e
 * 'integration_secret' alli; 'BITACORA_WEBAPP_URL' e 'INTEGRATION_SECRET'
 * aqui). Si no estan configurados, el volcado a Bitacora simplemente se
 * omite (no rompe la generacion de PDF).
 */
function getBitacoraWebAppUrl_() {
  return PropertiesService.getScriptProperties().getProperty('BITACORA_WEBAPP_URL') || '';
}

function getIntegrationSecret_() {
  return PropertiesService.getScriptProperties().getProperty('INTEGRATION_SECRET') || '';
}
